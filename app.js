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
    const BACKUP_STORAGE_KEY = `${STORAGE_KEY}_backup`;
    const CONFLICT_STORAGE_KEY = `${STORAGE_KEY}_conflict_backup`;

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
        DOM.labelCpYear         = document.getElementById('label-cp-year');
        DOM.labelCpYearNext     = document.getElementById('label-cp-year-next');
        DOM.labelRttYear        = document.getElementById('label-rtt-year');
        DOM.retraiteLegal       = document.getElementById('init-retraite-legal');
        DOM.retraiteAnticipe    = document.getElementById('init-retraite-anticipe');
        DOM.selectCp            = document.getElementById('select-cp-period');
        DOM.selectRtt           = document.getElementById('select-rtt-period');
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
        DOM.previewBox          = document.getElementById('absence-preview');
        DOM.previewDates        = document.getElementById('preview-dates');
        DOM.previewShift        = document.getElementById('preview-shift');
        DOM.previewBalance      = document.getElementById('preview-balance');
        DOM.previewNegativeWarn = document.getElementById('preview-negative-warning');
        DOM.modalErrorMessage   = document.getElementById('modal-error-message');
        DOM.modalErrorText      = document.getElementById('modal-error-text');
        DOM.errorMessage        = document.getElementById('error-message');
        DOM.errorText           = document.getElementById('error-text');
        DOM.conflictBanner      = document.getElementById('conflict-banner');
        DOM.conflictDescription = document.getElementById('conflict-description');
        DOM.syncStatusDot       = document.getElementById('sync-status-dot');
        DOM.syncStatusText      = document.getElementById('sync-status-text');
        DOM.configSection       = document.getElementById('config-section');
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
    }

    let appData = AppConfig.createEmptyData();
    let currentCPPeriod = '';
    let currentRTTPeriod = '';
    let currentCalendarDate = new Date();
    let currentSyncState = 'local'; // 'local' | 'en_cours' | 'reussi' | 'erreur' | 'conflit'
    let pendingConflict = null;     // { localData, remoteData, reason }
    let isSubmittingAbsence = false;
    let errorTimeoutId = null;

    /**
     * Retourne les options de jours fériés actives (lundiPentecoteTravaille configurable, true par défaut).
     */
    function getActiveFeriesOptions() {
        return AppConfig.getFeriesOptions(appData && appData.configFeries ? appData.configFeries : {});
    }

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
     * Persiste une copie de sauvegarde dans localStorage avant toute transformation ou résolution.
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

        // Préserve les deux versions dans localStorage jusqu'au choix explicite
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
     */
    async function initApp() {
        initDOM();

        const today = AppEngine.formatLocalDate(new Date());
        currentCPPeriod = AppEngine.getCPPeriod(today);
        currentRTTPeriod = AppEngine.getRTTPeriod(today);
        if (DOM.dateDebut) DOM.dateDebut.value = today;

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
    }

    /**
     * Sauvegarde locale immédiate + envoi Cloud avec vérification réelle de l'état.
     */
    async function sauvegarderDonneesCloud() {
        AppConfig.markUpdated(appData);
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
                // Si la vérification GET ne confirme pas encore l'égalité, on indique honnêtement l'état local
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
            DOM.progressCp.classList.toggle('bg-primary', !isNegativeCP);
        }
        if (DOM.progressRtt) {
            DOM.progressRtt.style.width = `${pctResteRTT}%`;
            DOM.progressRtt.classList.toggle('bg-error', isNegativeRTT);
            DOM.progressRtt.classList.toggle('bg-success', !isNegativeRTT);
        }

        // Badges textuels explicites pour accompagner la couleur en cas de solde négatif
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

        const r = appData.configRetraite || {};
        if (DOM.retraiteLegal) DOM.retraiteLegal.value = r.legal || '';
        if (DOM.retraiteAnticipe) DOM.retraiteAnticipe.value = r.anticipe || '';
    }

    root.mettreAJourAffichage = function () {
        const soldes = AppEngine.calculerSoldes(
            appData,
            currentCPPeriod,
            currentRTTPeriod,
            getActiveFeriesOptions()
        );
        afficherSoldes(soldes);
        renderHistorique();
        updateRetraite();
        renderCalendar();
    };

    // ─── Navigation Onglets ───
    root.showTab = function (tabName) {
        const tabs = ['dashboard', 'calendar'];
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
            if (tabName === 'dashboard') activeEl.classList.add('block');
            if (tabName === 'calendar') activeEl.classList.add('flex');
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
                const dotColor = types[0] === 'CP' ? 'bg-primary' : 'bg-secondary';
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
        appData.configCP[currentCPPeriod] = parseFloat(DOM.initCp.value) || 0;
        appData.configRTT[currentRTTPeriod] = parseFloat(DOM.initRtt.value) || 0;

        appData.configRetraite = appData.configRetraite || {};
        appData.configRetraite.legal = DOM.retraiteLegal.value;
        appData.configRetraite.anticipe = DOM.retraiteAnticipe.value;

        if (DOM.initPentecote) {
            appData.configFeries = appData.configFeries || {};
            appData.configFeries.lundiPentecoteTravaille = Boolean(DOM.initPentecote.checked);
        }

        sauvegarderDonneesCloud();
        root.mettreAJourAffichage();
        root.mettreAJourApercuAbsence();
        root.toggleConfig();
    };

    // ─── Modale d'absence, Aperçu temps réel & Enregistrement ───
    root.preparerAbsence = function (duree, dateStr) {
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
     * Calcule et affiche l'aperçu de l'absence dans la modale sans rien enregistrer.
     */
    root.mettreAJourApercuAbsence = function () {
        if (!DOM.previewBox || !DOM.typeAbsence || !DOM.dateDebut || !DOM.dureeAbsence) return;

        const type = DOM.typeAbsence.value;
        const date = DOM.dateDebut.value;
        const duree = parseFloat(DOM.dureeAbsence.value);
        const feriesOpts = getActiveFeriesOptions();

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

        // Affichage du solde projeté par période impactée
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
     * Valide et enregistre une nouvelle absence.
     * - Empêche les doubles soumissions.
     * - En cas d'erreur, conserve la modale ouverte et les valeurs saisies intactes.
     * - Ne modifie jamais rétroactivement les congés déjà enregistrés.
     */
    root.ajouterAbsence = function () {
        if (isSubmittingAbsence) return false;
        isSubmittingAbsence = true;
        if (DOM.btnSubmitAbsence) DOM.btnSubmitAbsence.disabled = true;

        try {
            const type = DOM.typeAbsence.value;
            const date = DOM.dateDebut.value;
            const duree = parseFloat(DOM.dureeAbsence.value);
            const feriesOpts = getActiveFeriesOptions();

            const validation = AppEngine.validerAbsence(
                { type, date, duree },
                appData.absences || [],
                feriesOpts,
                appData
            );

            if (!validation.valid) {
                showModalError(validation.error);
                showError(validation.error);
                // Conserve la modale ouverte et la saisie intacte
                return false;
            }

            hideModalError();
            hideError();

            // Enregistre la date effective ouvrée calculée par le moteur
            appData.absences.push({
                id: Date.now(),
                type,
                date: validation.effectiveStartDate,
                duree
            });

            sauvegarderDonneesCloud();
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

    root.supprimerAbsence = function (id) {
        appData.absences = appData.absences.filter(a => a.id !== Number(id));
        sauvegarderDonneesCloud();
        updateSelectors();
        root.mettreAJourAffichage();
        root.mettreAJourApercuAbsence();
    };

    // ─── Historique branché sur AppEngine ───
    function renderHistorique() {
        if (!DOM.historiqueList || !DOM.historiqueVide) return;
        DOM.historiqueList.innerHTML = '';

        if (!appData.absences || appData.absences.length === 0) {
            DOM.historiqueVide.classList.remove('hidden');
            return;
        }
        DOM.historiqueVide.classList.add('hidden');

        const feriesOpts = getActiveFeriesOptions();
        const tries = [...appData.absences].sort((a, b) => {
            const da = AppEngine.parseLocalDate(a.date) || new Date(0);
            const db = AppEngine.parseLocalDate(b.date) || new Date(0);
            return db - da;
        });

        tries.forEach(a => {
            const expanded = AppEngine.expandAbsenceDays(a, feriesOpts);
            const dateObj = AppEngine.parseLocalDate(a.date) || new Date(a.date);
            const day = dateObj.getDate();
            const month = dateObj.toLocaleDateString('fr-FR', { month: 'short' });

            // Périodes couvertes (affiche les deux périodes si le congé est ventilé à cheval)
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
                ? 'bg-surface-container-low text-primary'
                : 'bg-surface-container text-on-surface-variant';
            const badgeBgClass = a.type === 'CP'
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container-high text-on-secondary-container';

            const item = document.createElement('div');
            item.className = 'p-4 flex items-center justify-between hover:bg-surface-bright transition-colors border-b border-surface-container-high/40 last:border-0';

            const dureeStr = formatDaysNumber(a.duree);
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
                <div class="flex flex-col items-end gap-1">
                    <button type="button" class="text-on-surface-variant hover:text-error transition-colors p-2 rounded-full hover:bg-error-container" aria-label="Supprimer">
                        <span class="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                </div>
            `;

            const deleteBtn = item.querySelector('button');
            deleteBtn.addEventListener('click', () => root.supprimerAbsence(a.id));

            DOM.historiqueList.appendChild(item);
        });
    }

    root.toggleConfig = function () {
        if (DOM.configSection) DOM.configSection.classList.toggle('hidden');
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
        getCurrentPeriods: () => ({ cp: currentCPPeriod, rtt: currentRTTPeriod })
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
