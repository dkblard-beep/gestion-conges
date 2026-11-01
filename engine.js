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
     * Indique si une date est un jour ouvré (ni week-end, ni jour férié).
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
                days: []
            };
        }

        const cDate = new Date(startDate);
        let shiftReason = null;

        // 1. Si la date de début tombe un week-end ou un férié, décaler au 1er jour ouvré suivant
        if (!isWorkingDay(cDate, options)) {
            shiftReason = isHoliday(cDate, options) ? 'ferie' : 'weekend';
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
        isWorkingDay,
        expandAbsenceDays,
        calculerSoldes,
        buildCalendarCoveredDays,
        validerAbsence,
        getAvailablePeriods,
        getDetailedCountdown,
        formatDetailedCountdown,
        compterJoursOuvresEntre,
        resolveCPDeadlineDate,
        calculerAlertesExpiration,
        filtrerAbsencesHistorique
    };
});

