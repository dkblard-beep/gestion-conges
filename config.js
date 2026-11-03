/**
 * config.js — Paramètres, configuration des jours fériés, validation de schéma et synchronisation.
 * Compatible navigateur (window.AppConfig) et Node.js (CommonJS).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AppConfig = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // URL publique du script Google Apps (lecture/écriture)
    const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxkp3pcNRAZ5ufwrMaaq4T8VS260l8YxtZd3qh8p3VhVGs_c2OHtnTfpotGiT1OCJjV7g/exec';

    // Clés localStorage
    const STORAGE_KEY = 'conges_rtt_data_v2';
    const HISTORY_STORAGE_KEY = 'conges_rtt_data_v2_history';
    const PREFS_STORAGE_KEY = 'conges_rtt_prefs_v1';
    const MAX_BACKUP_HISTORY = 5;
    const CRITICAL_SNAPSHOT_REASONS = new Set(['delete', 'restore', 'import']);

    // Types d'absences autorisés
    const TYPES_VALIDES = new Set(['CP', 'RTT']);

    // Configuration par défaut des alertes d'expiration, fermetures et thème (stockée hors de appData dans PREFS_STORAGE_KEY)
    const THEMES_VALIDES = new Set(['auto', 'light', 'dark']);
    const DEFAULT_ALERT_OPTIONS = Object.freeze({
        seuilAlerteJours: 60,
        echeanceReportCP: '05-31',
        theme: 'auto',
        rappelOuvertureActif: false,
        joursFermeture: Object.freeze([])
    });

    /**
     * Valide et normalise une liste de fermetures d'entreprise (plages début-fin et libellé optionnel).
     * @param {Array} [rawList]
     * @returns {Array<{ id: string|number, debut: string, fin: string, libelle: string }>}
     */
    function normaliserJoursFermeture(rawList) {
        if (!Array.isArray(rawList)) return [];
        const result = [];
        for (const item of rawList) {
            if (!item || typeof item !== 'object') continue;
            const debut = typeof item.debut === 'string' ? item.debut.trim() : '';
            const fin = typeof item.fin === 'string' ? item.fin.trim() : (typeof item.dateFin === 'string' ? item.dateFin.trim() : debut);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) continue;
            const rangeStart = debut <= fin ? debut : fin;
            const rangeEnd = debut <= fin ? fin : debut;
            const libelle = typeof item.libelle === 'string'
                ? item.libelle.trim().replace(/<[^>]*>/g, '').slice(0, 100)
                : '';
            const id = item.id !== undefined && item.id !== null ? String(item.id) : `closure-${rangeStart}-${rangeEnd}-${Math.random().toString(36).slice(2, 7)}`;
            result.push({
                id,
                debut: rangeStart,
                fin: rangeEnd,
                libelle
            });
        }
        return result;
    }

    /**
     * Valide et normalise les préférences locales (seuil d'alerte, échéance MM-DD de report CP, thème, rappel, fermetures).
     * @param {Object} [customPrefs]
     * @returns {{ seuilAlerteJours: number, echeanceReportCP: string, theme: string, rappelOuvertureActif: boolean, joursFermeture: Array }}
     */
    function getAlertOptions(customPrefs = {}) {
        const rawSeuil = Number(customPrefs && customPrefs.seuilAlerteJours);
        const seuilAlerteJours =
            Number.isFinite(rawSeuil) && rawSeuil >= 0 && rawSeuil <= 365
                ? Math.round(rawSeuil)
                : DEFAULT_ALERT_OPTIONS.seuilAlerteJours;

        let echeanceReportCP = DEFAULT_ALERT_OPTIONS.echeanceReportCP;
        if (customPrefs && typeof customPrefs.echeanceReportCP === 'string') {
            const match = /^(\d{2})-(\d{2})$/.exec(customPrefs.echeanceReportCP.trim());
            if (match) {
                const month = Number(match[1]);
                const day = Number(match[2]);
                const maxDaysByMonth = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                if (month >= 1 && month <= 12 && day >= 1 && day <= maxDaysByMonth[month]) {
                    echeanceReportCP = `${match[1]}-${match[2]}`;
                }
            }
        }

        const rawTheme = customPrefs && typeof customPrefs.theme === 'string'
            ? customPrefs.theme.trim().toLowerCase()
            : DEFAULT_ALERT_OPTIONS.theme;
        const theme = THEMES_VALIDES.has(rawTheme) ? rawTheme : DEFAULT_ALERT_OPTIONS.theme;

        const joursFermeture = normaliserJoursFermeture(customPrefs && customPrefs.joursFermeture);

        return {
            seuilAlerteJours,
            echeanceReportCP,
            theme,
            rappelOuvertureActif: Boolean(customPrefs && customPrefs.rappelOuvertureActif),
            joursFermeture
        };
    }

    // Configuration par défaut des jours fériés
    // Le lundi de Pentecôte est travaillé par défaut (journée de solidarité)
    const DEFAULT_FERIES_OPTIONS = Object.freeze({
        lundiPentecoteTravaille: true,
        joursFeriesFixes: Object.freeze([
            '01-01', // Jour de l'An
            '05-01', // Fête du Travail
            '05-08', // Victoire 1945
            '07-14', // Fête Nationale
            '08-15', // Assomption
            '11-01', // Toussaint
            '11-11', // Armistice 1918
            '12-25'  // Noël
        ]),
        inclureLundiPaques: true,
        inclureAscension: true
    });

    /**
     * Fusionne les options de jours fériés avec la configuration par défaut.
     * @param {Object} [customOptions]
     * @returns {Object}
     */
    function getFeriesOptions(customOptions = {}) {
        return {
            lundiPentecoteTravaille:
                typeof customOptions.lundiPentecoteTravaille === 'boolean'
                    ? customOptions.lundiPentecoteTravaille
                    : DEFAULT_FERIES_OPTIONS.lundiPentecoteTravaille,
            joursFeriesFixes: Array.isArray(customOptions.joursFeriesFixes)
                ? [...customOptions.joursFeriesFixes]
                : [...DEFAULT_FERIES_OPTIONS.joursFeriesFixes],
            inclureLundiPaques:
                typeof customOptions.inclureLundiPaques === 'boolean'
                    ? customOptions.inclureLundiPaques
                    : DEFAULT_FERIES_OPTIONS.inclureLundiPaques,
            inclureAscension:
                typeof customOptions.inclureAscension === 'boolean'
                    ? customOptions.inclureAscension
                    : DEFAULT_FERIES_OPTIONS.inclureAscension
        };
    }

    function isPlainObject(val) {
        return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
    }

    /**
     * Vérifie strictement qu'un payload reçu (ex: depuis GOOGLE_SHEETS_URL) a une structure valide.
     * Empêche d'écraser les données locales avec une réponse d'erreur HTTP 200 Apps Script.
     * @param {any} data
     * @returns {boolean}
     */
    function isValidPayload(data) {
        if (!isPlainObject(data)) return false;
        if (data.error || data.status === 'error' || data.result === 'error') return false;

        // Format legacy v1
        if (isPlainObject(data.years) && !data.migrated_v2) {
            return true;
        }

        // Format v2 : doit contenir au moins une des clés métier attendues
        const hasKnownKey =
            'absences' in data ||
            'configCP' in data ||
            'configRTT' in data ||
            'configRetraite' in data;
        if (!hasKnownKey) return false;

        if ('absences' in data) {
            if (!Array.isArray(data.absences)) return false;
            for (const a of data.absences) {
                if (!isPlainObject(a)) return false;
                if (!TYPES_VALIDES.has(a.type)) return false;
                if (typeof a.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return false;
                if (typeof a.duree !== 'number' || !Number.isFinite(a.duree) || a.duree <= 0) return false;
            }
        }

        if ('configCP' in data && !isPlainObject(data.configCP)) return false;
        if ('configRTT' in data && !isPlainObject(data.configRTT)) return false;
        if ('configRetraite' in data && !isPlainObject(data.configRetraite)) return false;
        if ('configFeries' in data && !isPlainObject(data.configFeries)) return false;

        return true;
    }

    /**
     * Normalise un horodatage : toute donnée sans updatedAt valide est traitée comme la plus ancienne (0).
     * @param {any} ts
     * @returns {number}
     */
    function normalizeTimestamp(ts) {
        if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
            return ts;
        }
        if (typeof ts === 'string' && ts.trim() !== '') {
            const parsed = Number(ts) || Date.parse(ts);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return 0;
    }

    /**
     * Crée une structure de données vide normalisée.
     */
    function createEmptyData() {
        return {
            absences: [],
            configCP: {},
            configRTT: {},
            configRetraite: {},
            updatedAt: 0,
            pendingSync: false
        };
    }

    /**
     * Migre et normalise les données applicatives.
     * Les données sans updatedAt reçoivent updatedAt = 0 (traitées comme les plus anciennes).
     * @param {any} data
     * @returns {Object}
     */
    function migrateData(data) {
        if (!data || !isPlainObject(data)) {
            return createEmptyData();
        }

        if (isPlainObject(data.years) && !data.migrated_v2) {
            const newData = {
                absences: [],
                configCP: {},
                configRTT: {},
                configRetraite: isPlainObject(data.configRetraite) ? { ...data.configRetraite } : {},
                migrated_v2: true,
                updatedAt: normalizeTimestamp(data.updatedAt),
                pendingSync: Boolean(data.pendingSync)
            };
            for (const y of Object.keys(data.years)) {
                const yearEntry = data.years[y] || {};
                newData.configCP[y] = Number(yearEntry.soldeInitialCP) || 0;
                newData.configRTT[y] = Number(yearEntry.soldeInitialRTT) || 0;
                if (Array.isArray(yearEntry.absences)) {
                    newData.absences.push(...yearEntry.absences.map(a => ({ ...a })));
                }
            }
            return newData;
        }

        return {
            ...data,
            absences: Array.isArray(data.absences) ? data.absences.map(a => ({ ...a })) : [],
            configCP: isPlainObject(data.configCP) ? { ...data.configCP } : {},
            configRTT: isPlainObject(data.configRTT) ? { ...data.configRTT } : {},
            configRetraite: isPlainObject(data.configRetraite) ? { ...data.configRetraite } : {},
            updatedAt: normalizeTimestamp(data.updatedAt),
            pendingSync: Boolean(data.pendingSync)
        };
    }

    /**
     * Compare le contenu métier de deux états (hors métadonnées updatedAt / pendingSync).
     * @param {Object} a
     * @param {Object} b
     * @returns {boolean}
     */
    function areDataPayloadsEqual(a, b) {
        const normA = migrateData(a);
        const normB = migrateData(b);

        const canonicalize = (d) => ({
            absences: [...d.absences]
                .map(x => ({ id: Number(x.id) || 0, type: x.type, date: x.date, duree: Number(x.duree) }))
                .sort((x, y) => (x.id - y.id) || x.date.localeCompare(y.date)),
            configCP: Object.keys(d.configCP).sort().reduce((acc, k) => {
                acc[k] = Number(d.configCP[k]) || 0;
                return acc;
            }, {}),
            configRTT: Object.keys(d.configRTT).sort().reduce((acc, k) => {
                acc[k] = Number(d.configRTT[k]) || 0;
                return acc;
            }, {}),
            configRetraite: {
                legal: d.configRetraite.legal || '',
                anticipe: d.configRetraite.anticipe || ''
            }
        });

        return JSON.stringify(canonicalize(normA)) === JSON.stringify(canonicalize(normB));
    }

    /**
     * Marque un état comme modifié localement avec un nouvel horodatage updatedAt.
     * @param {Object} appData
     * @param {number} [now]
     * @returns {Object}
     */
    function markUpdated(appData, now = Date.now()) {
        appData.updatedAt = now;
        appData.pendingSync = true;
        return appData;
    }

    /**
     * Résout la synchronisation entre données locales et données distantes.
     * Règles :
     * - Validation stricte du payload distant avant tout écrasement.
     * - Les données sans updatedAt ont updatedAt = 0 (traitées comme les plus anciennes).
     * - En cas de divergence/conflit local vs distant, ne rien écraser en silence : signaler `conflict: true`.
     *
     * @param {any} localRaw
     * @param {any} remoteRaw
     * @returns {{ data: Object, source: string, conflict: boolean, reason: string|null, needsPush: boolean, localData: Object|null, remoteData: Object|null }}
     */
    function resolveSyncState(localRaw, remoteRaw) {
        const hasValidLocal = isValidPayload(localRaw);
        const hasValidRemote = isValidPayload(remoteRaw);

        const localData = hasValidLocal ? migrateData(localRaw) : null;
        const remoteData = hasValidRemote ? migrateData(remoteRaw) : null;

        // Cas 1 : Payload distant invalide
        if (!hasValidRemote) {
            if (localData) {
                return {
                    data: localData,
                    source: 'local',
                    conflict: remoteRaw !== null && remoteRaw !== undefined,
                    reason: remoteRaw !== null && remoteRaw !== undefined ? 'INVALID_REMOTE_PAYLOAD' : null,
                    needsPush: Boolean(localData.pendingSync),
                    localData,
                    remoteData: null
                };
            }
            return {
                data: createEmptyData(),
                source: 'empty',
                conflict: remoteRaw !== null && remoteRaw !== undefined,
                reason: remoteRaw !== null && remoteRaw !== undefined ? 'INVALID_REMOTE_PAYLOAD' : null,
                needsPush: false,
                localData: null,
                remoteData: null
            };
        }

        // Cas 2 : Pas de données locales valides, on utilise les données distantes validées
        if (!localData) {
            return {
                data: remoteData,
                source: 'remote',
                conflict: false,
                reason: null,
                needsPush: false,
                localData: null,
                remoteData
            };
        }

        // Cas 3 : Les contenus métier local et distant sont identiques
        if (areDataPayloadsEqual(localData, remoteData)) {
            const maxTs = Math.max(localData.updatedAt, remoteData.updatedAt);
            const merged = {
                ...remoteData,
                updatedAt: maxTs,
                pendingSync: false
            };
            return {
                data: merged,
                source: 'synced',
                conflict: false,
                reason: null,
                needsPush: false,
                localData,
                remoteData
            };
        }

        // Cas 4 : Les contenus diffèrent -> Détection des conflits par updatedAt
        const localTs = localData.updatedAt;   // 0 si absent
        const remoteTs = remoteData.updatedAt; // 0 si absent

        // 4a : Les données locales sont plus récentes (ou ont des modifications hors-ligne en attente)
        if (localTs > remoteTs || localData.pendingSync) {
            return {
                data: localData,
                source: 'local',
                conflict: true,
                reason: 'LOCAL_NEWER_THAN_REMOTE',
                needsPush: true,
                localData,
                remoteData
            };
        }

        // 4b : Les données distantes ont un updatedAt strictement plus récent et local n'a pas de pendingSync
        if (remoteTs > localTs && !localData.pendingSync) {
            const localHadData = localData.absences.length > 0 ||
                Object.keys(localData.configCP).length > 0 ||
                Object.keys(localData.configRTT).length > 0;
            if (!localHadData) {
                return {
                    data: remoteData,
                    source: 'remote',
                    conflict: false,
                    reason: null,
                    needsPush: false,
                    localData,
                    remoteData
                };
            }
            // Les deux versions contiennent des données différentes : ne pas écraser sans choix explicite
            return {
                data: localData,
                source: 'local',
                conflict: true,
                reason: 'REMOTE_NEWER_THAN_LOCAL',
                needsPush: false,
                localData,
                remoteData
            };
        }

        // 4c : Même updatedAt (ex: tous deux à 0 sans updatedAt) mais contenus divergents ->
        // Ne jamais écraser en silence : conserver les données locales par sécurité et signaler le conflit.
        return {
            data: localData,
            source: 'local',
            conflict: true,
            reason: 'DIVERGENT_SAME_TIMESTAMP',
            needsPush: false,
            localData,
            remoteData
        };
    }

    function formatLocalDayKey(ts = Date.now()) {
        const d = new Date(ts);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /**
     * Enregistre un instantané dans l'historique des sauvegardes locales (plafond de 5).
     * - Instantané systématique avant chaque suppression ('delete'), restauration ('restore') ou import ('import').
     * - Au plus un instantané par jour calendaire pour les autres modifications ('add', 'edit', 'config', 'other').
     *
     * @param {Array} existingHistory
     * @param {Object} currentData
     * @param {{ reason?: string, label?: string, now?: number }} [options]
     * @returns {{ history: Array, recorded: boolean, snapshot: Object|null }}
     */
    function recordBackupSnapshot(existingHistory, currentData, options = {}) {
        const history = Array.isArray(existingHistory) ? [...existingHistory] : [];
        if (!currentData || !isPlainObject(currentData)) {
            return { history: history.slice(0, MAX_BACKUP_HISTORY), recorded: false, snapshot: null };
        }

        const reason = options.reason || 'other';
        const label = options.label || reason;
        const now = typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
        const dayKey = formatLocalDayKey(now);
        const isCritical = CRITICAL_SNAPSHOT_REASONS.has(reason);

        if (!isCritical) {
            const alreadyHasDailySnapshot = history.some(
                entry => entry && entry.dayKey === dayKey && !CRITICAL_SNAPSHOT_REASONS.has(entry.reason)
            );
            if (alreadyHasDailySnapshot) {
                return {
                    history: history.slice(0, MAX_BACKUP_HISTORY),
                    recorded: false,
                    snapshot: null
                };
            }
        }

        const snapshot = {
            id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
            savedAt: now,
            dayKey,
            reason,
            label,
            data: JSON.parse(JSON.stringify(migrateData(currentData)))
        };

        const updatedHistory = [snapshot, ...history].slice(0, MAX_BACKUP_HISTORY);
        return {
            history: updatedHistory,
            recorded: true,
            snapshot
        };
    }

    return {
        GOOGLE_SHEETS_URL,
        STORAGE_KEY,
        HISTORY_STORAGE_KEY,
        PREFS_STORAGE_KEY,
        MAX_BACKUP_HISTORY,
        CRITICAL_SNAPSHOT_REASONS,
        TYPES_VALIDES,
        THEMES_VALIDES,
        DEFAULT_ALERT_OPTIONS,
        normaliserJoursFermeture,
        getAlertOptions,
        DEFAULT_FERIES_OPTIONS,
        getFeriesOptions,
        isValidPayload,
        normalizeTimestamp,
        createEmptyData,
        migrateData,
        areDataPayloadsEqual,
        markUpdated,
        resolveSyncState,
        formatLocalDayKey,
        recordBackupSnapshot
    };
});

