/**
 * engine.js — Moteur de calcul pur (dates locales, jours fériés paramétrables,
 * expansion des jours ouvrés, demi-journées, ventilation inter-périodes, soldes et validation).
 * Aucune dépendance au DOM. Compatible navigateur (window.AppEngine) et Node.js (CommonJS).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        const AppConfig = require('./config.js');
        module.exports = factory(AppConfig);
    } else {
        root.AppEngine = factory(root.AppConfig);
    }
})(typeof self !== 'undefined' ? self : this, function (AppConfig) {
    'use strict';

    // Cache mémoire des jours fériés par clé (année + options sérialisées)
    const feriesCache = new Map();

    /**
     * Parse une chaîne "YYYY-MM-DD" en Date locale à 00:00:00.000 sans décalage UTC.
     * @param {string} dateStr
     * @returns {Date|null}
     */
    function parseLocalDate(dateStr) {
        if (typeof dateStr !== 'string') return null;
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
        if (!match) return null;

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);

        if (month < 1 || month > 12 || day < 1 || day > 31) return null;

        const d = new Date(year, month - 1, day, 0, 0, 0, 0);
        // Vérifie que la date existe réellement (ex: rejette 2026-02-30)
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
            return null;
        }
        return d;
    }

    /**
     * Formate un objet Date local en "YYYY-MM-DD".
     * @param {Date} date
     * @returns {string}
     */
    function formatLocalDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Retourne la période CP ("YYYY") associée à une date ("YYYY-MM-DD").
     * Règle : du 1er juin N au 31 mai N+1 -> période N.
     * @param {string|Date} dateOrStr
     * @returns {string}
     */
    function getCPPeriod(dateOrStr) {
        const d = dateOrStr instanceof Date ? dateOrStr : parseLocalDate(dateOrStr);
        if (!d) return '';
        const y = d.getFullYear();
        return d.getMonth() < 5 ? String(y - 1) : String(y);
    }

    /**
     * Retourne la période RTT ("YYYY") associée à une date ("YYYY-MM-DD").
     * Règle : année civile du 1er janvier N au 31 décembre N -> période N.
     * @param {string|Date} dateOrStr
     * @returns {string}
     */
    function getRTTPeriod(dateOrStr) {
        const d = dateOrStr instanceof Date ? dateOrStr : parseLocalDate(dateOrStr);
        if (!d) return '';
        return String(d.getFullYear());
    }

    /**
     * Formate le libellé d'une période CP.
     * @param {string|number} year
     * @returns {string}
     */
    function formatCPPeriod(year) {
        const y = parseInt(year, 10);
        return `Juin ${y} - Mai ${y + 1}`;
    }

    /**
     * Calcule la date du dimanche de Pâques pour une année donnée (algorithme de Butcher-Meeus).
     * @param {number} year
     * @returns {Date}
     */
    function getEasterSunday(year) {
        const n = year % 19;
        const c = Math.floor(year / 100);
        const u = year % 100;
        const s = Math.floor(c / 4);
        const t = c % 4;
        const p = Math.floor((c + 8) / 25);
        const q = Math.floor((c - p + 1) / 3);
        const e = (19 * n + c - s - q + 15) % 30;
        const b = Math.floor(u / 4);
        const d = u % 4;
        const L = (32 + 2 * t + 2 * b - e - d) % 7;
        const m = Math.floor((n + 11 * e + 22 * L) / 451);
        const moisPaques = Math.floor((e + L - 7 * m + 114) / 31);
        const jourPaques = ((e + L - 7 * m + 114) % 31) + 1;
        return new Date(year, moisPaques - 1, jourPaques, 0, 0, 0, 0);
    }

    const MOIS_NOMS_FR = [
        'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];

    /**
     * Formate une plage de dates au format français naturel.
     * Cas 1 (date unique) : "25 septembre 2026"
     * Cas 2 (même mois et même année) : "5–9 octobre 2026"
     * Cas 3 (mois différents, même année) : "28 octobre – 3 novembre 2026"
     * Cas 4 (années différentes) : "28 décembre 2026 – 4 janvier 2027"
     *
     * @param {string|Date} startDateOrStr
     * @param {string|Date} [endDateOrStr]
     * @returns {string}
     */
    function formaterPlageDateFR(startDateOrStr, endDateOrStr) {
        const d1 = startDateOrStr instanceof Date ? startDateOrStr : parseLocalDate(startDateOrStr);
        if (!d1) return '';
        const d2 = endDateOrStr
            ? (endDateOrStr instanceof Date ? endDateOrStr : parseLocalDate(endDateOrStr))
            : d1;

        if (!d2 || d1.getTime() === d2.getTime()) {
            return `${d1.getDate()} ${MOIS_NOMS_FR[d1.getMonth()]} ${d1.getFullYear()}`;
        }

        const startDay = d1.getDate();
        const endDay = d2.getDate();
        const startMonth = d1.getMonth();
        const endMonth = d2.getMonth();
        const startYear = d1.getFullYear();
        const endYear = d2.getFullYear();

        if (startYear === endYear && startMonth === endMonth) {
            return `${startDay}–${endDay} ${MOIS_NOMS_FR[startMonth]} ${startYear}`;
        }

        if (startYear === endYear) {
            return `${startDay} ${MOIS_NOMS_FR[startMonth]} – ${endDay} ${MOIS_NOMS_FR[endMonth]} ${startYear}`;
        }

        return `${startDay} ${MOIS_NOMS_FR[startMonth]} ${startYear} – ${endDay} ${MOIS_NOMS_FR[endMonth]} ${endYear}`;
    }

    /**
     * Retourne la liste des jours fériés ("YYYY-MM-DD") pour une année donnée,
     * paramétrée via config.js (par défaut : lundiPentecoteTravaille = true).
     * @param {number|string} year
     * @param {Object} [options]
     * @returns {string[]}
     */
    function getJoursFeries(year, options) {
        const y = Number(year);
        const opts = AppConfig && AppConfig.getFeriesOptions
            ? AppConfig.getFeriesOptions(options)
            : {
                lundiPentecoteTravaille: options && typeof options.lundiPentecoteTravaille === 'boolean'
                    ? options.lundiPentecoteTravaille
                    : true,
                joursFeriesFixes: ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'],
                inclureLundiPaques: true,
                inclureAscension: true
            };

        const cacheKey = `${y}:${opts.lundiPentecoteTravaille}:${opts.inclureLundiPaques}:${opts.inclureAscension}:${opts.joursFeriesFixes.join(',')}`;
        if (feriesCache.has(cacheKey)) {
            return feriesCache.get(cacheKey);
        }

        const feries = opts.joursFeriesFixes.map(mmDd => `${y}-${mmDd}`);
        const paques = getEasterSunday(y);

        if (opts.inclureLundiPaques) {
            const lundiPaques = new Date(paques);
            lundiPaques.setDate(paques.getDate() + 1);
            feries.push(formatLocalDate(lundiPaques));
        }

        if (opts.inclureAscension) {
            const ascension = new Date(paques);
            ascension.setDate(paques.getDate() + 39);
            feries.push(formatLocalDate(ascension));
        }

        // Lundi de Pentecôte : uniquement férié si lundiPentecoteTravaille === false
        if (!opts.lundiPentecoteTravaille) {
            const pentecote = new Date(paques);
            pentecote.setDate(paques.getDate() + 50);
            feries.push(formatLocalDate(pentecote));
        }

        feries.sort();
        feriesCache.set(cacheKey, feries);
        return feries;
    }

    /**
     * Indique si une date est un week-end (samedi ou dimanche).
     * @param {Date|string} dateOrStr
     * @returns {boolean}
     */
    function isWeekend(dateOrStr) {
        const d = dateOrStr instanceof Date ? dateOrStr : parseLocalDate(dateOrStr);
        if (!d) return false;
        const day = d.getDay();
        return day === 0 || day === 6;
    }

    /**
     * Indique si une date est un jour férié (selon la configuration active).
     * @param {Date|string} dateOrStr
     * @param {Object} [options]
     * @returns {boolean}
     */
    function isHoliday(dateOrStr, options) {
        const d = dateOrStr instanceof Date ? dateOrStr : parseLocalDate(dateOrStr);
        if (!d) return false;
        const dateStr = formatLocalDate(d);
        return getJoursFeries(d.getFullYear(), options).includes(dateStr);
    }

    /**
     * Fusionne une liste de plages de fermetures (intervalles [debut, fin]) pour éviter les doublons ou chevauchements.
     * @param {Array<{ debut: string, fin: string, libelle?: string, id?: any }>} [joursFermeture]
     * @returns {Array<{ debut: string, fin: string, libelle?: string }>}
     */
    function fusionnerPlagesFermeture(joursFermeture) {
        if (!Array.isArray(joursFermeture) || joursFermeture.length === 0) return [];
        const validRanges = [];
        for (const item of joursFermeture) {
            if (!item || typeof item !== 'object') continue;
            const debut = typeof item.debut === 'string' ? item.debut.trim() : '';
            const fin = typeof item.fin === 'string' ? item.fin.trim() : (typeof item.dateFin === 'string' ? item.dateFin.trim() : debut);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) continue;
            const start = debut <= fin ? debut : fin;
            const end = debut <= fin ? fin : debut;
            validRanges.push({ start, end, libelle: item.libelle || '' });
        }
        if (validRanges.length === 0) return [];
        validRanges.sort((a, b) => a.start.localeCompare(b.start));

        const merged = [];
        let cur = { ...validRanges[0] };
        for (let i = 1; i < validRanges.length; i++) {
            const next = validRanges[i];
            if (next.start <= cur.end) {
                if (next.end > cur.end) {
                    cur.end = next.end;
                }
                if (next.libelle && !cur.libelle.includes(next.libelle)) {
                    cur.libelle = cur.libelle ? `${cur.libelle} / ${next.libelle}` : next.libelle;
                }
            } else {
                merged.push({ debut: cur.start, fin: cur.end, libelle: cur.libelle });
                cur = { ...next };
            }
        }
        merged.push({ debut: cur.start, fin: cur.end, libelle: cur.libelle });
        return merged;
    }

    /**
     * Construit une Map de toutes les dates de fermeture (YYYY-MM-DD -> libelle) à partir des plages.
     * @param {Array} [joursFermeture]
     * @returns {Map<string, string>}
     */
    function buildClosureDatesMap(joursFermeture) {
        const map = new Map();
        const merged = fusionnerPlagesFermeture(joursFermeture);
        for (const range of merged) {
            const cur = parseLocalDate(range.debut);
            const end = parseLocalDate(range.fin);
            if (!cur || !end) continue;
            const endMs = end.getTime();
            let guard = 0;
            while (cur.getTime() <= endMs && guard < 1000) {
                const dateStr = formatLocalDate(cur);
                if (!map.has(dateStr)) {
                    map.set(dateStr, range.libelle || 'Fermeture entreprise');
                }
                cur.setDate(cur.getDate() + 1);
                guard++;
            }
        }
        return map;
    }

    /**
     * Indique si une date est un jour de fermeture de l'entreprise.
     * @param {Date|string} dateOrStr
     * @param {Object} [options]
     * @returns {boolean}
     */
    function isClosureDay(dateOrStr, options) {
        if (!options || !Array.isArray(options.joursFermeture) || options.joursFermeture.length === 0) {
            return false;
        }
        const d = dateOrStr instanceof Date ? dateOrStr : parseLocalDate(dateOrStr);
        if (!d) return false;
        const dateStr = formatLocalDate(d);
        if (options._closureMap instanceof Map) {
            return options._closureMap.has(dateStr);
        }
        const closureMap = buildClosureDatesMap(options.joursFermeture);
        return closureMap.has(dateStr);
    }

    /**
     * Indique si une date est un jour ouvré (ni week-end ni jour férié chômé).
     * Les fermetures d'entreprise ne retirent pas la qualité de jour ouvré décomptable (CP/RTT peuvent y être posés).
     * @param {Date|string} dateOrStr
     * @param {Object} [options]
     * @returns {boolean}
     */
    function isWorkingDay(dateOrStr, options) {
        const d = dateOrStr instanceof Date ? dateOrStr : parseLocalDate(dateOrStr);
        if (!d) return false;
        return !isWeekend(d) && !isHoliday(d, options);
    }

    /**
     * Déroule une absence jour par jour ouvré.
     * - Si la date de début tombe un week-end ou un jour férié, la décale automatiquement
     *   au premier jour ouvré suivant et signale `shifted: true`.
     * - Gère les demi-journées (0.5, 1.5, etc.) en attribuant un poids `weight` (1 ou 0.5) à chaque jour ouvré.
     * - Rattache chaque jour ouvré à sa propre période CP (1er juin) et RTT (1er janvier).
     *
     * @param {{ id?: number, type: string, date: string, duree: number }} absence
     * @param {Object} [options]
     * @returns {{
     *   originalDate: string,
     *   effectiveStartDate: string,
     *   endDate: string,
     *   shifted: boolean,
     *   shiftReason: string|null,
     *   skippedHolidays: string[],
     *   skippedWeekendDays: number,
     *   skippedClosureDays: string[],
     *   days: Array<{ date: string, weight: number, cpPeriod: string, rttPeriod: string, absence: Object }>
     * }}
     */
    function expandAbsenceDays(absence, options) {
        const startDate = parseLocalDate(absence?.date);
        const totalDuree = Number(absence?.duree);

        if (!startDate || !Number.isFinite(totalDuree) || totalDuree <= 0) {
            return {
                originalDate: absence?.date || '',
                effectiveStartDate: absence?.date || '',
                endDate: absence?.date || '',
                shifted: false,
                shiftReason: null,
                skippedHolidays: [],
                skippedWeekendDays: 0,
                skippedClosureDays: [],
                days: []
            };
        }

        const cDate = new Date(startDate);
        let shiftReason = null;

        // 1. Si la date de début tombe un week-end ou un férié, décaler au 1er jour ouvré suivant
        if (!isWorkingDay(cDate, options)) {
            if (isHoliday(cDate, options)) {
                shiftReason = 'ferie';
            } else {
                shiftReason = 'weekend';
            }
            let guard = 0;
            while (!isWorkingDay(cDate, options) && guard < 366) {
                cDate.setDate(cDate.getDate() + 1);
                guard++;
            }
        }

        const effectiveStartDate = formatLocalDate(cDate);
        const shifted = effectiveStartDate !== absence.date;

        // 2. Dérouler les jours ouvrés couverts
        let dureeRestante = Math.round(totalDuree * 2) / 2;
        const days = [];
        const skippedHolidays = [];
        const skippedClosureDays = [];
        let skippedWeekendDays = 0;
        let pendingHolidayDates = [];
        let pendingWeekends = 0;
        let iterations = 0;

        while (dureeRestante > 0 && iterations < 1000) {
            iterations++;
            const currentStr = formatLocalDate(cDate);
            const wknd = isWeekend(cDate);
            const ferie = isHoliday(cDate, options);

            if (!wknd && !ferie) {
                // On ne comptabilise les week-ends/fériés sautés que s'ils sont compris ENTRE deux jours ouvrés posés
                if (days.length > 0) {
                    skippedHolidays.push(...pendingHolidayDates);
                    skippedWeekendDays += pendingWeekends;
                }
                pendingHolidayDates = [];
                pendingWeekends = 0;

                const weight = dureeRestante >= 1 ? 1 : 0.5;
                days.push({
                    date: currentStr,
                    weight,
                    cpPeriod: getCPPeriod(cDate),
                    rttPeriod: getRTTPeriod(cDate),
                    absence
                });
                dureeRestante = Math.round((dureeRestante - weight) * 100) / 100;
            } else {
                if (ferie && !wknd) {
                    pendingHolidayDates.push(currentStr);
                } else if (wknd) {
                    pendingWeekends++;
                }
            }

            cDate.setDate(cDate.getDate() + 1);
        }

        const endDate = days.length > 0 ? days[days.length - 1].date : effectiveStartDate;

        return {
            originalDate: absence.date,
            effectiveStartDate,
            endDate,
            shifted,
            shiftReason,
            skippedHolidays,
            skippedWeekendDays,
            skippedClosureDays,
            days
        };
    }

    /**
     * Calcule les soldes CP et RTT pour les périodes demandées en ventilant chaque jour ouvré
     * sur sa période respective (CP au 1er juin, RTT au 1er janvier).
     * Autorise les soldes négatifs et renseigne les indicateurs `isNegativeCP`, `isNegativeRTT` et `isNegative`.
     *
     * @param {Object} appData
     * @param {string|number} currentCPPeriod
     * @param {string|number} currentRTTPeriod
     * @param {Object} [options]
     */
    function calculerSoldes(appData, currentCPPeriod, currentRTTPeriod, options) {
        const cpKey = String(currentCPPeriod);
        const rttKey = String(currentRTTPeriod);

        const initCP = Number(appData?.configCP?.[cpKey]) || 0;
        const initRTT = Number(appData?.configRTT?.[rttKey]) || 0;

        let prisCP = 0;
        let prisRTT = 0;

        const absences = Array.isArray(appData?.absences) ? appData.absences : [];
        for (const a of absences) {
            const expanded = expandAbsenceDays(a, options);
            for (const d of expanded.days) {
                if (a.type === 'CP' && d.cpPeriod === cpKey) {
                    prisCP += d.weight;
                } else if (a.type === 'RTT' && d.rttPeriod === rttKey) {
                    prisRTT += d.weight;
                }
            }
        }

        prisCP = Math.round(prisCP * 100) / 100;
        prisRTT = Math.round(prisRTT * 100) / 100;

        const resteCP = Math.round((initCP - prisCP) * 100) / 100;
        const resteRTT = Math.round((initRTT - prisRTT) * 100) / 100;

        // Jauge cohérente "Reste / Total" (bornée entre 0 et 100%)
        const pctResteCP = initCP > 0 ? Math.max(0, Math.min(100, Math.round((resteCP / initCP) * 100))) : 0;
        const pctResteRTT = initRTT > 0 ? Math.max(0, Math.min(100, Math.round((resteRTT / initRTT) * 100))) : 0;

        const isNegativeCP = resteCP < 0;
        const isNegativeRTT = resteRTT < 0;

        return {
            initCP,
            prisCP,
            resteCP,
            pctResteCP,
            isNegativeCP,
            initRTT,
            prisRTT,
            resteRTT,
            pctResteRTT,
            isNegativeRTT,
            isNegative: isNegativeCP || isNegativeRTT
        };
    }

    /**
     * Construit la carte des jours couverts par l'ensemble des absences pour l'affichage calendrier
     * et la détection de chevauchements (gère le cumul de deux demi-journées sur une même date).
     *
     * @param {Array} absences
     * @param {Object} [options]
     * @returns {Map<string, { totalWeight: number, entries: Array<{ weight: number, absence: Object }> }>}
     */
    function buildCalendarCoveredDays(absences, options) {
        const map = new Map();
        if (!Array.isArray(absences)) return map;

        for (const a of absences) {
            const expanded = expandAbsenceDays(a, options);
            for (const d of expanded.days) {
                const existing = map.get(d.date) || { totalWeight: 0, entries: [] };
                existing.totalWeight = Math.round((existing.totalWeight + d.weight) * 100) / 100;
                existing.entries.push({ weight: d.weight, absence: a });
                map.set(d.date, existing);
            }
        }
        return map;
    }

    /**
     * Valide une nouvelle absence et calcule son impact (sans bloquer les soldes négatifs).
     * - Vérifie le type ('CP' ou 'RTT'), la validité de la date, la durée (> 0, <= 365, multiple de 0.5).
     * - Vérifie qu'aucun jour ouvré couvert ne dépasse un poids cumulé de 1.0 jour avec les absences existantes
     *   (autorise 2 demi-journées de 0.5 le même jour, bloque au-delà).
     * - Signale le décalage automatique si la date de début choisie tombe un week-end ou un férié.
     * - Calcule l'indicateur `isNegative` si `appData` est fourni.
     *
     * @param {{ id?: number, type: string, date: string, duree: number }} absence
     * @param {Array} [existingAbsences]
     * @param {Object} [options]
     * @param {Object} [appData]
     */
    function validerAbsence(absence, existingAbsences = [], options = {}, appData = null) {
        const validTypes = AppConfig && AppConfig.TYPES_VALIDES ? AppConfig.TYPES_VALIDES : new Set(['CP', 'RTT']);
        if (!absence || !validTypes.has(absence.type)) {
            return { valid: false, error: "Type d'absence invalide." };
        }

        const parsedDate = parseLocalDate(absence.date);
        if (!parsedDate) {
            return { valid: false, error: 'Date invalide.' };
        }

        const duree = Number(absence.duree);
        if (!Number.isFinite(duree) || duree <= 0) {
            return { valid: false, error: 'Durée invalide.' };
        }
        if (duree > 365) {
            return { valid: false, error: 'Durée maximale : 365 jours.' };
        }
        // Multiple exact de 0.5
        if (Math.abs(duree * 2 - Math.round(duree * 2)) > 1e-9) {
            return { valid: false, error: 'La durée doit être un multiple de 0,5 jour.' };
        }

        const excludeId = options && options.excludeId !== undefined && options.excludeId !== null
            ? Number(options.excludeId)
            : (absence.id !== undefined && absence.id !== null ? Number(absence.id) : null);

        const filteredExisting = Array.isArray(existingAbsences)
            ? existingAbsences.filter(a => excludeId === null || Number(a.id) !== excludeId)
            : [];

        const expansion = expandAbsenceDays({ ...absence, duree }, options);
        const coveredMap = buildCalendarCoveredDays(filteredExisting, options);

        for (const d of expansion.days) {
            const current = coveredMap.get(d.date);
            const currentWeight = current ? current.totalWeight : 0;
            if (Math.round((currentWeight + d.weight) * 100) / 100 > 1) {
                return {
                    valid: false,
                    error: `Chevauchement détecté sur le ${d.date} (déjà ${currentWeight} j posé).`
                };
            }
        }

        // Simulation du solde après ajout ou modification (sans blocage si négatif)
        let projectedNegative = false;
        let projectedBalances = {};
        if (appData) {
            const simulatedData = {
                ...appData,
                absences: [...filteredExisting, { ...absence, date: expansion.effectiveStartDate, duree }]
            };
            const affectedPeriods = new Set(
                expansion.days.map(d => (absence.type === 'CP' ? d.cpPeriod : d.rttPeriod))
            );
            for (const period of affectedPeriods) {
                const s = calculerSoldes(simulatedData, period, period, options);
                const reste = absence.type === 'CP' ? s.resteCP : s.resteRTT;
                projectedBalances[period] = reste;
                if (reste < 0) projectedNegative = true;
            }
        }

        return {
            valid: true,
            error: null,
            shifted: expansion.shifted,
            shiftReason: expansion.shiftReason,
            originalDate: expansion.originalDate,
            effectiveStartDate: expansion.effectiveStartDate,
            endDate: expansion.endDate,
            expansion,
            isNegative: projectedNegative,
            projectedBalances
        };
    }

    /**
     * Retourne la liste triée (décroissante) de toutes les périodes CP et RTT disponibles,
     * incluant à la fois les périodes configurées, la période courante et les périodes touchées par des absences.
     *
     * @param {Object} appData
     * @param {string} currentCPPeriod
     * @param {string} currentRTTPeriod
     * @param {Object} [options]
     * @returns {{ cpPeriods: string[], rttPeriods: string[] }}
     */
    function getAvailablePeriods(appData, currentCPPeriod, currentRTTPeriod, options) {
        const cpSet = new Set(Object.keys(appData?.configCP || {}));
        const rttSet = new Set(Object.keys(appData?.configRTT || {}));

        if (currentCPPeriod) cpSet.add(String(currentCPPeriod));
        if (currentRTTPeriod) rttSet.add(String(currentRTTPeriod));

        const absences = Array.isArray(appData?.absences) ? appData.absences : [];
        for (const a of absences) {
            const expanded = expandAbsenceDays(a, options);
            for (const d of expanded.days) {
                if (a.type === 'CP' && d.cpPeriod) cpSet.add(d.cpPeriod);
                if (a.type === 'RTT' && d.rttPeriod) rttSet.add(d.rttPeriod);
            }
        }

        return {
            cpPeriods: Array.from(cpSet).sort().reverse(),
            rttPeriods: Array.from(rttSet).sort().reverse()
        };
    }

    /**
     * Calcule le décompte détaillé (années, mois, jours) jusqu'à une date cible.
     * @param {string|Date} targetDate
     * @param {Date} [referenceDate]
     */
    function getDetailedCountdown(targetDate, referenceDate = new Date()) {
        const d1 = new Date(referenceDate);
        d1.setHours(0, 0, 0, 0);
        const d2 = targetDate instanceof Date ? new Date(targetDate) : parseLocalDate(targetDate) || new Date(targetDate);
        d2.setHours(0, 0, 0, 0);

        if (d1 >= d2) return { over: true, years: 0, months: 0, days: 0 };

        let years = d2.getFullYear() - d1.getFullYear();
        let months = d2.getMonth() - d1.getMonth();
        let days = d2.getDate() - d1.getDate();

        if (days < 0) {
            months--;
            const prevMonthDays = new Date(d2.getFullYear(), d2.getMonth(), 0).getDate();
            days += prevMonthDays;
        }
        if (months < 0) {
            years--;
            months += 12;
        }

        return { over: false, years, months, days };
    }

    function formatDetailedCountdown(targetDate, referenceDate = new Date()) {
        const cd = getDetailedCountdown(targetDate, referenceDate);
        if (cd.over) return "C'est l'heure !";
        const parts = [];
        if (cd.years > 0) parts.push(`${cd.years} an${cd.years > 1 ? 's' : ''}`);
        if (cd.months > 0) parts.push(`${cd.months} mois`);
        if (cd.days > 0) parts.push(`${cd.days} jour${cd.days > 1 ? 's' : ''}`);
        return parts.join(', ') || "Aujourd'hui !";
    }

    /**
     * Compte le nombre de jours ouvrés (inclusifs) entre deux dates locales (`startDate` et `endDate`).
     * Exclut les week-ends (samedi/dimanche) et les jours fériés chômés selon `options` (dont `lundiPentecoteTravaille`).
     * Retourne `0` si `startDate > endDate` ou si les dates sont invalides (jamais de nombre négatif).
     *
     * @param {string|Date} startDateOrStr
     * @param {string|Date} endDateOrStr
     * @param {Object} [options]
     * @returns {number}
     */
    function compterJoursOuvresEntre(startDateOrStr, endDateOrStr, options = {}) {
        const start = startDateOrStr instanceof Date
            ? new Date(startDateOrStr.getFullYear(), startDateOrStr.getMonth(), startDateOrStr.getDate(), 0, 0, 0, 0)
            : parseLocalDate(startDateOrStr);
        const end = endDateOrStr instanceof Date
            ? new Date(endDateOrStr.getFullYear(), endDateOrStr.getMonth(), endDateOrStr.getDate(), 0, 0, 0, 0)
            : parseLocalDate(endDateOrStr);

        if (!start || !end || start.getTime() > end.getTime()) {
            return 0;
        }

        const feriesByYear = new Map();
        function getHolidaysSet(year) {
            if (!feriesByYear.has(year)) {
                feriesByYear.set(year, new Set(getJoursFeries(year, options)));
            }
            return feriesByYear.get(year);
        }

        let count = 0;
        const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
        const endMs = end.getTime();

        while (cursor.getTime() <= endMs) {
            if (!isWeekend(cursor)) {
                const y = cursor.getFullYear();
                const dateStr = formatLocalDate(cursor);
                if (!getHolidaysSet(y).has(dateStr)) {
                    count++;
                }
            }
            cursor.setDate(cursor.getDate() + 1);
        }

        return count;
    }

    /**
     * Résout la date d'échéance de report des CP pour une période CP donnée (`cpPeriod`, ex: `'2026'`).
     * Par défaut `'05-31'` de l'année `Number(cpPeriod) + 1` (soit `2027-05-31`).
     * Gère les années non bissextiles si `'02-29'` est configuré.
     *
     * @param {string|number} cpPeriod
     * @param {string} [echeanceReportCP='05-31']
     * @returns {Date}
     */
    function resolveCPDeadlineDate(cpPeriod, echeanceReportCP = '05-31') {
        const targetYear = (Number(cpPeriod) || new Date().getFullYear()) + 1;
        const normalized = AppConfig && typeof AppConfig.getAlertOptions === 'function'
            ? AppConfig.getAlertOptions({ echeanceReportCP }).echeanceReportCP
            : (/^\d{2}-\d{2}$/.test(String(echeanceReportCP || '')) ? String(echeanceReportCP) : '05-31');

        const [mStr, dStr] = normalized.split('-');
        const month = Number(mStr);
        const maxDayInMonth = new Date(targetYear, month, 0).getDate();
        const day = Math.min(Number(dStr), maxDayInMonth);
        return new Date(targetYear, month - 1, day, 0, 0, 0, 0);
    }

    /**
     * Calcule les alertes d'expiration des soldes CP (31 mai par défaut ou paramétrable) et RTT (31 décembre)
     * à partir d'une date de référence injectée (`referenceDate`) pour garantir des tests déterministes.
     *
     * Règles métier (Lot B) :
     * - Seuil d'alerte réglable (`seuilAlerteJours`, défaut `60` jours calendaires).
     * - Échéance de report CP paramétrable (`echeanceReportCP`, défaut `'05-31'`).
     * - Compte des jours ouvrés restants (`joursOuvresRestants`) excluant week-ends et fériés et respectant `lundiPentecoteTravaille`.
     * - Le jour même de l'échéance (`joursCalendairesRestants === 0`), l'alerte reste active si `reste > 0`.
     * - Le lendemain de l'échéance (`referenceDate > deadline`), aucune alerte ne s'affiche et aucun nombre négatif n'est retourné (`0`).
     *
     * @param {Object} appData
     * @param {string|Date} [referenceDate=new Date()]
     * @param {Object} [options={}]
     */
    function calculerAlertesExpiration(appData, referenceDate = new Date(), options = {}) {
        const refDate = referenceDate instanceof Date
            ? new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 0, 0, 0, 0)
            : (parseLocalDate(referenceDate) || new Date());
        refDate.setHours(0, 0, 0, 0);

        const alertPrefs = AppConfig && typeof AppConfig.getAlertOptions === 'function'
            ? AppConfig.getAlertOptions(options)
            : {
                seuilAlerteJours: typeof options.seuilAlerteJours === 'number' ? Math.max(0, Math.round(options.seuilAlerteJours)) : 60,
                echeanceReportCP: typeof options.echeanceReportCP === 'string' ? options.echeanceReportCP : '05-31'
            };

        const { seuilAlerteJours, echeanceReportCP } = alertPrefs;
        const cpPeriod = String(options.cpPeriod || getCPPeriod(refDate));
        const rttPeriod = String(options.rttPeriod || getRTTPeriod(refDate));

        const soldes = calculerSoldes(appData, cpPeriod, rttPeriod, options);

        const cpDeadlineDate = resolveCPDeadlineDate(cpPeriod, echeanceReportCP);
        const rttDeadlineDate = new Date(Number(rttPeriod) || refDate.getFullYear(), 11, 31, 0, 0, 0, 0);

        function buildAlertItem(type, reste, period, deadlineDate) {
            const deadlineStr = formatLocalDate(deadlineDate);
            const refUtc = Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
            const deadlineUtc = Date.UTC(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
            const rawDiffDays = Math.round((deadlineUtc - refUtc) / 86400000);

            if (rawDiffDays < 0 || reste <= 0) {
                return {
                    type,
                    period,
                    active: false,
                    reste: Math.max(0, Number(reste) || 0),
                    deadline: deadlineStr,
                    joursCalendairesRestants: 0,
                    joursOuvresRestants: 0,
                    message: ''
                };
            }

            const joursCalendairesRestants = rawDiffDays;
            const joursOuvresRestants = compterJoursOuvresEntre(refDate, deadlineDate, options);
            const active = reste > 0 && joursCalendairesRestants <= seuilAlerteJours;
            const deadlineFr = deadlineDate.toLocaleDateString('fr-FR');
            const resteFormatted = reste % 1 === 0 ? String(reste) : reste.toFixed(1);
            const echeanceLabel = joursCalendairesRestants === 0
                ? `aujourd'hui (${deadlineFr})`
                : `dans ${joursCalendairesRestants} j calendaire${joursCalendairesRestants > 1 ? 's' : ''} (échéance ${deadlineFr})`;

            const message = active
                ? `${type} (${type === 'CP' ? formatCPPeriod(period) : period}) : il vous reste ${resteFormatted} jour${reste > 1 ? 's' : ''} à poser ${echeanceLabel}, soit ${joursOuvresRestants} jour${joursOuvresRestants > 1 ? 's' : ''} ouvré${joursOuvresRestants > 1 ? 's' : ''} disponible${joursOuvresRestants > 1 ? 's' : ''}.`
                : '';

            return {
                type,
                period,
                active,
                reste,
                deadline: deadlineStr,
                joursCalendairesRestants,
                joursOuvresRestants,
                message
            };
        }

        const cpAlert = buildAlertItem('CP', soldes.resteCP, cpPeriod, cpDeadlineDate);
        const rttAlert = buildAlertItem('RTT', soldes.resteRTT, rttPeriod, rttDeadlineDate);
        const alerts = [rttAlert, cpAlert].filter(a => a.active);

        return {
            referenceDate: formatLocalDate(refDate),
            seuilAlerteJours,
            echeanceReportCP,
            cp: cpAlert,
            rtt: rttAlert,
            alerts
        };
    }

    /**
     * Filtre et trie l'historique des absences par type ('ALL' | 'CP' | 'RTT') et par période ('ALL' | année).
     * - Fonction pure en lecture seule : ne modifie jamais le tableau `absences` d'origine.
     * - Réinitialise automatiquement `effectivePeriod` à `'ALL'` si la période filtrée n'existe plus dans `absences`.
     *
     * @param {Array} absences
     * @param {{ type?: string, period?: string }} [filters={}]
     * @param {Object} [options={}]
     */
    function filtrerAbsencesHistorique(absences, filters = {}, options = {}) {
        const safeList = Array.isArray(absences) ? absences.map(a => ({ ...a })) : [];
        const rawType = filters && typeof filters.type === 'string' ? filters.type.toUpperCase() : 'ALL';
        const effectiveType = rawType === 'CP' || rawType === 'RTT' ? rawType : 'ALL';
        const requestedPeriod = filters && filters.period ? String(filters.period) : 'ALL';

        // Collecte des périodes réellement présentes dans l'historique
        const periodSet = new Set();
        const expandedByAbsence = new Map();

        for (const a of safeList) {
            const expanded = expandAbsenceDays(a, options);
            const periodsForAbsence = new Set();
            if (expanded.days.length > 0) {
                for (const d of expanded.days) {
                    const p = a.type === 'CP' ? d.cpPeriod : d.rttPeriod;
                    if (p) {
                        periodSet.add(String(p));
                        periodsForAbsence.add(String(p));
                    }
                }
            } else if (a.date) {
                const fallbackP = a.type === 'CP' ? getCPPeriod(a.date) : getRTTPeriod(a.date);
                if (fallbackP) {
                    periodSet.add(String(fallbackP));
                    periodsForAbsence.add(String(fallbackP));
                }
            }
            expandedByAbsence.set(a, { expanded, periods: periodsForAbsence });
        }

        const availablePeriods = Array.from(periodSet).sort().reverse();
        const effectivePeriod =
            requestedPeriod !== 'ALL' && availablePeriods.includes(requestedPeriod)
                ? requestedPeriod
                : 'ALL';

        const filtered = safeList.filter(a => {
            if (effectiveType !== 'ALL' && a.type !== effectiveType) {
                return false;
            }
            if (effectivePeriod !== 'ALL') {
                const meta = expandedByAbsence.get(a);
                if (!meta || !meta.periods.has(effectivePeriod)) {
                    return false;
                }
            }
            return true;
        });

        filtered.sort((a, b) => {
            const da = parseLocalDate(a.date) || new Date(0);
            const db = parseLocalDate(b.date) || new Date(0);
            return db - da;
        });

        return {
            items: filtered,
            availablePeriods,
            effectiveType,
            effectivePeriod
        };
    }

    /**
     * Simule la pose d'une absence sur une copie immuable de `appData` (Lot C).
     * - Ne modifie jamais `appData` ni ses tableaux/objets internes.
     * - Accepte soit `dateDebut` + `duree`, soit `dateDebut` + `dateFin` (calcule alors la durée en jours ouvrés via `compterJoursOuvresEntre`).
     * - Réutilise `expandAbsenceDays` et `validerAbsence` (décalage week-end/férié, demi-journées, ventilation CP/RTT).
     *
     * @param {Object} appData
     * @param {{ type?: string, dateDebut?: string, date?: string, duree?: number, dateFin?: string }} params
     * @param {Object} [options={}]
     */
    function simulerAbsence(appData, params = {}, options = {}) {
        const immutableCopy = appData && typeof appData === 'object'
            ? JSON.parse(JSON.stringify(appData))
            : { absences: [], configCP: {}, configRTT: {} };

        const type = params && typeof params.type === 'string' ? params.type.toUpperCase() : 'CP';
        const rawStart = params.dateDebut || params.date || '';
        const rawEnd = params.dateFin || '';
        const startObj = parseLocalDate(rawStart);

        if (!startObj) {
            return { valid: false, error: 'Date de début invalide.' };
        }

        let resolvedDuree = Number(params.duree);
        const mode = rawEnd ? 'range' : 'duration';

        if (rawEnd) {
            const endObj = parseLocalDate(rawEnd);
            if (!endObj) {
                return { valid: false, error: 'Date de fin invalide.' };
            }
            if (endObj.getTime() < startObj.getTime()) {
                return { valid: false, error: 'La date de fin doit être postérieure ou égale à la date de début.' };
            }
            const workingDaysCount = compterJoursOuvresEntre(startObj, endObj, options);
            if (workingDaysCount <= 0) {
                return { valid: false, error: 'Aucun jour ouvré sur la plage sélectionnée.' };
            }
            resolvedDuree = workingDaysCount;
        }

        const validation = validerAbsence(
            { type, date: formatLocalDate(startObj), duree: resolvedDuree },
            immutableCopy.absences || [],
            options,
            immutableCopy
        );

        if (!validation.valid) {
            return {
                valid: false,
                error: validation.error,
                mode,
                type,
                dateDebut: formatLocalDate(startObj),
                duree: resolvedDuree
            };
        }

        const SimulatedAbsence = {
            id: -1,
            type,
            date: validation.effectiveStartDate,
            duree: resolvedDuree
        };

        const simulatedAppData = {
            ...immutableCopy,
            absences: [...(immutableCopy.absences || []), SimulatedAbsence]
        };

        // Calcul détaillé avant / après par période touchée (ventilation CP sur 1er juin / RTT sur 1er janvier)
        const ventilation = {};
        for (const d of validation.expansion.days) {
            const p = type === 'CP' ? d.cpPeriod : d.rttPeriod;
            ventilation[p] = Math.round(((ventilation[p] || 0) + d.weight) * 100) / 100;
        }

        const affectedPeriods = Object.keys(ventilation).sort();
        const detailsParPeriode = {};
        for (const p of affectedPeriods) {
            const before = calculerSoldes(immutableCopy, p, p, options);
            const after = calculerSoldes(simulatedAppData, p, p, options);
            detailsParPeriode[p] = {
                period: p,
                label: type === 'CP' ? formatCPPeriod(p) : p,
                joursPoses: ventilation[p],
                avant: type === 'CP' ? before.resteCP : before.resteRTT,
                apres: type === 'CP' ? after.resteCP : after.resteRTT,
                total: type === 'CP' ? after.initCP : after.initRTT
            };
        }

        const primaryPeriod = affectedPeriods[0] || (type === 'CP' ? getCPPeriod(validation.effectiveStartDate) : getRTTPeriod(validation.effectiveStartDate));
        const soldeRestantPrincipal = detailsParPeriode[primaryPeriod]
            ? detailsParPeriode[primaryPeriod].apres
            : 0;

        return {
            valid: true,
            error: null,
            mode,
            type,
            originalDate: validation.originalDate,
            effectiveStartDate: validation.effectiveStartDate,
            endDate: validation.endDate,
            duree: resolvedDuree,
            shifted: validation.shifted,
            shiftReason: validation.shiftReason,
            expansion: validation.expansion,
            ventilation,
            detailsParPeriode,
            projectedBalances: validation.projectedBalances,
            soldeRestantPrincipal,
            isNegative: validation.isNegative
        };
    }

    /**
     * Retourne le libellé lisible d'un jour férié à partir de sa date `YYYY-MM-DD`.
     */
    function getNomJourFerie(dateStr, year) {
        const mmDd = String(dateStr).slice(5);
        const fixedLabels = {
            '01-01': "Jour de l'An",
            '05-01': 'Fête du Travail',
            '05-08': 'Victoire 1945',
            '07-14': 'Fête Nationale',
            '08-15': 'Assomption',
            '11-01': 'Toussaint',
            '11-11': 'Armistice 1918',
            '12-25': 'Noël'
        };
        if (fixedLabels[mmDd]) return fixedLabels[mmDd];

        const easter = getEasterSunday(Number(year));
        const addDays = (base, n) => {
            const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
            return formatLocalDate(d);
        };
        if (dateStr === addDays(easter, 1)) return 'Lundi de Pâques';
        if (dateStr === addDays(easter, 39)) return 'Jeudi de l’Ascension';
        if (dateStr === addDays(easter, 50)) return 'Lundi de Pentecôte';
        return 'Jour férié';
    }

    /**
     * Suggère les ponts de 1 jour ouvré autour des jours fériés chômés d'une année (Lot C).
     * Règles métier :
     * - Respecte `lundiPentecoteTravaille` (via `getJoursFeries(year, options)`).
     * - Ignore tout jour férié tombant un week-end (samedi ou dimanche).
     * - Identifie :
     *   * les lundis ouvrés précédant un mardi férié (ex: lundi `2026-07-13` avant le mardi `2026-07-14`),
     *   * les vendredis ouvrés suivant un jeudi férié (ex: vendredi `2026-05-15` après le jeudi de l'Ascension `2026-05-14`).
     * - Exclut par défaut les dates déjà entièrement couvertes par une absence existante (sauf si `options.includeAlreadyBooked === true`).
     * - Vérifie que le solde disponible (`CP` ou `RTT`) suffit (`soldeApres >= 0`) et n'expose que les options qui ne dépassent pas le solde disponible.
     * - Indique clairement pour chaque pont le type recommandé (`type`), le solde restant après (`soldeRestantApres`), ainsi que le détail des options éligibles (`eligibleOptions`).
     *
     * @param {Object} appData
     * @param {number|string} [year]
     * @param {Object} [options={}]
     */
    function suggererPonts(appData, year = new Date().getFullYear(), options = {}) {
        const targetYear = Number(year) || new Date().getFullYear();
        const immutableCopy = appData && typeof appData === 'object'
            ? JSON.parse(JSON.stringify(appData))
            : { absences: [], configCP: {}, configRTT: {} };

        const feriesList = getJoursFeries(targetYear, options);
        const feriesSet = new Set(feriesList);
        const includeAlreadyBooked = Boolean(options && options.includeAlreadyBooked);
        const minDateStr = options && options.minDate ? String(options.minDate) : null;

        const existingAbsences = Array.isArray(immutableCopy.absences) ? immutableCopy.absences : [];
        const coveredMap = buildCalendarCoveredDays(existingAbsences, options);

        const candidateBridges = [];
        const seenBridgeDates = new Set();

        for (const ferieStr of feriesList) {
            const ferieDate = parseLocalDate(ferieStr);
            if (!ferieDate) continue;

            // Ne jamais proposer un pont pour un férié tombant un week-end (Lot C #4)
            const dow = ferieDate.getDay();
            if (dow === 0 || dow === 6) {
                continue;
            }

            let bridgeDateObj = null;
            let positionLabel = '';

            if (dow === 2) {
                // Mardi férié -> pont le lundi précédent
                bridgeDateObj = new Date(ferieDate.getFullYear(), ferieDate.getMonth(), ferieDate.getDate() - 1, 0, 0, 0, 0);
                positionLabel = 'Lundi avant mardi férié';
            } else if (dow === 4) {
                // Jeudi férié -> pont le vendredi suivant
                bridgeDateObj = new Date(ferieDate.getFullYear(), ferieDate.getMonth(), ferieDate.getDate() + 1, 0, 0, 0, 0);
                positionLabel = 'Vendredi après jeudi férié';
            }

            if (!bridgeDateObj) continue;

            const bridgeDateStr = formatLocalDate(bridgeDateObj);
            if (seenBridgeDates.has(bridgeDateStr)) continue;
            if (minDateStr && bridgeDateStr < minDateStr) continue;

            // Si le jour du pont est lui-même un jour férié chômé ou un week-end, ce n'est pas un jour à poser
            if (isWeekend(bridgeDateObj) || feriesSet.has(bridgeDateStr)) {
                continue;
            }

            const isClosure = isClosureDay(bridgeDateObj, options);
            const closureDatesMap = options._closureMap instanceof Map
                ? options._closureMap
                : buildClosureDatesMap(options.joursFermeture);
            const closureLabel = isClosure ? (closureDatesMap.get(bridgeDateStr) || 'Fermeture entreprise') : '';

            const coveredInfo = coveredMap.get(bridgeDateStr);
            const alreadyBookedWeight = coveredInfo ? coveredInfo.totalWeight : 0;
            if (!includeAlreadyBooked && alreadyBookedWeight >= 1) {
                continue;
            }

            seenBridgeDates.add(bridgeDateStr);
            const customDuree = Number(options && options.dureePont);
            const dureePont = Number.isFinite(customDuree) && customDuree > 0 ? customDuree : 1;
            candidateBridges.push({
                datePont: bridgeDateStr,
                dateFerie: ferieStr,
                nomFerie: getNomJourFerie(ferieStr, targetYear),
                positionLabel,
                duree: dureePont,
                reposTotalJours: 3 + dureePont,
                isClosure,
                closureLabel: isClosure ? closureLabel : null
            });
        }

        // Pour chaque candidat, vérifier le solde disponible réel (tenant toujours compte des absences existantes)
        // et calculer strictement soldeRestantApres = soldeAvant - dureePont sans jamais dépasser le solde disponible (Lot C #5 & #6)
        const suggestions = [];

        for (const cand of candidateBridges) {
            const cpPeriod = getCPPeriod(cand.datePont);
            const rttPeriod = getRTTPeriod(cand.datePont);
            const currentSoldes = calculerSoldes(immutableCopy, cpPeriod, rttPeriod, options);

            const eligibleOptions = [];

            // Test RTT (soldeRestantApres = soldeAvant - cand.duree)
            const soldeAvantRTT = currentSoldes.resteRTT;
            const rttRestantApres = Math.round((soldeAvantRTT - cand.duree) * 100) / 100;
            if (soldeAvantRTT >= cand.duree && rttRestantApres >= 0) {
                eligibleOptions.push({
                    type: 'RTT',
                    period: rttPeriod,
                    soldeAvant: soldeAvantRTT,
                    soldeRestantApres: rttRestantApres,
                    totalPeriode: currentSoldes.initRTT,
                    label: `RTT (${rttPeriod}) : solde avant ${soldeAvantRTT} j → solde restant après : ${rttRestantApres} j`
                });
            }

            // Test CP (soldeRestantApres = soldeAvant - cand.duree)
            const soldeAvantCP = currentSoldes.resteCP;
            const cpRestantApres = Math.round((soldeAvantCP - cand.duree) * 100) / 100;
            if (soldeAvantCP >= cand.duree && cpRestantApres >= 0) {
                eligibleOptions.push({
                    type: 'CP',
                    period: cpPeriod,
                    soldeAvant: soldeAvantCP,
                    soldeRestantApres: cpRestantApres,
                    totalPeriode: currentSoldes.initCP,
                    label: `CP (${formatCPPeriod(cpPeriod)}) : solde avant ${soldeAvantCP} j → solde restant après : ${cpRestantApres} j`
                });
            }

            // Règle Lot C #5 & #6 : un pont suggéré ne doit pas dépasser le solde disponible
            if (eligibleOptions.length === 0) {
                continue;
            }

            const primaryOption = eligibleOptions[0];
            const closureSuffix = cand.isClosure && cand.closureLabel ? ` (fermeture entreprise : ${cand.closureLabel})` : '';
            suggestions.push({
                ...cand,
                type: primaryOption.type,
                period: primaryOption.period,
                soldeAvant: primaryOption.soldeAvant,
                soldeRestantApres: primaryOption.soldeRestantApres,
                eligibleOptions,
                summary: `Poser ${cand.duree} jour${cand.duree > 1 ? 's' : ''} de ${primaryOption.type} le ${cand.datePont} (${cand.nomFerie} le ${cand.dateFerie}${closureSuffix}) → solde ${primaryOption.type} avant : ${primaryOption.soldeAvant} j, solde restant après : ${primaryOption.soldeRestantApres} j`
            });
        }

        suggestions.sort((a, b) => (a.datePont < b.datePont ? -1 : a.datePont > b.datePont ? 1 : 0));
        return suggestions;
    }

    const MOIS_LABELS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const MOIS_NOMS_COMPLETS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    /**
     * Calcule les statistiques annuelles (Lot E #1) :
     * - Ventilation jour par jour (via `expandAbsenceDays`) pour tout congé qui chevauche deux mois ou deux années.
     * - Répartition mensuelle CP / RTT (12 mois de l'année cible `year`).
     * - Mois le plus chargé (`moisPlusCharge` : mois ayant le total `cp + rtt` le plus élevé, ou `null` si 0 jour posé).
     * - Taux d'utilisation (`tauxUtilisationCP`, `tauxUtilisationRTT`, `tauxUtilisationGlobal`).
     *
     * @param {Object} appData
     * @param {number|string} [year]
     * @param {Object} [options={}]
     */
    function calculerStatistiquesAnnuelles(appData, year = new Date().getFullYear(), options = {}) {
        const targetYear = Number(year) || new Date().getFullYear();
        const yearStr = String(targetYear);
        const cpPeriod = String(options.cpPeriod || yearStr);
        const rttPeriod = String(options.rttPeriod || yearStr);

        const repartitionMensuelle = MOIS_LABELS_COURTS.map((label, idx) => ({
            mois: idx + 1,
            label,
            nomComplet: MOIS_NOMS_COMPLETS[idx],
            cp: 0,
            rtt: 0,
            total: 0
        }));

        const absences = Array.isArray(appData?.absences) ? appData.absences : [];
        let totalCPAnnee = 0;
        let totalRTTAnnee = 0;

        for (const a of absences) {
            const expanded = expandAbsenceDays(a, options);
            for (const d of expanded.days) {
                const dayYear = Number(d.date.slice(0, 4));
                if (dayYear !== targetYear) continue;
                const monthIdx = Number(d.date.slice(5, 7)) - 1;
                if (monthIdx < 0 || monthIdx > 11) continue;

                const bucket = repartitionMensuelle[monthIdx];
                if (a.type === 'CP') {
                    bucket.cp = Math.round((bucket.cp + d.weight) * 100) / 100;
                    totalCPAnnee = Math.round((totalCPAnnee + d.weight) * 100) / 100;
                } else if (a.type === 'RTT') {
                    bucket.rtt = Math.round((bucket.rtt + d.weight) * 100) / 100;
                    totalRTTAnnee = Math.round((totalRTTAnnee + d.weight) * 100) / 100;
                }
                bucket.total = Math.round((bucket.cp + bucket.rtt) * 100) / 100;
            }
        }

        const totalAnnee = Math.round((totalCPAnnee + totalRTTAnnee) * 100) / 100;

        let moisPlusCharge = null;
        for (const m of repartitionMensuelle) {
            if (m.total > 0 && (!moisPlusCharge || m.total > moisPlusCharge.total)) {
                moisPlusCharge = { ...m };
            }
        }

        const soldes = calculerSoldes(appData || {}, cpPeriod, rttPeriod, options);
        const initCP = soldes.initCP;
        const prisCP = soldes.prisCP;
        const initRTT = soldes.initRTT;
        const prisRTT = soldes.prisRTT;
        const totalInitial = Math.round((initCP + initRTT) * 100) / 100;
        const totalPrisPeriode = Math.round((prisCP + prisRTT) * 100) / 100;

        const tauxUtilisationCP = initCP > 0 ? Math.round((prisCP / initCP) * 100) : 0;
        const tauxUtilisationRTT = initRTT > 0 ? Math.round((prisRTT / initRTT) * 100) : 0;
        const tauxUtilisationGlobal = totalInitial > 0 ? Math.round((totalPrisPeriode / totalInitial) * 100) : 0;

        return {
            year: targetYear,
            cpPeriod,
            rttPeriod,
            repartitionMensuelle,
            moisPlusCharge,
            totalCPAnnee,
            totalRTTAnnee,
            totalAnnee,
            initCP,
            prisCP,
            initRTT,
            prisRTT,
            totalInitial,
            totalPrisPeriode,
            tauxUtilisationCP,
            tauxUtilisationRTT,
            tauxUtilisationGlobal
        };
    }

    function formatDateICS(dateStrOrObj) {
        const d = dateStrOrObj instanceof Date ? dateStrOrObj : parseLocalDate(dateStrOrObj);
        if (!d) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}${m}${day}`;
    }

    function addLocalDays(dateStrOrObj, daysToAdd) {
        const d = dateStrOrObj instanceof Date ? dateStrOrObj : parseLocalDate(dateStrOrObj);
        if (!d) return null;
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() + Number(daysToAdd), 0, 0, 0, 0);
    }

    /**
     * Génère un export calendrier `.ics` conforme RFC 5545 en JS pur (Lot E #2, #3, #5) :
     * - `DTSTART;VALUE=DATE:YYYYMMDD` = premier jour ouvré effectif (`effectiveStartDate`).
     * - `DTEND;VALUE=DATE:YYYYMMDD` = jour suivant le dernier jour ouvré effectif (`endDate + 1 jour`, exclusif selon RFC 5545).
     * - Un congé traversant un week-end ou un jour férié produit UN SEUL événement (`VEVENT`) couvrant la plage réelle, pas un événement par jour.
     *
     * @param {Object} appData
     * @param {Object} [options={}]
     * @returns {string}
     */
    function genererExportICS(appData, options = {}) {
        const absences = Array.isArray(appData?.absences) ? [...appData.absences] : [];
        absences.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

        const dtstamp = options.dtstamp || '20260101T000000Z';
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Suivi Conges RTT//FR',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH'
        ];

        for (const a of absences) {
            const expanded = expandAbsenceDays(a, options);
            if (!expanded.days || expanded.days.length === 0) continue;

            const dtStart = formatDateICS(expanded.effectiveStartDate);
            const exclusiveEndDate = addLocalDays(expanded.endDate, 1);
            const dtEnd = formatDateICS(exclusiveEndDate);
            const dureeStr = a.duree % 1 === 0 ? String(a.duree) : a.duree.toFixed(1);
            const uid = `absence-${a.id || dtStart}-${a.type}@suivi-conges-rtt.local`;

            lines.push(
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${dtstamp}`,
                `DTSTART;VALUE=DATE:${dtStart}`,
                `DTEND;VALUE=DATE:${dtEnd}`,
                `SUMMARY:${a.type} (${dureeStr} j)`,
                `DESCRIPTION:Congé ${a.type} de ${dureeStr} jour(s) ouvré(s) du ${expanded.effectiveStartDate} au ${expanded.endDate}`,
                'END:VEVENT'
            );
        }

        lines.push('END:VCALENDAR');
        return lines.join('\r\n') + '\r\n';
    }

    return {
        parseLocalDate,
        formatLocalDate,
        getCPPeriod,
        getRTTPeriod,
        formatCPPeriod,
        getEasterSunday,
        getJoursFeries,
        isWeekend,
        isHoliday,
        isClosureDay,
        fusionnerPlagesFermeture,
        buildClosureDatesMap,
        isWorkingDay,
        expandAbsenceDays,
        calculerSoldes,
        buildCalendarCoveredDays,
        validerAbsence,
        getAvailablePeriods,
        getDetailedCountdown,
        formatDetailedCountdown,
        formaterPlageDateFR,
        compterJoursOuvresEntre,
        resolveCPDeadlineDate,
        calculerAlertesExpiration,
        filtrerAbsencesHistorique,
        simulerAbsence,
        suggererPonts,
        calculerStatistiquesAnnuelles,
        genererExportICS
    };
});

