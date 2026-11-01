/**
 * app.js — Contrôleur d'interface et orchestration DOM.
 * Utilise exclusivement config.js (AppConfig) et engine.js (AppEngine) comme sources uniques
 * des règles métier, calculs, validations et résolutions de synchronisation.
 */
(function (root) {
    'use strict';

    const AppConfig = root.AppConfig || (typeof require === 'function' ? require('./config.js') : null);
    const AppEngine = root.AppEngine || (typeof require === 'function' ? require('./engine.js') : null);

    const GOOGLE_SHEETS_URL = AppConfig.GOOGLE_SHEETS_URL;
    const STORAGE_KEY = AppConfig.STORAGE_KEY;
    const HISTORY_STORAGE_KEY = AppConfig.HISTORY_STORAGE_KEY || `${STORAGE_KEY}_history`;
    const PREFS_STORAGE_KEY = AppConfig.PREFS_STORAGE_KEY || 'conges_rtt_prefs_v1';
    const BACKUP_STORAGE_KEY = `${STORAGE_KEY}_backup`;
    const CONFLICT_STORAGE_KEY = `${STORAGE_KEY}_conflict_backup`;
    const UNDO_DURATION_MS = 10000;

    // Cache des références DOM
    const DOM = {};
    function initDOM() {
        DOM.soldeCp             = document.getElementById('solde-cp');
        DOM.soldeRtt            = document.getElementById('solde-rtt');
        DOM.resteCpLabel        = document.getElementById('reste-cp-label');
        DOM.resteRttLabel       = document.getElementById('reste-rtt-label');
        DOM.totalCp             = document.getElementById('total-cp');
        DOM.totalRtt            = document.getElementById('total-rtt');
        DOM.prisCp              = document.getElementById('pris-cp');
        DOM.prisRtt             = document.getElementById('pris-rtt');
        DOM.progressTextCp      = document.getElementById('progress-text-cp');
        DOM.progressTextRtt     = document.getElementById('progress-text-rtt');
        DOM.progressCp          = document.getElementById('progress-cp');
        DOM.progressRtt         = document.getElementById('progress-rtt');
        DOM.negativeBadgeCp     = document.getElementById('negative-badge-cp');
        DOM.negativeBadgeRtt    = document.getElementById('negative-badge-rtt');
        DOM.barAccentCp         = document.getElementById('bar-accent-cp');
        DOM.barAccentRtt        = document.getElementById('bar-accent-rtt');
        DOM.initCp              = document.getElementById('init-cp');
        DOM.initRtt             = document.getElementById('init-rtt');
        DOM.initPentecote       = document.getElementById('init-pentecote-travaille');
        DOM.initSeuilAlerte     = document.getElementById('init-seuil-alerte');
        DOM.initEcheanceCp      = document.getElementById('init-echeance-cp');
        DOM.initThemeMode       = document.getElementById('init-theme-mode');
        DOM.gaugeCircleCp       = document.getElementById('gauge-circle-cp');
        DOM.gaugeCircleRtt      = document.getElementById('gauge-circle-rtt');
        DOM.gaugeRatioCp        = document.getElementById('gauge-ratio-cp');
        DOM.gaugeRatioRtt       = document.getElementById('gauge-ratio-rtt');
        DOM.fabNewAbsence       = document.getElementById('fab-new-absence');
        DOM.labelCpYear         = document.getElementById('label-cp-year');
        DOM.labelCpYearNext     = document.getElementById('label-cp-year-next');
        DOM.labelRttYear        = document.getElementById('label-rtt-year');
        DOM.retraiteLegal       = document.getElementById('init-retraite-legal');
        DOM.retraiteAnticipe    = document.getElementById('init-retraite-anticipe');
        DOM.selectCp            = document.getElementById('select-cp-period');
        DOM.selectRtt           = document.getElementById('select-rtt-period');
        DOM.expirationAlerts    = document.getElementById('expiration-alerts');
        DOM.filterHistoryType   = document.getElementById('filter-history-type');
        DOM.filterHistoryPeriod = document.getElementById('filter-history-period');
        DOM.historiqueList      = document.getElementById('historique-list');
        DOM.historiqueVide      = document.getElementById('historique-vide');
        DOM.retraiteCard        = document.getElementById('retraite-card');
        DOM.retraiteExpanded    = document.getElementById('retraite-content-expanded');
        DOM.retraiteMinimized   = document.getElementById('retraite-content-minimized');
        DOM.retraiteIcon        = document.getElementById('retraite-toggle-icon');
        DOM.dateDebut           = document.getElementById('date-debut');
        DOM.typeAbsence         = document.getElementById('type-absence');
        DOM.dureeAbsence        = document.getElementById('duree-absence');
        DOM.btnSubmitAbsence    = document.getElementById('btn-submit-absence');
        DOM.modalAbsenceTitle   = document.getElementById('modal-absence-title');
        DOM.modalAbsenceIcon    = document.getElementById('modal-absence-icon');
        DOM.previewBox          = document.getElementById('absence-preview');
        DOM.previewDates        = document.getElementById('preview-dates');
        DOM.previewShift        = document.getElementById('preview-shift');
        DOM.previewBalance      = document.getElementById('preview-balance');
        DOM.previewNegativeWarn = document.getElementById('preview-negative-warning');
        DOM.modalErrorMessage   = document.getElementById('modal-error-message');
        DOM.modalErrorText      = document.getElementById('modal-error-text');
        DOM.errorMessage        = document.getElementById('error-message');
        DOM.errorText           = document.getElementById('error-text');
        DOM.undoBanner          = document.getElementById('undo-banner');
        DOM.undoText            = document.getElementById('undo-text');
        DOM.btnUndoAction       = document.getElementById('btn-undo-action');
        DOM.conflictBanner      = document.getElementById('conflict-banner');
        DOM.conflictDescription = document.getElementById('conflict-description');
        DOM.syncStatusDot       = document.getElementById('sync-status-dot');
        DOM.syncStatusText      = document.getElementById('sync-status-text');
        DOM.configSection       = document.getElementById('config-section');
        DOM.backupHistoryList   = document.getElementById('backup-history-list');
        DOM.backupHistoryEmpty  = document.getElementById('backup-history-empty');
        DOM.formAbsence         = document.getElementById('form-absence');
        DOM.anticipeContainer   = document.getElementById('anticipe-container');
        DOM.decompteLegal       = document.getElementById('decompte-legal');
        DOM.decompteLegalDetail = document.getElementById('decompte-legal-detail');
        DOM.dateLegalLabel      = document.getElementById('date-legal-label');
        DOM.decompteAnticipe    = document.getElementById('decompte-anticipe');
        DOM.decompteAnticipeDetail = document.getElementById('decompte-anticipe-detail');
        DOM.dateAnticipeLabel   = document.getElementById('date-anticipe-label');
        DOM.decompteMini        = document.getElementById('decompte-mini');
        DOM.calendarGrid        = document.getElementById('calendar-grid-display');
        DOM.calendarMonthLabel  = document.getElementById('calendar-month-label-display');
        DOM.btnToggleDeleteLock = document.getElementById('btn-toggle-delete-lock');
        DOM.deleteLockIcon      = document.getElementById('delete-lock-icon');
        DOM.deleteLockLabel     = document.getElementById('delete-lock-label');
        DOM.simType             = document.getElementById('sim-type');
        DOM.simMode             = document.getElementById('sim-mode');
        DOM.simDateDebut        = document.getElementById('sim-date-debut');
        DOM.simDuree            = document.getElementById('sim-duree');
        DOM.simDateFin          = document.getElementById('sim-date-fin');
        DOM.simDureeContainer   = document.getElementById('sim-duree-container');
        DOM.simDateFinContainer = document.getElementById('sim-date-fin-container');
        DOM.simResultSummary    = document.getElementById('sim-result-summary');
        DOM.simResultShift      = document.getElementById('sim-result-shift');
        DOM.simResultDetails    = document.getElementById('sim-result-details');
        DOM.simResultWarning    = document.getElementById('sim-result-warning');
        DOM.btnSimToModal       = document.getElementById('btn-sim-to-modal');
        DOM.bridgesYearLabel    = document.getElementById('bridges-year-label');
        DOM.bridgesList         = document.getElementById('bridges-list');
        DOM.bridgesEmpty        = document.getElementById('bridges-empty');
        DOM.initRappelOuverture = document.getElementById('init-rappel-ouverture');
        DOM.notifPermissionStatus = document.getElementById('notif-permission-status');
        DOM.openingReminderBanner = document.getElementById('opening-reminder-banner');
        DOM.openingReminderText = document.getElementById('opening-reminder-text');
        DOM.statsYearLabel      = document.getElementById('stats-year-label');
        DOM.statsTauxGlobal     = document.getElementById('stats-taux-global');
        DOM.statsTauxDetail     = document.getElementById('stats-taux-detail');
        DOM.statsMoisPlusCharge = document.getElementById('stats-mois-plus-charge');
        DOM.statsMoisPlusChargeDetail = document.getElementById('stats-mois-plus-charge-detail');
        DOM.statsTotalAnnee     = document.getElementById('stats-total-annee');
        DOM.statsTotalAnneeDetail = document.getElementById('stats-total-annee-detail');
        DOM.statsMensuellesGrid = document.getElementById('stats-mensuelles-grid');
    }

    let appData = AppConfig.createEmptyData();
    let currentCPPeriod = '';
    let currentRTTPeriod = '';
    let currentCalendarDate = new Date();
    let currentSyncState = 'local'; // 'local' | 'en_cours' | 'reussi' | 'erreur' | 'conflit'
    let pendingConflict = null;     // { localData, remoteData, reason }
    let isSubmittingAbsence = false;
    let isDeleteUnlocked = false;   // Verrouillé par défaut pour éviter les suppressions accidentelles
    let pendingDeleteConfirmId = null; // ID en attente de confirmation de suppression
    let editingAbsenceId = null;    // ID de l'absence en cours d'édition (null si création)
    let lastUndoState = null;       // État d'annulation en mémoire uniquement (expire après 10s, ne survit pas au reload)
    let undoTimeoutId = null;
    let errorTimeoutId = null;
    let alertPrefs = AppConfig.getAlertOptions(); // Stocké séparément dans PREFS_STORAGE_KEY (Lot B #1)
    let historyFilterType = 'ALL';                // Lecture seule ('ALL' | 'CP' | 'RTT')
    let historyFilterPeriod = 'ALL';              // Lecture seule ('ALL' | année), auto-réinitialisé si la période disparaît
    let injectedReferenceDate = null;             // Permet d'injecter une date de référence déterministe pour les tests UI
    let lastSimulationResult = null;              // Dernier résultat de simulation (immuable, sans effet sur appData)

    /**
     * Retourne les options de jours fériés actives (lundiPentecoteTravaille configurable, true par défaut).
     */
    function getActiveFeriesOptions() {
        return AppConfig.getFeriesOptions(appData && appData.configFeries ? appData.configFeries : {});
    }

    /**
     * Lit les préférences locales d'alerte depuis la clé dédiée PREFS_STORAGE_KEY (sans toucher à appData ni au payload Cloud).
     */
    function lirePreferencesAlertes() {
        const raw = localStorage.getItem(PREFS_STORAGE_KEY);
        if (!raw) return AppConfig.getAlertOptions();
        try {
            return AppConfig.getAlertOptions(JSON.parse(raw));
        } catch (_e) {
            return AppConfig.getAlertOptions();
        }
    }

    /**
     * Sauvegarde les préférences d'alerte et de thème dans la clé localStorage dédiée PREFS_STORAGE_KEY.
     */
    function sauvegarderPreferencesAlertes(customPrefs) {
        alertPrefs = AppConfig.getAlertOptions({ ...alertPrefs, ...customPrefs });
        try {
            localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(alertPrefs));
        } catch (e) {
            console.warn('Impossible de sauvegarder les préférences locales d’alerte :', e);
        }
        appliquerTheme(alertPrefs.theme);
        return alertPrefs;
    }

    /**
     * Applique le thème d'affichage ('auto' | 'light' | 'dark') sur la balise <html>,
     * en respectant prefers-color-scheme en mode 'auto' et la bascule manuelle en modes 'light' / 'dark' (Lot D #1).
     */
    function appliquerTheme(themePref = (alertPrefs && alertPrefs.theme) || 'auto') {
        const normalized = AppConfig.getAlertOptions({ theme: themePref }).theme;
        const docEl = typeof document !== 'undefined' && document.documentElement ? document.documentElement : null;
        const prefersDark =
            typeof root.matchMedia === 'function' &&
            Boolean(root.matchMedia('(prefers-color-scheme: dark)').matches);

        const isEffectiveDark = normalized === 'dark' || (normalized === 'auto' && prefersDark);

        if (docEl) {
            if ( docEl.setAttribute ) {
                docEl.setAttribute('data-theme', normalized);
            }
            if (docEl.dataset) {
                docEl.dataset.theme = normalized;
            }
            if (docEl.classList) {
                docEl.classList.toggle('dark', isEffectiveDark);
            }
        }
        if (DOM.initThemeMode) {
            DOM.initThemeMode.value = normalized;
        }
        return { theme: normalized, isEffectiveDark };
    }

    let systemThemeMediaQuery = null;
    function initSystemThemeListener() {
        if (typeof root.matchMedia !== 'function' || systemThemeMediaQuery) return;
        try {
            const mql = root.matchMedia('(prefers-color-scheme: dark)');
            if (!mql) return;
            systemThemeMediaQuery = mql;
            const onChange = () => {
                if ((alertPrefs && alertPrefs.theme) === 'auto') {
                    appliquerTheme('auto');
                }
            };
            if (typeof mql.addEventListener === 'function') {
                mql.addEventListener('change', onChange);
            } else if (typeof mql.addListener === 'function') {
                mql.addListener(onChange);
            }
        } catch (_e) {
            // Ignoré dans les environnements sans MediaQueryList
        }
    }

    root.changerThemePref = function (explicitTheme) {
        const nextTheme = explicitTheme !== undefined
            ? String(explicitTheme)
            : (DOM.initThemeMode && DOM.initThemeMode.value ? DOM.initThemeMode.value : 'auto');
        sauvegarderPreferencesAlertes({ theme: nextTheme });
        return alertPrefs.theme;
    };

    /**
     * Formate un nombre de jours en préservant les valeurs négatives et les demi-journées exactes (ex: -1.5, 0.5, 14).
     * @param {number} val
     * @returns {string}
     */
    function formatDaysNumber(val) {
        const n = Number(val) || 0;
        const rounded = Math.round(n * 100) / 100;
        return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
    }

    /**
     * Met à jour l'indicateur d'état de synchronisation avec les 5 états réellement connus :
     * 'local', 'en_cours', 'reussi', 'erreur', 'conflit'.
     * Ne jamais afficher « Synchronisé » sur la seule base d'un horodatage.
     */
    function setSyncStatus(state, customLabel) {
        currentSyncState = state;
        if (!DOM.syncStatusDot || !DOM.syncStatusText) return;

        DOM.syncStatusDot.className = 'w-1.5 h-1.5 rounded-full';
        const labels = {
            local: 'Local (non synchronisé)',
            en_cours: 'Synchronisation en cours...',
            reussi: 'Synchronisé (vérifié)',
            erreur: 'Erreur synchro (conservé en local)',
            conflit: 'Conflit détecté (choix requis)'
        };

        if (state === 'reussi') {
            DOM.syncStatusDot.classList.add('bg-success');
        } else if (state === 'en_cours') {
            DOM.syncStatusDot.classList.add('bg-primary');
        } else if (state === 'erreur' || state === 'conflit') {
            DOM.syncStatusDot.classList.add('bg-error');
        } else {
            DOM.syncStatusDot.classList.add('bg-slate-400');
        }

        DOM.syncStatusText.textContent = customLabel || labels[state] || labels.local;
    }

    /**
     * Lit les données locales sans jamais réinitialiser ni détruire localStorage.
     */
    function lireDonneesLocales() {
        const rawStr = localStorage.getItem(STORAGE_KEY);
        if (!rawStr) return null;
        try {
            return JSON.parse(rawStr);
        } catch (parseError) {
            console.warn('Données localStorage illisibles, sauvegarde dans la clé de secours sans suppression.', parseError);
            localStorage.setItem(`${STORAGE_KEY}_corrupted_raw`, rawStr);
            showError('Lecture locale impossible : une copie de secours brute a été préservée.');
            return null;
        }
    }

    /**
     * Persiste une copie de sauvegarde simple dans localStorage avant résolution de conflit.
     */
    function creerSauvegardeSecours(dataToBackup) {
        if (!dataToBackup) return;
        try {
            localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify({
                backedUpAt: Date.now(),
                data: dataToBackup
            }));
        } catch (e) {
            console.warn('Impossible de créer la sauvegarde de secours locale.', e);
        }
    }

    // ─── Historique des 5 dernières sauvegardes locales (Lot A) ───
    function lireHistoriqueSauvegardes() {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_e) {
            return [];
        }
    }

    /**
     * Enregistre un instantané dans l'historique local (plafond 5) selon les règles du Lot A :
     * - Systématique avant chaque suppression ('delete'), restauration ('restore') ou import ('import').
     * - Au plus un instantané par jour calendaire pour les autres modifications ('add', 'edit', 'config').
     */
    function enregistrerSauvegardeLocale(label, reason = 'other', customNow = Date.now()) {
        const currentHistory = lireHistoriqueSauvegardes();
        const result = AppConfig.recordBackupSnapshot(currentHistory, appData, {
            reason,
            label,
            now: customNow
        });
        if (result.recorded) {
            try {
                localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(result.history));
            } catch (e) {
                console.warn('Impossible de sauvegarder l’historique local :', e);
            }
        }
        renderBackupHistory();
        return result;
    }

    /**
     * Restaure une sauvegarde locale depuis l'historique.
     * Règle Lot A #1 : Avant toute restauration, enregistre l'état actuel dans l'historique (restauration réversible).
     */
    root.restaurerSauvegardeLocale = function (snapshotId, customNow = Date.now()) {
        const history = lireHistoriqueSauvegardes();
        const target = history.find(entry => entry && entry.id === snapshotId);
        if (!target || !target.data) return false;

        // 1. Enregistre l'état actuel dans l'historique avant d'écraser (réversibilité garantie)
        enregistrerSauvegardeLocale('Avant restauration', 'restore', customNow);
        enregistrerActionAnnulable(appData, 'Sauvegarde restaurée', customNow);

        // 2. Applique les données restaurées et met à jour updatedAt
        appData = AppConfig.migrateData(target.data);
        sauvegarderDonneesCloud(customNow);
        updateSelectors();
        root.mettreAJourAffichage();
        root.mettreAJourApercuAbsence();
        return true;
    };

    function renderBackupHistory() {
        if (!DOM.backupHistoryList || !DOM.backupHistoryEmpty) return;
        const history = lireHistoriqueSauvegardes();
        DOM.backupHistoryList.innerHTML = '';

        if (history.length === 0) {
            DOM.backupHistoryEmpty.classList.remove('hidden');
            return;
        }
        DOM.backupHistoryEmpty.classList.add('hidden');

        history.forEach(entry => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200';
            const dateStr = new Date(entry.savedAt).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const count = Array.isArray(entry.data?.absences) ? entry.data.absences.length : 0;

            row.innerHTML = `
                <div>
                    <div class="font-semibold text-slate-900">${entry.label || 'Sauvegarde'}</div>
                    <div class="text-slate-500">${dateStr} • ${count} absence${count > 1 ? 's' : ''}</div>
                </div>
                <button type="button" class="btn-secondary !py-1 !px-2.5 text-xs">Restaurer</button>
            `;

            const restoreBtn = row.querySelector('button');
            restoreBtn.addEventListener('click', () => root.restaurerSauvegardeLocale(entry.id));
            DOM.backupHistoryList.appendChild(row);
        });
    }

    // ─── Annulation de la dernière action (10 secondes, en mémoire uniquement) ───
    function enregistrerActionAnnulable(previousData, label, now = Date.now()) {
        if (undoTimeoutId) clearTimeout(undoTimeoutId);
        lastUndoState = {
            snapshotData: JSON.parse(JSON.stringify(AppConfig.migrateData(previousData))),
            label,
            createdAt: now,
            expiresAt: now + UNDO_DURATION_MS
        };

        if (DOM.undoBanner && DOM.undoText) {
            DOM.undoText.textContent = `${label} — Vous pouvez annuler cette action pendant 10 secondes.`;
            DOM.undoBanner.classList.remove('hidden');
            DOM.undoBanner.classList.add('flex');
        }

        undoTimeoutId = setTimeout(() => {
            hideUndoBanner();
        }, UNDO_DURATION_MS);
    }

    function hideUndoBanner() {
        if (undoTimeoutId) {
            clearTimeout(undoTimeoutId);
            undoTimeoutId = null;
        }
        lastUndoState = null;
        if (DOM.undoBanner) {
            DOM.undoBanner.classList.add('hidden');
            DOM.undoBanner.classList.remove('flex');
        }
    }

    root.annulerDerniereAction = function (now = Date.now()) {
        if (!lastUndoState || now > lastUndoState.expiresAt) {
            hideUndoBanner();
            return false;
        }

        const restored = AppConfig.migrateData(lastUndoState.snapshotData);
        hideUndoBanner();
        appData = restored;
        sauvegarderDonneesCloud(now);
        updateSelectors();
        root.mettreAJourAffichage();
        root.mettreAJourApercuAbsence();
        return true;
    };

    /**
     * Affiche ou masque la bannière de conflit permettant à l'utilisateur de choisir explicitement.
     */
    function afficherBanniereConflit(conflictObj) {
        pendingConflict = conflictObj;
        if (!DOM.conflictBanner) return;

        if (!conflictObj || !conflictObj.localData || !conflictObj.remoteData) {
            DOM.conflictBanner.classList.add('hidden');
            return;
        }

        try {
            localStorage.setItem(CONFLICT_STORAGE_KEY, JSON.stringify(conflictObj));
        } catch (e) {
            console.warn('Sauvegarde du conflit impossible dans localStorage', e);
        }

        const localCount = Array.isArray(conflictObj.localData.absences) ? conflictObj.localData.absences.length : 0;
        const remoteCount = Array.isArray(conflictObj.remoteData.absences) ? conflictObj.remoteData.absences.length : 0;
        if (DOM.conflictDescription) {
            DOM.conflictDescription.textContent =
                `Version locale : ${localCount} absence(s) | Version distante (Cloud) : ${remoteCount} absence(s). ` +
                `Aucune version n'a été écrasée. Choisissez explicitement laquelle appliquer :`;
        }
        DOM.conflictBanner.classList.remove('hidden');
        setSyncStatus('conflit');
    }

    /**
     * Résout explicitement un conflit suite au choix de l'utilisateur ('local' ou 'remote').
     */
    root.resoudreConflit = async function (choice) {
        if (!pendingConflict) return;
        const { localData, remoteData } = pendingConflict;

        if (choice === 'remote' && remoteData) {
            creerSauvegardeSecours(localData);
            enregistrerSauvegardeLocale('Avant application version distante', 'import');
            appData = AppConfig.migrateData(remoteData);
            appData.pendingSync = false;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
            localStorage.removeItem(CONFLICT_STORAGE_KEY);
            pendingConflict = null;
            if (DOM.conflictBanner) DOM.conflictBanner.classList.add('hidden');
            setSyncStatus('reussi');
            updateSelectors();
            root.mettreAJourAffichage();
        } else if (choice === 'local' && localData) {
            creerSauvegardeSecours(remoteData);
            appData = AppConfig.migrateData(localData);
            AppConfig.markUpdated(appData);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
            localStorage.removeItem(CONFLICT_STORAGE_KEY);
            pendingConflict = null;
            if (DOM.conflictBanner) DOM.conflictBanner.classList.add('hidden');
            updateSelectors();
            root.mettreAJourAffichage();
            await sauvegarderDonneesCloud();
        }
    };

    /**
     * Exporte les données actives (et les deux versions en cas de conflit) sous forme de fichier JSON.
     */
    root.exporterDonneesJSON = function () {
        const exportPayload = {
            exportedAt: new Date().toISOString(),
            activeData: appData,
            pendingConflict: pendingConflict || null
        };
        const jsonStr = JSON.stringify(exportPayload, null, 2);

        if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
            try {
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `sauvegarde-conges-${AppEngine.formatLocalDate(new Date())}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn('Téléchargement direct indisponible dans cet environnement.', e);
            }
        }
        return exportPayload;
    };

    /**
     * Initialisation de l'application : lecture locale, récupération distante, résolution sans écrasement.
     * L'annulation (lastUndoState) est systématiquement réinitialisée et ne survit pas à un rechargement.
     */
    async function initApp() {
        initDOM();
        hideUndoBanner();
        pendingDeleteConfirmId = null;
        editingAbsenceId = null;
        alertPrefs = lirePreferencesAlertes();
        initSystemThemeListener();
        appliquerTheme(alertPrefs.theme);
        historyFilterType = 'ALL';
        historyFilterPeriod = 'ALL';

        const today = AppEngine.formatLocalDate(injectedReferenceDate || new Date());
        currentCPPeriod = AppEngine.getCPPeriod(today);
        currentRTTPeriod = AppEngine.getRTTPeriod(today);
        if (DOM.dateDebut) DOM.dateDebut.value = today;
        if (DOM.simDateDebut && !DOM.simDateDebut.value) DOM.simDateDebut.value = today;
        if (DOM.simDateFin && !DOM.simDateFin.value) DOM.simDateFin.value = today;

        const localRaw = lireDonneesLocales();
        if (localRaw && AppConfig.isValidPayload(localRaw)) {
            appData = AppConfig.migrateData(localRaw);
        }
        setSyncStatus('en_cours');

        try {
            const response = await fetch(GOOGLE_SHEETS_URL, { method: 'GET', credentials: 'omit' });
            if (!response.ok) throw new Error('Réseau');
            const remoteRaw = await response.json();

            const syncResult = AppConfig.resolveSyncState(localRaw, remoteRaw);

            if (syncResult.reason === 'INVALID_REMOTE_PAYLOAD') {
                setSyncStatus('erreur', 'Erreur : réponse serveur invalide (local conservé)');
                showError('Réponse distante invalide : vos données locales ont été préservées.');
            } else if (syncResult.conflict && syncResult.localData && syncResult.remoteData) {
                appData = syncResult.data;
                afficherBanniereConflit({
                    localData: syncResult.localData,
                    remoteData: syncResult.remoteData,
                    reason: syncResult.reason
                });
            } else {
                appData = syncResult.data;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
                if (syncResult.source === 'remote' || syncResult.source === 'synced') {
                    setSyncStatus('reussi');
                } else {
                    setSyncStatus('local');
                }
            }
        } catch (error) {
            console.warn('Mode hors-ligne ou erreur réseau au chargement :', error);
            if (localRaw && AppConfig.isValidPayload(localRaw)) {
                appData = AppConfig.migrateData(localRaw);
                setSyncStatus('local', 'Mode hors-ligne (données locales)');
                showError('Mode hors-ligne : utilisation des données locales.');
            } else {
                setSyncStatus('erreur', 'Hors-ligne (aucune donnée)');
                showError('Mode hors-ligne.');
            }
        }

        updateSelectors();
        root.mettreAJourAffichage();
        root.mettreAJourApercuAbsence();
        verifierRappelOuverture();
    }

    /**
     * Sauvegarde locale immédiate (avec mise à jour de updatedAt) + envoi Cloud avec vérification réelle.
     */
    async function sauvegarderDonneesCloud(customNow) {
        const nextTs = Math.max(
            typeof customNow === 'number' && Number.isFinite(customNow) ? customNow : Date.now(),
            (Number(appData.updatedAt) || 0) + 1
        );
        AppConfig.markUpdated(appData, nextTs);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        setSyncStatus('en_cours');

        try {
            await fetch(GOOGLE_SHEETS_URL, {
                method: 'POST',
                mode: 'no-cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(appData)
            });

            // Le mode no-cors renvoie une réponse opaque : on vérifie par un GET que le serveur a bien enregistré
            try {
                const checkRes = await fetch(GOOGLE_SHEETS_URL, { method: 'GET', credentials: 'omit' });
                if (checkRes && checkRes.ok) {
                    const remoteCheck = await checkRes.json();
                    if (AppConfig.isValidPayload(remoteCheck) && AppConfig.areDataPayloadsEqual(appData, remoteCheck)) {
                        appData.pendingSync = false;
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
                        setSyncStatus('reussi');
                        return;
                    }
                }
                setSyncStatus('local', 'Enregistré en local (envoi cloud effectué)');
            } catch (_verifyErr) {
                setSyncStatus('local', 'Enregistré en local (vérification hors-ligne)');
            }
        } catch (e) {
            console.debug('Sync cloud échouée (hors-ligne ?)', e);
            setSyncStatus('erreur', 'Erreur synchro (enregistré en local)');
        }
    }

    /**
     * Met à jour les menus déroulants des périodes CP et RTT via AppEngine.getAvailablePeriods.
     */
    function updateSelectors() {
        if (!DOM.selectCp || !DOM.selectRtt) return;

        const { cpPeriods, rttPeriods } = AppEngine.getAvailablePeriods(
            appData,
            currentCPPeriod,
            currentRTTPeriod,
            getActiveFeriesOptions()
        );

        DOM.selectCp.innerHTML = '';
        cpPeriods.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = AppEngine.formatCPPeriod(y);
            DOM.selectCp.appendChild(opt);
        });
        DOM.selectCp.value = currentCPPeriod;

        DOM.selectRtt.innerHTML = '';
        rttPeriods.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            DOM.selectRtt.appendChild(opt);
        });
        DOM.selectRtt.value = currentRTTPeriod;
    }

    root.changerPeriodeCP = function () {
        currentCPPeriod = DOM.selectCp.value;
        root.mettreAJourAffichage();
    };

    root.changerPeriodeRTT = function () {
        currentRTTPeriod = DOM.selectRtt.value;
        root.mettreAJourAffichage();
    };

    /**
     * Affiche les soldes calculés par AppEngine.calculerSoldes avec Reste / Total explicite,
     * demi-journées exactes et indicateur textuel + visuel de solde négatif.
     */
    function afficherSoldes(soldes) {
        const {
            initCP, prisCP, resteCP, pctResteCP, isNegativeCP,
            initRTT, prisRTT, resteRTT, pctResteRTT, isNegativeRTT
        } = soldes;

        const resteCpStr = formatDaysNumber(resteCP);
        const resteRttStr = formatDaysNumber(resteRTT);
        const totalCpStr = formatDaysNumber(initCP);
        const totalRttStr = formatDaysNumber(initRTT);
        const prisCpStr = formatDaysNumber(prisCP);
        const prisRttStr = formatDaysNumber(prisRTT);

        if (DOM.soldeCp) {
            DOM.soldeCp.textContent = resteCpStr;
            DOM.soldeCp.classList.toggle('text-error', isNegativeCP);
            DOM.soldeCp.classList.toggle('text-slate-900', !isNegativeCP);
        }
        if (DOM.soldeRtt) {
            DOM.soldeRtt.textContent = resteRttStr;
            DOM.soldeRtt.classList.toggle('text-error', isNegativeRTT);
            DOM.soldeRtt.classList.toggle('text-slate-900', !isNegativeRTT);
        }

        if (DOM.resteCpLabel) {
            DOM.resteCpLabel.textContent = resteCpStr;
            DOM.resteCpLabel.classList.toggle('text-error', isNegativeCP);
        }
        if (DOM.resteRttLabel) {
            DOM.resteRttLabel.textContent = resteRttStr;
            DOM.resteRttLabel.classList.toggle('text-error', isNegativeRTT);
        }

        if (DOM.totalCp) DOM.totalCp.textContent = totalCpStr;
        if (DOM.totalRtt) DOM.totalRtt.textContent = totalRttStr;
        if (DOM.prisCp) DOM.prisCp.textContent = prisCpStr;
        if (DOM.prisRtt) DOM.prisRtt.textContent = prisRttStr;

        if (DOM.progressTextCp) DOM.progressTextCp.textContent = `${pctResteCP}%`;
        if (DOM.progressTextRtt) DOM.progressTextRtt.textContent = `${pctResteRTT}%`;

        if (DOM.progressCp) {
            DOM.progressCp.style.width = `${pctResteCP}%`;
            DOM.progressCp.classList.toggle('bg-error', isNegativeCP);
            DOM.progressCp.classList.toggle('bg-indigo-600', !isNegativeCP);
            DOM.progressCp.classList.toggle('bg-primary', !isNegativeCP);
        }
        if (DOM.progressRtt) {
            DOM.progressRtt.style.width = `${pctResteRTT}%`;
            DOM.progressRtt.classList.toggle('bg-error', isNegativeRTT);
            DOM.progressRtt.classList.toggle('bg-emerald-700', !isNegativeRTT);
            DOM.progressRtt.classList.toggle('bg-success', !isNegativeRTT);
        }

        // Jauges circulaires SVG (Lot D #4) : circonférence 2 * Math.PI * 40 ≈ 251.33
        const GAUGE_CIRCUMFERENCE = 251.33;
        if (DOM.gaugeCircleCp) {
            const offsetCp = isNegativeCP
                ? 0
                : Math.round(GAUGE_CIRCUMFERENCE * (1 - pctResteCP / 100) * 100) / 100;
            DOM.gaugeCircleCp.setAttribute?.('stroke-dasharray', String(GAUGE_CIRCUMFERENCE));
            DOM.gaugeCircleCp.setAttribute?.('stroke-dashoffset', String(offsetCp));
            DOM.gaugeCircleCp.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
            DOM.gaugeCircleCp.style.strokeDashoffset = String(offsetCp);
            DOM.gaugeCircleCp.classList.toggle('text-error', isNegativeCP);
            DOM.gaugeCircleCp.classList.toggle('text-indigo-600', !isNegativeCP);
        }
        if (DOM.gaugeRatioCp) {
            DOM.gaugeRatioCp.textContent = `${resteCpStr} / ${totalCpStr} j`;
            DOM.gaugeRatioCp.classList.toggle('text-error', isNegativeCP);
        }

        if (DOM.gaugeCircleRtt) {
            const offsetRtt = isNegativeRTT
                ? 0
                : Math.round(GAUGE_CIRCUMFERENCE * (1 - pctResteRTT / 100) * 100) / 100;
            DOM.gaugeCircleRtt.setAttribute?.('stroke-dasharray', String(GAUGE_CIRCUMFERENCE));
            DOM.gaugeCircleRtt.setAttribute?.('stroke-dashoffset', String(offsetRtt));
            DOM.gaugeCircleRtt.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
            DOM.gaugeCircleRtt.style.strokeDashoffset = String(offsetRtt);
            DOM.gaugeCircleRtt.classList.toggle('text-error', isNegativeRTT);
            DOM.gaugeCircleRtt.classList.toggle('text-emerald-700', !isNegativeRTT);
        }
        if (DOM.gaugeRatioRtt) {
            DOM.gaugeRatioRtt.textContent = `${resteRttStr} / ${totalRttStr} j`;
            DOM.gaugeRatioRtt.classList.toggle('text-error', isNegativeRTT);
        }

        if (DOM.barAccentCp) {
            DOM.barAccentCp.classList.toggle('bg-error', isNegativeCP);
            DOM.barAccentCp.classList.toggle('bg-indigo-600', !isNegativeCP);
        }
        if (DOM.barAccentRtt) {
            DOM.barAccentRtt.classList.toggle('bg-error', isNegativeRTT);
            DOM.barAccentRtt.classList.toggle('bg-emerald-700', !isNegativeRTT);
        }

        if (DOM.negativeBadgeCp) {
            DOM.negativeBadgeCp.classList.toggle('hidden', !isNegativeCP);
            if (isNegativeCP) {
                DOM.negativeBadgeCp.textContent = `Solde CP négatif (${resteCpStr} j / Total ${totalCpStr} j) : dépassement autorisé`;
            }
        }
        if (DOM.negativeBadgeRtt) {
            DOM.negativeBadgeRtt.classList.toggle('hidden', !isNegativeRTT);
            if (isNegativeRTT) {
                DOM.negativeBadgeRtt.textContent = `Solde RTT négatif (${resteRttStr} j / Total ${totalRttStr} j) : dépassement autorisé`;
            }
        }

        if (DOM.initCp) DOM.initCp.value = initCP !== 0 ? initCP : '';
        if (DOM.initRtt) DOM.initRtt.value = initRTT !== 0 ? initRTT : '';
        if (DOM.labelCpYear) DOM.labelCpYear.textContent = currentCPPeriod;
        if (DOM.labelCpYearNext) DOM.labelCpYearNext.textContent = parseInt(currentCPPeriod, 10) + 1;
        if (DOM.labelRttYear) DOM.labelRttYear.textContent = currentRTTPeriod;

        const feriesOpts = getActiveFeriesOptions();
        if (DOM.initPentecote) {
            DOM.initPentecote.checked = Boolean(feriesOpts.lundiPentecoteTravaille);
        }

        if (DOM.initSeuilAlerte) {
            DOM.initSeuilAlerte.value = String(alertPrefs.seuilAlerteJours);
        }
        if (DOM.initEcheanceCp) {
            DOM.initEcheanceCp.value = String(alertPrefs.echeanceReportCP);
        }
        if (DOM.initThemeMode) {
            DOM.initThemeMode.value = String(alertPrefs.theme || 'auto');
        }
        if (DOM.initRappelOuverture) {
            DOM.initRappelOuverture.checked = Boolean(alertPrefs.rappelOuvertureActif);
        }

        const r = appData.configRetraite || {};
        if (DOM.retraiteLegal) DOM.retraiteLegal.value = r.legal || '';
        if (DOM.retraiteAnticipe) DOM.retraiteAnticipe.value = r.anticipe || '';
    }

    /**
     * Calcule et affiche les alertes d'expiration CP et RTT sur le tableau de bord (Lot B).
     * Utilise la date de référence injectée (`injectedReferenceDate`) ou la date du jour.
     */
    function renderExpirationAlerts(customReferenceDate) {
        if (!DOM.expirationAlerts) return null;
        const refDate = customReferenceDate || injectedReferenceDate || new Date();
        const feriesOpts = getActiveFeriesOptions();
        const result = AppEngine.calculerAlertesExpiration(appData, refDate, {
            ...feriesOpts,
            ...alertPrefs,
            cpPeriod: currentCPPeriod,
            rttPeriod: currentRTTPeriod
        });

        DOM.expirationAlerts.innerHTML = '';
        if (!result.alerts || result.alerts.length === 0) {
            DOM.expirationAlerts.classList.add('hidden');
            return result;
        }

        DOM.expirationAlerts.classList.remove('hidden');
        result.alerts.forEach(alertItem => {
            const isRtt = alertItem.type === 'RTT';
            const card = document.createElement('div');
            card.dataset.alertType = alertItem.type;
            card.className = isRtt
                ? 'flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-error-light border border-error/20 text-on-error-container text-sm shadow-sm'
                : 'flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-primary-light border border-primary/30 text-on-primary-container text-sm shadow-sm';

            card.innerHTML = `
                <div class="flex items-start gap-2.5">
                    <span class="material-symbols-outlined text-[20px] shrink-0 mt-0.5">${isRtt ? 'schedule' : 'event_upcoming'}</span>
                    <div>
                        <div class="font-bold">Échéance ${alertItem.type} proche (${alertItem.deadline})</div>
                        <div class="text-xs mt-0.5">${alertItem.message}</div>
                    </div>
                </div>
                <button type="button" class="btn-secondary !py-1 !px-2.5 text-xs shrink-0">Poser</button>
            `;

            const actionBtn = card.querySelector('button');
            if (actionBtn) {
                actionBtn.addEventListener('click', () => {
                    if (DOM.typeAbsence) DOM.typeAbsence.value = alertItem.type;
                    root.preparerAbsence(1);
                });
            }

            DOM.expirationAlerts.appendChild(card);
        });

        return result;
    }

    // ─── Simulateur "Si je pose ces dates" & Suggestion de ponts (Lot C) ───
    root.changerModeSimulateur = function () {
        if (!DOM.simMode) return;
        const isRange = DOM.simMode.value === 'range';
        if (DOM.simDureeContainer) DOM.simDureeContainer.classList.toggle('hidden', isRange);
        if (DOM.simDateFinContainer) DOM.simDateFinContainer.classList.toggle('hidden', !isRange);
        root.lancerSimulationUI();
    };

    /**
     * Exécute la simulation sur une copie immuable de `appData` (aucune modification d'état ni de solde).
     */
    root.lancerSimulationUI = function () {
        if (!DOM.simResultSummary) return null;
        const type = DOM.simType ? DOM.simType.value : 'CP';
        const mode = DOM.simMode ? DOM.simMode.value : 'duration';
        const dateDebut = DOM.simDateDebut ? DOM.simDateDebut.value : '';
        const duree = DOM.simDuree ? parseFloat(DOM.simDuree.value) : 1;
        const dateFin = mode === 'range' && DOM.simDateFin ? DOM.simDateFin.value : '';

        if (!dateDebut) {
            lastSimulationResult = null;
            DOM.simResultSummary.textContent = 'Choisissez une date de début pour lancer la simulation.';
            if (DOM.simResultShift) DOM.simResultShift.classList.add('hidden');
            if (DOM.simResultDetails) DOM.simResultDetails.textContent = '';
            if (DOM.simResultWarning) DOM.simResultWarning.classList.add('hidden');
            return null;
        }

        const result = AppEngine.simulerAbsence(
            appData,
            mode === 'range'
                ? { type, dateDebut, dateFin }
                : { type, dateDebut, duree },
            getActiveFeriesOptions()
        );
        lastSimulationResult = result;

        if (!result.valid) {
            DOM.simResultSummary.textContent = `Simulation impossible : ${result.error}`;
            if (DOM.simResultShift) DOM.simResultShift.classList.add('hidden');
            if (DOM.simResultDetails) DOM.simResultDetails.textContent = '';
            if (DOM.simResultWarning) DOM.simResultWarning.classList.add('hidden');
            return result;
        }

        const dureeStr = formatDaysNumber(result.duree);
        const rangeLabel = result.effectiveStartDate === result.endDate
            ? `le ${result.effectiveStartDate}`
            : `du ${result.effectiveStartDate} au ${result.endDate}`;
        const resteStr = formatDaysNumber(result.soldeRestantPrincipal);
        DOM.simResultSummary.textContent =
            `Si vous posez ${dureeStr} j de ${result.type} (${rangeLabel}), il vous restera ${resteStr} jour${Math.abs(result.soldeRestantPrincipal) > 1 ? 's' : ''}.`;

        if (DOM.simResultShift) {
            if (result.shifted) {
                const raisonLabel = result.shiftReason === 'ferie' ? 'jour férié' : 'week-end';
                DOM.simResultShift.textContent =
                    `Décalage automatique : le ${result.originalDate} tombe un ${raisonLabel}, début effectif au ${result.effectiveStartDate}.`;
                DOM.simResultShift.classList.remove('hidden');
            } else {
                DOM.simResultShift.textContent = '';
                DOM.simResultShift.classList.add('hidden');
            }
        }

        if (DOM.simResultDetails) {
            const detailParts = Object.values(result.detailsParPeriode || {}).map(
                d => `${d.label} : ${formatDaysNumber(d.avant)} j → ${formatDaysNumber(d.apres)} j restants (sur ${formatDaysNumber(d.total)} j)`
            );
            DOM.simResultDetails.textContent = detailParts.join(' | ');
        }

        if (DOM.simResultWarning) {
            if (result.isNegative) {
                DOM.simResultWarning.textContent = `Attention : cette simulation entraîne un solde ${result.type} négatif.`;
                DOM.simResultWarning.classList.remove('hidden');
            } else {
                DOM.simResultWarning.textContent = '';
                DOM.simResultWarning.classList.add('hidden');
            }
        }

        return result;
    };

    /**
     * Préremplit la modale d'absence existante avec les paramètres de la simulation en cours,
     * SANS créer ni enregistrer l'absence automatiquement (Lot C #3).
     */
    root.transformerSimulationEnDemande = function () {
        const sim = lastSimulationResult && lastSimulationResult.valid
            ? lastSimulationResult
            : root.lancerSimulationUI();

        const targetType = sim && sim.type ? sim.type : (DOM.simType ? DOM.simType.value : 'CP');
        const targetDate = sim && sim.valid
            ? sim.effectiveStartDate
            : (DOM.simDateDebut ? DOM.simDateDebut.value : AppEngine.formatLocalDate(new Date()));
        const targetDuree = sim && sim.valid
            ? sim.duree
            : (DOM.simDuree ? parseFloat(DOM.simDuree.value) || 1 : 1);

        setModalMode('create');
        if (DOM.typeAbsence) DOM.typeAbsence.value = targetType;
        root.preparerAbsence(targetDuree, targetDate);
        return { type: targetType, date: targetDate, duree: targetDuree };
    };

    /**
     * Affiche les suggestions de ponts pour l'année sélectionnée en vérifiant que le solde suffit (Lot C #4, #5, #6).
     */
    function renderSuggestionsPonts() {
        if (!DOM.bridgesList || !DOM.bridgesEmpty) return [];
        const targetYear = Number(currentRTTPeriod) || Number(currentCPPeriod) || new Date().getFullYear();
        if (DOM.bridgesYearLabel) {
            DOM.bridgesYearLabel.textContent = String(targetYear);
        }

        const refDateObj = injectedReferenceDate
            ? (AppEngine.parseLocalDate(injectedReferenceDate) || new Date(injectedReferenceDate))
            : new Date();
        const refYear = refDateObj.getFullYear();
        const minDate = targetYear === refYear ? AppEngine.formatLocalDate(refDateObj) : null;

        const suggestions = AppEngine.suggererPonts(appData, targetYear, {
            ...getActiveFeriesOptions(),
            ...(minDate ? { minDate } : {})
        });
        DOM.bridgesList.innerHTML = '';

        if (suggestions.length === 0) {
            DOM.bridgesEmpty.classList.remove('hidden');
            return suggestions;
        }
        DOM.bridgesEmpty.classList.add('hidden');

        suggestions.forEach(pont => {
            const row = document.createElement('div');
            row.dataset.bridgeDate = pont.datePont;
            row.className = 'flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200';

            const optionsText = pont.eligibleOptions
                .map(opt => `${opt.type} (solde avant : ${formatDaysNumber(opt.soldeAvant)} j → solde restant après : ${formatDaysNumber(opt.soldeRestantApres)} j)`)
                .join(' | ');
            const dureeStr = formatDaysNumber(pont.duree);

            row.innerHTML = `
                <div>
                    <div class="font-bold text-slate-900">Pont du ${pont.datePont} • ${pont.nomFerie} (${pont.dateFerie})</div>
                    <div class="text-slate-600 mt-0.5">${dureeStr} jour${pont.duree > 1 ? 's' : ''} à poser (${pont.positionLabel}) → <strong>${pont.type}</strong> recommandé • ${optionsText}</div>
                </div>
                <button type="button" class="btn-secondary !py-1 !px-2.5 text-xs">Préremplir (${pont.type})</button>
            `;

            const btn = row.querySelector('button');
            if (btn) {
                btn.addEventListener('click', () => {
                    setModalMode('create');
                    if (DOM.typeAbsence) DOM.typeAbsence.value = pont.type;
                    root.preparerAbsence(pont.duree, pont.datePont);
                });
            }

            DOM.bridgesList.appendChild(row);
        });

        return suggestions;
    }

    // ─── Statistiques annuelles, Export .ics RFC 5545 & Rappel de solde à l'ouverture (Lot E) ───
    function renderStatistiquesAnnuelles() {
        const targetYear = Number(currentRTTPeriod) || Number(currentCPPeriod) || new Date().getFullYear();
        const stats = AppEngine.calculerStatistiquesAnnuelles(appData, targetYear, {
            ...getActiveFeriesOptions(),
            cpPeriod: currentCPPeriod || String(targetYear),
            rttPeriod: currentRTTPeriod || String(targetYear)
        });

        if (DOM.statsYearLabel) {
            DOM.statsYearLabel.textContent = String(stats.year);
        }
        if (DOM.statsTauxGlobal) {
            DOM.statsTauxGlobal.textContent = `${stats.tauxUtilisationGlobal}%`;
        }
        if (DOM.statsTauxDetail) {
            DOM.statsTauxDetail.textContent =
                `CP : ${stats.tauxUtilisationCP}% (${formatDaysNumber(stats.prisCP)}/${formatDaysNumber(stats.initCP)} j) • RTT : ${stats.tauxUtilisationRTT}% (${formatDaysNumber(stats.prisRTT)}/${formatDaysNumber(stats.initRTT)} j)`;
        }

        if (DOM.statsMoisPlusCharge) {
            if (stats.moisPlusCharge) {
                const nomCap = stats.moisPlusCharge.nomComplet.charAt(0).toUpperCase() + stats.moisPlusCharge.nomComplet.slice(1);
                DOM.statsMoisPlusCharge.textContent = `${nomCap} (${formatDaysNumber(stats.moisPlusCharge.total)} j)`;
                if (DOM.statsMoisPlusChargeDetail) {
                    DOM.statsMoisPlusChargeDetail.textContent =
                        `${formatDaysNumber(stats.moisPlusCharge.cp)} j CP • ${formatDaysNumber(stats.moisPlusCharge.rtt)} j RTT`;
                }
            } else {
                DOM.statsMoisPlusCharge.textContent = 'Aucun';
                if (DOM.statsMoisPlusChargeDetail) {
                    DOM.statsMoisPlusChargeDetail.textContent = '0 jour posé sur l’année';
                }
            }
        }

        if (DOM.statsTotalAnnee) {
            DOM.statsTotalAnnee.textContent = `${formatDaysNumber(stats.totalAnnee)} j`;
        }
        if (DOM.statsTotalAnneeDetail) {
            DOM.statsTotalAnneeDetail.textContent =
                `${formatDaysNumber(stats.totalCPAnnee)} j CP • ${formatDaysNumber(stats.totalRTTAnnee)} j RTT`;
        }

        if (DOM.statsMensuellesGrid) {
            DOM.statsMensuellesGrid.innerHTML = '';
            stats.repartitionMensuelle.forEach(m => {
                const cell = document.createElement('div');
                cell.dataset.month = String(m.mois);
                const isBusiest = stats.moisPlusCharge && stats.moisPlusCharge.mois === m.mois;
                cell.className = isBusiest
                    ? 'p-2 rounded-xl bg-primary-light border border-primary/30 flex flex-col items-center justify-between gap-1'
                    : 'p-2 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-between gap-1';

                cell.innerHTML = `
                    <span class="font-bold text-slate-700">${m.label}</span>
                    <span class="text-sm font-bold text-slate-900">${formatDaysNumber(m.total)} j</span>
                    <div class="flex flex-col text-[10px] leading-tight text-slate-600">
                        <span>CP : ${formatDaysNumber(m.cp)}</span>
                        <span>RTT : ${formatDaysNumber(m.rtt)}</span>
                    </div>
                `;
                DOM.statsMensuellesGrid.appendChild(cell);
            });
        }

        return stats;
    }

    /**
     * Exporte le calendrier des absences au format .ics conforme RFC 5545 en JS pur (Lot E #2 & #5).
     */
    root.exporterCalendrierICS = function (customOptions = {}) {
        const icsContent = AppEngine.genererExportICS(appData, {
            ...getActiveFeriesOptions(),
            ...customOptions
        });

        if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
            try {
                const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `conges-rtt-${currentRTTPeriod || new Date().getFullYear()}.ics`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn('Téléchargement direct .ics indisponible dans cet environnement.', e);
            }
        }
        return icsContent;
    };

    root.fermerRappelOuverture = function () {
        if (DOM.openingReminderBanner) {
            DOM.openingReminderBanner.classList.add('hidden');
            DOM.openingReminderBanner.classList.remove('flex');
        }
    };

    /**
     * Demande explicitement la permission de notification navigateur avec repli gracieux non bloquant si refusée (Lot E #4).
     */
    root.activerNotificationsRappel = async function () {
        sauvegarderPreferencesAlertes({ rappelOuvertureActif: true });
        if (DOM.initRappelOuverture) {
            DOM.initRappelOuverture.checked = true;
        }

        const NotifAPI = root.Notification;
        if (!NotifAPI || typeof NotifAPI.requestPermission !== 'function') {
            if (DOM.notifPermissionStatus) {
                DOM.notifPermissionStatus.textContent =
                    "Notifications système non supportées : le rappel s'affichera via la bannière intégrée à l'ouverture.";
            }
            return { supported: false, permission: 'unsupported', fallback: true };
        }

        try {
            const permission = await NotifAPI.requestPermission();
            if (permission === 'granted') {
                if (DOM.notifPermissionStatus) {
                    DOM.notifPermissionStatus.textContent =
                        "Notifications navigateur autorisées : un rappel de solde s'affichera à l'ouverture de l'application.";
                }
                return { supported: true, permission: 'granted', fallback: false };
            }
            if (DOM.notifPermissionStatus) {
                DOM.notifPermissionStatus.textContent =
                    "Permission refusée : repli gracieux activé (le rappel s'affichera dans la bannière d'accueil sans bloquer l'application).";
            }
            return { supported: true, permission: permission || 'denied', fallback: true };
        } catch (_err) {
            if (DOM.notifPermissionStatus) {
                DOM.notifPermissionStatus.textContent =
                    "Permission indisponible : repli gracieux activé dans la bannière d'accueil.";
            }
            return { supported: true, permission: 'denied', fallback: true };
        }
    };

    /**
     * Affiche le rappel du solde uniquement à l'ouverture de l'appli (`initApp`),
     * sans jamais bloquer l'application si la permission est refusée ou absente (Lot E #4).
     */
    function verifierRappelOuverture() {
        if (!alertPrefs || !alertPrefs.rappelOuvertureActif) {
            root.fermerRappelOuverture();
            return { shown: false, reason: 'disabled' };
        }

        const soldes = AppEngine.calculerSoldes(
            appData,
            currentCPPeriod,
            currentRTTPeriod,
            getActiveFeriesOptions()
        );
        const message =
            `Rappel de vos soldes à l'ouverture : ${formatDaysNumber(soldes.resteCP)} j de CP (${AppEngine.formatCPPeriod(currentCPPeriod)}) et ${formatDaysNumber(soldes.resteRTT)} j de RTT (${currentRTTPeriod}) restants.`;

        if (DOM.openingReminderText && DOM.openingReminderBanner) {
            DOM.openingReminderText.textContent = message;
            DOM.openingReminderBanner.classList.remove('hidden');
            DOM.openingReminderBanner.classList.add('flex');
        }

        const NotifAPI = root.Notification;
        let nativeDispatched = false;
        if (NotifAPI && NotifAPI.permission === 'granted') {
            try {
                new NotifAPI('Suivi Congés & RTT — Rappel de solde', { body: message });
                nativeDispatched = true;
            } catch (_e) {
                // Repli silencieux sur la bannière DOM déjà affichée
            }
        }

        return {
            shown: true,
            nativeDispatched,
            permission: NotifAPI && NotifAPI.permission ? NotifAPI.permission : 'unsupported',
            message
        };
    }

    root.mettreAJourAffichage = function () {
        const soldes = AppEngine.calculerSoldes(
            appData,
            currentCPPeriod,
            currentRTTPeriod,
            getActiveFeriesOptions()
        );
        afficherSoldes(soldes);
        renderExpirationAlerts();
        root.lancerSimulationUI();
        renderSuggestionsPonts();
        renderStatistiquesAnnuelles();
        renderHistorique();
        updateRetraite();
        renderCalendar();
        renderBackupHistory();
    };

    // ─── Navigation Onglets ───
    root.showTab = function (tabName) {
        const tabs = ['dashboard', 'calendar', 'simulator', 'stats'];
        tabs.forEach(t => {
            const el = document.getElementById(`tab-${t}`);
            if (el) {
                el.classList.add('hidden');
                el.classList.remove('block');
                el.classList.remove('flex');
            }
            const nav = document.getElementById(`nav-${t}`);
            if (nav) {
                nav.classList.remove('text-primary', 'bg-primary-light');
                nav.classList.add('text-slate-600');
            }
        });

        const activeEl = document.getElementById(`tab-${tabName}`);
        if (activeEl) {
            activeEl.classList.remove('hidden');
            if (tabName === 'calendar') {
                activeEl.classList.add('flex');
            } else {
                activeEl.classList.add('block');
            }
        }

        const activeNav = document.getElementById(`nav-${tabName}`);
        if (activeNav) {
            activeNav.classList.remove('text-slate-600');
            activeNav.classList.add('text-primary', 'bg-primary-light');
        }
    };

    // ─── Calendrier branché sur AppEngine ───
    root.changeMonth = function (offset) {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
        renderCalendar();
    };

    function renderCalendar() {
        if (!DOM.calendarGrid) return;
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();
        const feriesOpts = getActiveFeriesOptions();
        const feries = AppEngine.getJoursFeries(year, feriesOpts);
        const coveredDaysMap = AppEngine.buildCalendarCoveredDays(appData.absences || [], feriesOpts);

        if (DOM.calendarMonthLabel) {
            DOM.calendarMonthLabel.textContent = new Date(year, month, 1).toLocaleDateString('fr-FR', {
                month: 'long',
                year: 'numeric'
            });
        }
        DOM.calendarGrid.innerHTML = '';

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;

        for (let i = 0; i < startOffset; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'p-2 rounded-lg';
            DOM.calendarGrid.appendChild(emptyDiv);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 1; i <= daysInMonth; i++) {
            const currentDate = new Date(year, month, i, 0, 0, 0, 0);
            const isWknd = AppEngine.isWeekend(currentDate);
            const isToday = currentDate.getTime() === today.getTime();
            const dateStr = AppEngine.formatLocalDate(currentDate);
            const isFerie = feries.includes(dateStr);
            const coveredInfo = coveredDaysMap.get(dateStr);

            const dayBtn = document.createElement('button');
            dayBtn.type = 'button';
            dayBtn.dataset.date = dateStr;
            let baseClass = 'relative flex flex-col items-center justify-center p-2 h-14 rounded-lg font-medium transition-colors active:scale-95 border border-transparent';

            if (isFerie) {
                baseClass += ' bg-error-container/30 text-on-error-container';
            } else if (coveredInfo && coveredInfo.entries.length > 0) {
                const firstType = coveredInfo.entries[0].absence.type;
                baseClass += firstType === 'CP' ? ' cal-day-cp' : ' cal-day-rtt';
            } else if (isWknd) {
                baseClass += ' bg-surface-container-lowest text-on-surface-variant opacity-70';
            } else if (isToday) {
                baseClass += ' bg-primary-container text-on-primary-container font-bold border-primary/30';
            } else {
                baseClass += ' bg-surface hover:bg-surface-container text-on-surface';
            }

            dayBtn.className = baseClass;
            let contentHTML = `<span>${i}</span>`;

            if (isFerie) {
                contentHTML += `<span class="text-[9px] font-semibold text-on-error-container leading-none mt-0.5">Férié</span>`;
                dayBtn.title = 'Jour férié chômé';
            } else if (coveredInfo && coveredInfo.entries.length > 0) {
                const types = Array.from(new Set(coveredInfo.entries.map(e => e.absence.type)));
                const labelType = types.join('+');
                const weightSuffix = coveredInfo.totalWeight < 1 ? ' ½j' : '';
                const dotColor = types[0] === 'CP' ? 'bg-indigo-600' : 'bg-emerald-700';
                contentHTML += `<span class="flex items-center gap-1 text-[9px] font-bold leading-none mt-0.5"><span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>${labelType}${weightSuffix}</span>`;
                dayBtn.title = coveredInfo.entries
                    .map(e => `${e.absence.type} (${formatDaysNumber(e.weight)} j)`)
                    .join(' + ');
            }

            dayBtn.innerHTML = contentHTML;

            dayBtn.addEventListener('click', () => {
                root.preparerAbsence(1, dateStr);
            });

            DOM.calendarGrid.appendChild(dayBtn);
        }
    }

    // ─── Retraite branchée sur AppEngine ───
    root.toggleRetraiteSize = function () {
        appData.configRetraite = appData.configRetraite || {};
        appData.configRetraite.minimized = !appData.configRetraite.minimized;
        sauvegarderDonneesCloud();
        updateRetraite();
    };

    function updateRetraite() {
        if (!DOM.retraiteCard) return;
        const r = appData.configRetraite || {};

        if (!r.legal && !r.anticipe) {
            DOM.retraiteCard.classList.add('hidden');
            return;
        }
        DOM.retraiteCard.classList.remove('hidden');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (r.minimized) {
            DOM.retraiteExpanded.classList.add('hidden');
            DOM.retraiteMinimized.classList.remove('hidden');
            DOM.retraiteMinimized.classList.add('flex');
            DOM.retraiteIcon.classList.add('rotated');

            const targetStr = r.anticipe || r.legal;
            DOM.decompteMini.textContent = AppEngine.formatDetailedCountdown(targetStr, today) + (r.anticipe ? ' (Anticipé)' : '');
        } else {
            DOM.retraiteExpanded.classList.remove('hidden');
            DOM.retraiteMinimized.classList.add('hidden');
            DOM.retraiteMinimized.classList.remove('flex');
            DOM.retraiteIcon.classList.remove('rotated');

            if (r.legal) {
                const target = AppEngine.parseLocalDate(r.legal) || new Date(r.legal);
                const diffDays = Math.ceil((target - today) / 86400000);
                DOM.decompteLegal.textContent = diffDays > 0 ? String(diffDays) : '0';
                DOM.decompteLegalDetail.textContent = AppEngine.formatDetailedCountdown(target, today);
                DOM.dateLegalLabel.textContent = target.toLocaleDateString('fr-FR');
            }

            if (r.anticipe) {
                DOM.anticipeContainer.classList.remove('hidden');
                const target = AppEngine.parseLocalDate(r.anticipe) || new Date(r.anticipe);
                const diffDays = Math.ceil((target - today) / 86400000);
                DOM.decompteAnticipe.textContent = diffDays > 0 ? String(diffDays) : '0';
                DOM.decompteAnticipeDetail.textContent = AppEngine.formatDetailedCountdown(target, today);
                DOM.dateAnticipeLabel.textContent = target.toLocaleDateString('fr-FR');
            } else {
                DOM.anticipeContainer.classList.add('hidden');
            }
        }
    }

    // ─── Configuration des compteurs et de Pentecôte ───
    root.sauvegarderConfig = function () {
        enregistrerSauvegardeLocale('Modification des paramètres', 'config');

        appData.configCP[currentCPPeriod] = parseFloat(DOM.initCp.value) || 0;
        appData.configRTT[currentRTTPeriod] = parseFloat(DOM.initRtt.value) || 0;

        appData.configRetraite = appData.configRetraite || {};
        appData.configRetraite.legal = DOM.retraiteLegal.value;
        appData.configRetraite.anticipe = DOM.retraiteAnticipe.value;

        if (DOM.initPentecote) {
            appData.configFeries = appData.configFeries || {};
            appData.configFeries.lundiPentecoteTravaille = Boolean(DOM.initPentecote.checked);
        }

        // Sauvegarde séparée des préférences d'alerte (Lot B #1 : hors de appData et du payload Google Sheets)
        const nextSeuil = DOM.initSeuilAlerte && DOM.initSeuilAlerte.value !== ''
            ? Number(DOM.initSeuilAlerte.value)
            : alertPrefs.seuilAlerteJours;
        const nextEcheance = DOM.initEcheanceCp && DOM.initEcheanceCp.value
            ? String(DOM.initEcheanceCp.value).trim()
            : alertPrefs.echeanceReportCP;
        const nextTheme = DOM.initThemeMode && DOM.initThemeMode.value
            ? String(DOM.initThemeMode.value).trim()
            : alertPrefs.theme;
        const nextRappel = DOM.initRappelOuverture
            ? Boolean(DOM.initRappelOuverture.checked)
            : Boolean(alertPrefs.rappelOuvertureActif);
        sauvegarderPreferencesAlertes({
            seuilAlerteJours: nextSeuil,
            echeanceReportCP: nextEcheance,
            theme: nextTheme,
            rappelOuvertureActif: nextRappel
        });

        sauvegarderDonneesCloud();
        root.mettreAJourAffichage();
        root.mettreAJourApercuAbsence();
        root.toggleConfig();
    };

    // ─── Modale d'absence (Création & Édition), Aperçu temps réel & Enregistrement ───
    function setModalMode(mode, absenceToEdit = null) {
        if (mode === 'edit' && absenceToEdit) {
            editingAbsenceId = Number(absenceToEdit.id);
            if (DOM.modalAbsenceTitle) DOM.modalAbsenceTitle.textContent = "Modifier l'absence";
            if (DOM.modalAbsenceIcon) DOM.modalAbsenceIcon.textContent = 'edit';
            if (DOM.btnSubmitAbsence) DOM.btnSubmitAbsence.textContent = 'Enregistrer les modifications';
        } else {
            editingAbsenceId = null;
            if (DOM.modalAbsenceTitle) DOM.modalAbsenceTitle.textContent = 'Nouvelle Absence';
            if (DOM.modalAbsenceIcon) DOM.modalAbsenceIcon.textContent = 'add_circle';
            if (DOM.btnSubmitAbsence) DOM.btnSubmitAbsence.textContent = 'Enregistrer';
        }
    }

    root.ouvrirNouvelleAbsence = function () {
        setModalMode('create');
        root.preparerAbsence(1);
    };

    root.preparerAbsence = function (duree, dateStr) {
        setModalMode('create');
        if (DOM.dureeAbsence && duree !== undefined) {
            DOM.dureeAbsence.value = duree;
        }
        if (DOM.dateDebut) {
            if (dateStr) {
                DOM.dateDebut.value = dateStr;
            } else if (!DOM.dateDebut.value) {
                DOM.dateDebut.value = AppEngine.formatLocalDate(new Date());
            }
        }
        hideModalError();
        if (typeof root.toggleAbsenceModal === 'function') {
            root.toggleAbsenceModal(true);
        } else if (DOM.formAbsence) {
            DOM.formAbsence.classList.remove('hidden');
            DOM.formAbsence.classList.add('flex');
        }
        root.mettreAJourApercuAbsence();
    };

    /**
     * Ouvre la modale préremplie pour modifier une absence existante.
     */
    root.editerAbsence = function (id) {
        const target = (appData.absences || []).find(a => a.id === Number(id));
        if (!target) return false;

        setModalMode('edit', target);
        if (DOM.typeAbsence) DOM.typeAbsence.value = target.type;
        if (DOM.dateDebut) DOM.dateDebut.value = target.date;
        if (DOM.dureeAbsence) DOM.dureeAbsence.value = target.duree;

        hideModalError();
        if (typeof root.toggleAbsenceModal === 'function') {
            root.toggleAbsenceModal(true);
        } else if (DOM.formAbsence) {
            DOM.formAbsence.classList.remove('hidden');
            DOM.formAbsence.classList.add('flex');
        }
        root.mettreAJourApercuAbsence();
        return true;
    };

    /**
     * Calcule et affiche l'aperçu de l'absence dans la modale sans rien enregistrer.
     */
    root.mettreAJourApercuAbsence = function () {
        if (!DOM.previewBox || !DOM.typeAbsence || !DOM.dateDebut || !DOM.dureeAbsence) return;

        const type = DOM.typeAbsence.value;
        const date = DOM.dateDebut.value;
        const duree = parseFloat(DOM.dureeAbsence.value);
        const feriesOpts = {
            ...getActiveFeriesOptions(),
            excludeId: editingAbsenceId
        };

        const validation = AppEngine.validerAbsence(
            { type, date, duree },
            appData.absences || [],
            feriesOpts,
            appData
        );

        if (!validation.valid) {
            DOM.previewDates.textContent = `Saisie invalide : ${validation.error}`;
            DOM.previewShift.classList.add('hidden');
            DOM.previewBalance.textContent = '';
            DOM.previewNegativeWarn.classList.add('hidden');
            return validation;
        }

        const dureeStr = formatDaysNumber(duree);
        if (validation.effectiveStartDate === validation.endDate) {
            DOM.previewDates.textContent = `Date effective : le ${validation.effectiveStartDate} (${dureeStr} jour${duree > 1 ? 's' : ''} ouvré${duree > 1 ? 's' : ''})`;
        } else {
            DOM.previewDates.textContent = `Dates effectives : du ${validation.effectiveStartDate} au ${validation.endDate} (${dureeStr} jour${duree > 1 ? 's' : ''} ouvré${duree > 1 ? 's' : ''})`;
        }

        if (validation.shifted) {
            const raisonLabel = validation.shiftReason === 'ferie' ? 'jour férié' : 'week-end';
            DOM.previewShift.textContent = `Décalage automatique : le ${validation.originalDate} tombe un ${raisonLabel}, début reporté au ${validation.effectiveStartDate}.`;
            DOM.previewShift.classList.remove('hidden');
        } else {
            DOM.previewShift.textContent = '';
            DOM.previewShift.classList.add('hidden');
        }

        const periodEntries = Object.entries(validation.projectedBalances || {});
        if (periodEntries.length > 0) {
            const parts = periodEntries.map(([p, reste]) => {
                const total = type === 'CP' ? (Number(appData.configCP[p]) || 0) : (Number(appData.configRTT[p]) || 0);
                const pLabel = type === 'CP' ? AppEngine.formatCPPeriod(p) : p;
                return `${pLabel} → Reste : ${formatDaysNumber(reste)} / Total : ${formatDaysNumber(total)} j`;
            });
            DOM.previewBalance.textContent = `Solde projeté (${type}) : ${parts.join(' | ')}`;
        } else {
            DOM.previewBalance.textContent = '';
        }

        if (validation.isNegative) {
            DOM.previewNegativeWarn.textContent = `Avertissement : cette demande entraîne un solde ${type} négatif (enregistrement autorisé).`;
            DOM.previewNegativeWarn.classList.remove('hidden');
        } else {
            DOM.previewNegativeWarn.textContent = '';
            DOM.previewNegativeWarn.classList.add('hidden');
        }

        return validation;
    };

    /**
     * Valide et enregistre une nouvelle absence ou la modification d'une absence existante.
     * - Met systématiquement à jour updatedAt via sauvegarderDonneesCloud().
     * - Enregistre l'instantané quotidien (au plus 1/jour) et l'annulation 10s en mémoire.
     */
    root.ajouterAbsence = function (customNow = Date.now()) {
        if (isSubmittingAbsence) return false;
        isSubmittingAbsence = true;
        if (DOM.btnSubmitAbsence) DOM.btnSubmitAbsence.disabled = true;

        try {
            const type = DOM.typeAbsence.value;
            const date = DOM.dateDebut.value;
            const duree = parseFloat(DOM.dureeAbsence.value);
            const feriesOpts = {
                ...getActiveFeriesOptions(),
                excludeId: editingAbsenceId
            };

            const validation = AppEngine.validerAbsence(
                { type, date, duree },
                appData.absences || [],
                feriesOpts,
                appData
            );

            if (!validation.valid) {
                showModalError(validation.error);
                showError(validation.error);
                return false;
            }

            hideModalError();
            hideError();

            if (editingAbsenceId !== null) {
                const idx = appData.absences.findIndex(a => a.id === editingAbsenceId);
                if (idx === -1) {
                    setModalMode('create');
                    return false;
                }
                enregistrerSauvegardeLocale('Modification d’une absence', 'edit', customNow);
                enregistrerActionAnnulable(appData, 'Absence modifiée', customNow);

                appData.absences[idx] = {
                    ...appData.absences[idx],
                    id: editingAbsenceId,
                    type,
                    date: validation.effectiveStartDate,
                    duree
                };
            } else {
                enregistrerSauvegardeLocale('Ajout d’une absence', 'add', customNow);
                enregistrerActionAnnulable(appData, 'Absence ajoutée', customNow);

                appData.absences.push({
                    id: typeof customNow === 'number' ? customNow : Date.now(),
                    type,
                    date: validation.effectiveStartDate,
                    duree
                });
            }

            setModalMode('create');
            sauvegarderDonneesCloud(customNow);
            updateSelectors();
            root.mettreAJourAffichage();

            DOM.dureeAbsence.value = 1;
            if (typeof root.toggleAbsenceModal === 'function') {
                root.toggleAbsenceModal(false);
            } else if (DOM.formAbsence) {
                DOM.formAbsence.classList.add('hidden');
                DOM.formAbsence.classList.remove('flex');
            }
            return true;
        } finally {
            isSubmittingAbsence = false;
            if (DOM.btnSubmitAbsence) DOM.btnSubmitAbsence.disabled = false;
        }
    };

    function updateDeleteLockUI() {
        if (!DOM.btnToggleDeleteLock) return;
        DOM.btnToggleDeleteLock.setAttribute?.('aria-pressed', String(isDeleteUnlocked));

        if (isDeleteUnlocked) {
            DOM.btnToggleDeleteLock.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-error/20 bg-error-light text-on-error-container text-xs font-semibold transition-colors cursor-pointer';
            if (DOM.deleteLockIcon) DOM.deleteLockIcon.textContent = 'lock_open';
            if (DOM.deleteLockLabel) DOM.deleteLockLabel.textContent = 'Verrouiller';
        } else {
            DOM.btnToggleDeleteLock.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 text-xs font-medium transition-colors cursor-pointer';
            if (DOM.deleteLockIcon) DOM.deleteLockIcon.textContent = 'lock';
            if (DOM.deleteLockLabel) DOM.deleteLockLabel.textContent = 'Déverrouiller';
        }
    }

    root.toggleDeleteLock = function () {
        isDeleteUnlocked = !isDeleteUnlocked;
        if (!isDeleteUnlocked) {
            pendingDeleteConfirmId = null;
        }
        updateDeleteLockUI();
        renderHistorique();
        return isDeleteUnlocked;
    };

    root.demanderConfirmationSuppression = function (id) {
        if (!isDeleteUnlocked) {
            showError("Suppression verrouillée : cliquez d'abord sur « Déverrouiller ».");
            return false;
        }
        pendingDeleteConfirmId = Number(id);
        renderHistorique();
        return true;
    };

    root.annulerConfirmationSuppression = function () {
        pendingDeleteConfirmId = null;
        renderHistorique();
    };

    /**
     * Supprime une absence après déverrouillage ET confirmation.
     * Prend systématiquement un instantané dans l'historique des 5 sauvegardes locales ('delete')
     * et active l'annulation pendant 10 secondes en mémoire.
     */
    root.supprimerAbsence = function (id, confirmed = undefined, customNow = Date.now()) {
        if (!isDeleteUnlocked) {
            showError("Suppression verrouillée : cliquez d'abord sur « Déverrouiller ».");
            return false;
        }

        const numId = Number(id);
        const exists = (appData.absences || []).some(a => a.id === numId);
        if (!exists) return false;

        // Confirmation avant suppression : soit confirmée via le bouton inline (confirmed === true ou pendingDeleteConfirmId === numId),
        // soit via window.confirm si présent.
        const isConfirmed =
            confirmed === true ||
            pendingDeleteConfirmId === numId ||
            (confirmed === undefined && (typeof root.confirm === 'function' ? Boolean(root.confirm('Confirmer la suppression de cette absence ?')) : true));

        if (!isConfirmed) {
            return false;
        }

        // Instantané obligatoire avant chaque suppression (Lot A #2)
        enregistrerSauvegardeLocale('Avant suppression d’absence', 'delete', customNow);
        enregistrerActionAnnulable(appData, 'Absence supprimée', customNow);

        pendingDeleteConfirmId = null;
        appData.absences = appData.absences.filter(a => a.id !== numId);
        sauvegarderDonneesCloud(customNow);
        updateSelectors();
        root.mettreAJourAffichage();
        root.mettreAJourApercuAbsence();
        return true;
    };

    // ─── Historique branché sur AppEngine (avec filtres lecture seule Lot B) ───
    root.changerFiltreHistoriqueType = function () {
        if (DOM.filterHistoryType) {
            historyFilterType = DOM.filterHistoryType.value || 'ALL';
        }
        renderHistorique();
    };

    root.changerFiltreHistoriquePeriode = function () {
        if (DOM.filterHistoryPeriod) {
            historyFilterPeriod = DOM.filterHistoryPeriod.value || 'ALL';
        }
        renderHistorique();
    };

    function renderHistorique() {
        updateDeleteLockUI();
        if (!DOM.historiqueList || !DOM.historiqueVide) return;
        DOM.historiqueList.innerHTML = '';

        const feriesOpts = getActiveFeriesOptions();
        const filteredResult = AppEngine.filtrerAbsencesHistorique(
            appData.absences || [],
            { type: historyFilterType, period: historyFilterPeriod },
            feriesOpts
        );

        // Réinitialisation automatique si la période filtrée disparaît (Lot B #5)
        historyFilterType = filteredResult.effectiveType;
        historyFilterPeriod = filteredResult.effectivePeriod;

        if (DOM.filterHistoryType) {
            DOM.filterHistoryType.value = historyFilterType;
        }
        if (DOM.filterHistoryPeriod) {
            DOM.filterHistoryPeriod.innerHTML = '';
            const allOpt = document.createElement('option');
            allOpt.value = 'ALL';
            allOpt.textContent = 'Toutes les périodes';
            DOM.filterHistoryPeriod.appendChild(allOpt);

            filteredResult.availablePeriods.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = `Période ${p} (${AppEngine.formatCPPeriod(p)})`;
                DOM.filterHistoryPeriod.appendChild(opt);
            });
            DOM.filterHistoryPeriod.value = historyFilterPeriod;
        }

        const tries = filteredResult.items;
        if (tries.length === 0) {
            DOM.historiqueVide.classList.remove('hidden');
            return;
        }
        DOM.historiqueVide.classList.add('hidden');

        const deleteBtnClass = isDeleteUnlocked
            ? 'text-on-surface-variant hover:text-error transition-colors p-2 rounded-full hover:bg-error-container cursor-pointer'
            : 'text-slate-400 opacity-50 p-2 rounded-full';
        const deleteBtnTitle = isDeleteUnlocked
            ? 'Supprimer cette demande'
            : 'Suppression verrouillée — cliquez sur Déverrouiller';

        tries.forEach(a => {
            const expanded = AppEngine.expandAbsenceDays(a, feriesOpts);
            const dateObj = AppEngine.parseLocalDate(a.date) || new Date(a.date);
            const day = dateObj.getDate();
            const month = dateObj.toLocaleDateString('fr-FR', { month: 'short' });

            const periodsCovered = Array.from(
                new Set(expanded.days.map(d => (a.type === 'CP' ? AppEngine.formatCPPeriod(d.cpPeriod) : d.rttPeriod)))
            );
            const periodTag = periodsCovered.length > 0
                ? periodsCovered.join(' & ')
                : (a.type === 'CP' ? AppEngine.formatCPPeriod(AppEngine.getCPPeriod(a.date)) : AppEngine.getRTTPeriod(a.date));

            const rangeLabel = expanded.effectiveStartDate !== expanded.endDate
                ? `Du ${expanded.effectiveStartDate} au ${expanded.endDate}`
                : `Le ${expanded.effectiveStartDate}`;

            const iconBgClass = a.type === 'CP'
                ? 'badge-cp'
                : 'badge-rtt';
            const badgeBgClass = a.type === 'CP'
                ? 'badge-cp'
                : 'badge-rtt';

            const item = document.createElement('div');
            item.className = 'p-4 flex items-center justify-between hover:bg-surface-bright transition-colors border-b border-surface-container-high/40 last:border-0';

            const dureeStr = formatDaysNumber(a.duree);
            const isConfirmingThis = isDeleteUnlocked && pendingDeleteConfirmId === a.id;

            item.innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-lg ${iconBgClass} flex flex-col items-center justify-center shrink-0">
                        <span class="font-bold leading-none">${day}</span>
                        <span class="text-[9px] uppercase tracking-wider">${month}</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-semibold text-on-surface">${rangeLabel}</h4>
                            <span class="px-2 py-0.5 rounded-full ${badgeBgClass} text-xs font-semibold">${a.type}</span>
                        </div>
                        <p class="text-xs text-on-surface-variant mt-0.5">${dureeStr} jour${a.duree > 1 ? 's' : ''} • ${periodTag}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" data-action="edit" title="Modifier cette demande" class="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-primary-light cursor-pointer" aria-label="Modifier">
                        <span class="material-symbols-outlined text-[20px]">edit</span>
                    </button>
                    ${isConfirmingThis
                        ? `<button type="button" data-action="confirm-delete" class="px-2.5 py-1 rounded-lg bg-error-light border border-error/20 text-on-error-container text-xs font-bold cursor-pointer">Confirmer ?</button>
                           <button type="button" data-action="cancel-delete" class="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium cursor-pointer">Non</button>`
                        : `<button type="button" data-action="delete" ${isDeleteUnlocked ? '' : 'disabled'} title="${deleteBtnTitle}" class="${deleteBtnClass}" aria-label="Supprimer">
                               <span class="material-symbols-outlined text-[20px]">delete</span>
                           </button>`
                    }
                </div>
            `;

            // Liaisons d'événements propres par data-action (avec repli sur button pour le sandbox léger)
            const editBtn = item.querySelector('[data-action="edit"]');
            if (editBtn) {
                editBtn.addEventListener('click', () => root.editerAbsence(a.id));
            }

            const confirmBtn = item.querySelector('[data-action="confirm-delete"]');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => root.supprimerAbsence(a.id, true));
            }

            const cancelBtn = item.querySelector('[data-action="cancel-delete"]');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => root.annulerConfirmationSuppression());
            }

            const deleteBtn = item.querySelector('[data-action="delete"]') || (!confirmBtn ? item.querySelector('button') : null);
            if (deleteBtn) {
                deleteBtn.disabled = !isDeleteUnlocked;
                deleteBtn.className = deleteBtnClass;
                deleteBtn.addEventListener('click', () => {
                    if (!isDeleteUnlocked) {
                        root.supprimerAbsence(a.id, false);
                    } else {
                        root.demanderConfirmationSuppression(a.id);
                    }
                });
            }

            DOM.historiqueList.appendChild(item);
        });
    }

    root.toggleConfig = function () {
        if (DOM.configSection) {
            DOM.configSection.classList.toggle('hidden');
            renderBackupHistory();
        }
    };

    function showModalError(msg) {
        if (!DOM.modalErrorMessage || !DOM.modalErrorText) return;
        DOM.modalErrorText.textContent = msg;
        DOM.modalErrorMessage.classList.remove('hidden');
        DOM.modalErrorMessage.classList.add('flex');
    }

    function hideModalError() {
        if (!DOM.modalErrorMessage) return;
        DOM.modalErrorMessage.classList.add('hidden');
        DOM.modalErrorMessage.classList.remove('flex');
    }

    function showError(msg) {
        if (!DOM.errorMessage || !DOM.errorText) return;
        DOM.errorText.textContent = msg;
        DOM.errorMessage.classList.remove('hidden');
        DOM.errorMessage.classList.add('flex');
        if (errorTimeoutId) clearTimeout(errorTimeoutId);
        errorTimeoutId = setTimeout(() => hideError(), 6000);
    }

    root.hideError = function () {
        if (!DOM.errorMessage) return;
        DOM.errorMessage.classList.add('hidden');
        DOM.errorMessage.classList.remove('flex');
    };
    const hideError = root.hideError;

    // Exposition d'accesseurs d'état pour les tests d'intégration
    root.__appTestHooks = {
        initApp,
        getAppData: () => appData,
        setAppData: (newData) => {
            appData = AppConfig.migrateData(newData);
            updateSelectors();
            root.mettreAJourAffichage();
        },
        getSyncState: () => currentSyncState,
        getPendingConflict: () => pendingConflict,
        getCurrentPeriods: () => ({ cp: currentCPPeriod, rtt: currentRTTPeriod }),
        isDeleteUnlocked: () => isDeleteUnlocked,
        getEditingAbsenceId: () => editingAbsenceId,
        getPendingDeleteConfirmId: () => pendingDeleteConfirmId,
        getLastUndoState: () => lastUndoState,
        getBackupHistory: () => lireHistoriqueSauvegardes(),
        getAlertPrefs: () => ({ ...alertPrefs }),
        setAlertPrefs: (prefs) => {
            sauvegarderPreferencesAlertes(prefs);
            root.mettreAJourAffichage();
        },
        setReferenceDate: (refDate) => {
            injectedReferenceDate = refDate;
            if (refDate) {
                currentCPPeriod = AppEngine.getCPPeriod(refDate);
                currentRTTPeriod = AppEngine.getRTTPeriod(refDate);
                updateSelectors();
            }
            root.mettreAJourAffichage();
        },
        getHistoryFilters: () => ({ type: historyFilterType, period: historyFilterPeriod }),
        setHistoryFilters: ({ type, period } = {}) => {
            if (type !== undefined) historyFilterType = type;
            if (period !== undefined) historyFilterPeriod = period;
            renderHistorique();
        },
        getLastSimulationResult: () => lastSimulationResult
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', initApp);
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('ServiceWorker enregistré:', reg.scope))
                .catch(err => console.warn('Échec ServiceWorker:', err));
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
