const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.join(__dirname, '..');

const REAL_USER_DATA = {
    absences: [
        { id: 1790412079086, type: 'CP',  date: '2026-10-05', duree: 5 },
        { id: 1790970282472, type: 'RTT', date: '2026-09-25', duree: 1 },
        { id: 1790976655560, type: 'CP',  date: '2026-08-03', duree: 10 },
        { id: 1791001510220, type: 'RTT', date: '2026-07-13', duree: 1 },
        { id: 1791001610759, type: 'RTT', date: '2026-05-15', duree: 1 },
        { id: 1791001621844, type: 'RTT', date: '2026-05-25', duree: 1 },
        { id: 1793543141050, type: 'RTT', date: '2026-11-12', duree: 2 }
    ],
    configCP: { '2026': 29 },
    configRTT: { '2026': 12 },
    configRetraite: {
        legal: '2040-06-01',
        anticipe: '',
        minimized: true
    }
};

/**
 * Crée un environnement DOM léger à partir des IDs réels présents dans index.html
 * pour tester l'exécution de config.js + engine.js + app.js.
 */
function createAppSandbox({ localStorageInit = {}, fetchImpl } = {}) {
    const htmlContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

    function makeClassList(initial = []) {
        const set = new Set(initial.filter(Boolean));
        return {
            add: (...cls) => cls.forEach(c => c && set.add(c)),
            remove: (...cls) => cls.forEach(c => set.delete(c)),
            toggle: (c, force) => {
                if (force === undefined) {
                    if (set.has(c)) { set.delete(c); return false; }
                    set.add(c); return true;
                }
                if (force) set.add(c); else set.delete(c);
                return Boolean(force);
            },
            contains: (c) => set.has(c),
            toString: () => Array.from(set).join(' ')
        };
    }

    function createElement(tag = 'div', id = '', initialClasses = []) {
        const listeners = {};
        const children = [];
        let innerHTMLVal = '';
        let classList = makeClassList(initialClasses);

        const el = {
            tagName: tag.toUpperCase(),
            id,
            value: '',
            checked: true,
            disabled: false,
            textContent: '',
            title: '',
            dataset: {},
            style: {},
            children,
            classList,
            get className() {
                return classList.toString();
            },
            set className(val) {
                classList = makeClassList(String(val || '').split(/\s+/));
                el.classList = classList;
            },
            get innerHTML() {
                return innerHTMLVal;
            },
            set innerHTML(val) {
                innerHTMLVal = String(val || '');
                if (val === '') children.length = 0;
            },
            appendChild(child) {
                children.push(child);
                return child;
            },
            removeChild(child) {
                const idx = children.indexOf(child);
                if (idx >= 0) children.splice(idx, 1);
            },
            addEventListener(evt, fn) {
                listeners[evt] = listeners[evt] || [];
                listeners[evt].push(fn);
            },
            click() {
                if (typeof el.onclick === 'function') el.onclick();
                (listeners.click || []).forEach(fn => fn());
            },
            querySelector(sel) {
                if (sel === 'button') {
                    const btn = createElement('button');
                    children.push(btn);
                    return btn;
                }
                return null;
            }
        };
        return el;
    }

    // Extraction automatique de tous les id="..." présents dans index.html
    const elementsById = new Map();
    const tagIdRegex = /<([a-zA-Z0-9]+)\b[^>]*?\bid="([^"]+)"[^>]*>/g;
    let match;
    while ((match = tagIdRegex.exec(htmlContent)) !== null) {
        const fullTag = match[0];
        const tag = match[1];
        const id = match[2];
        const classMatch = /\bclass="([^"]*)"/.exec(fullTag);
        const classes = classMatch ? classMatch[1].split(/\s+/) : [];
        const el = createElement(tag, id, classes);
        const valMatch = /\bvalue="([^"]*)"/.exec(fullTag);
        if (valMatch) el.value = valMatch[1];
        elementsById.set(id, el);
    }

    // Valeur par défaut du select type-absence
    if (elementsById.has('type-absence')) {
        elementsById.get('type-absence').value = 'CP';
    }

    const storageMap = new Map(Object.entries(localStorageInit));
    const localStorage = {
        getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
        setItem: (k, v) => storageMap.set(k, String(v)),
        removeItem: (k) => storageMap.delete(k),
        _dump: () => Object.fromEntries(storageMap.entries())
    };

    const docListeners = {};
    const document = {
        getElementById: (id) => elementsById.get(id) || null,
        createElement: (tag) => createElement(tag),
        addEventListener: (evt, fn) => {
            docListeners[evt] = docListeners[evt] || [];
            docListeners[evt].push(fn);
        },
        body: createElement('body')
    };

    const sandbox = {
        console,
        Date,
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Set,
        Map,
        RegExp,
        JSON,
         parseFloat,
        parseInt,
        isNaN,
        setTimeout: (_fn, _ms) => 1,
        clearTimeout: () => {},
        localStorage,
        document,
        navigator: {},
        fetch: fetchImpl || (async () => ({ ok: true, json: async () => REAL_USER_DATA }))
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;

    // Fonction toggleAbsenceModal définie dans index.html
    sandbox.toggleAbsenceModal = function (show) {
        const modal = document.getElementById('form-absence');
        if (!modal) return;
        if (show) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            if (typeof sandbox.mettreAJourApercuAbsence === 'function') {
                sandbox.mettreAJourApercuAbsence();
            }
        } else {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    };

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT_DIR, 'config.js'), 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT_DIR, 'engine.js'), 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT_DIR, 'app.js'), 'utf8'), sandbox);

    return { sandbox, document, elementsById, localStorage };
}

test('Structure HTML : ordre de chargement des scripts (config.js -> engine.js -> app.js) et modale sécurisée', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

    const idxConfig = html.indexOf('<script src="config.js"></script>');
    const idxEngine = html.indexOf('<script src="engine.js"></script>');
    const idxApp = html.indexOf('<script src="app.js"></script>');

    assert.ok(idxConfig !== -1 && idxEngine !== -1 && idxApp !== -1, 'Les 3 scripts doivent être présents dans index.html');
    assert.ok(idxConfig < idxEngine && idxEngine < idxApp, 'Ordre requis : config.js avant engine.js avant app.js');

    // Vérifie que le bouton Enregistrer ne ferme plus la modale de manière inconditionnelle dans onclick
    assert.ok(!html.includes('ajouterAbsence(); toggleAbsenceModal(false);'), 'Le bouton ne doit plus fermer la modale en cas d’erreur');
});

test('Branchement UI : affiche CP = 14 / Total = 29 et RTT = 6 / Total = 12 sur les données de référence', async () => {
    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async () => ({
            ok: true,
            json: async () => structuredClone(REAL_USER_DATA)
        })
    });

    await sandbox.__appTestHooks.initApp();

    assert.equal(elementsById.get('solde-cp').textContent, '14');
    assert.equal(elementsById.get('reste-cp-label').textContent, '14');
    assert.equal(elementsById.get('total-cp').textContent, '29');
    assert.equal(elementsById.get('pris-cp').textContent, '15');

    assert.equal(elementsById.get('solde-rtt').textContent, '6');
    assert.equal(elementsById.get('reste-rtt-label').textContent, '6');
    assert.equal(elementsById.get('total-rtt').textContent, '12');
    assert.equal(elementsById.get('pris-rtt').textContent, '6');

    assert.equal(sandbox.__appTestHooks.getSyncState(), 'reussi');
});

test('Branchement UI : erreur de saisie (3e demi-journée ou durée invalide) conserve la modale ouverte et les valeurs saisies', async () => {
    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async () => ({
            ok: true,
            json: async () => structuredClone(REAL_USER_DATA)
        })
    });

    await sandbox.__appTestHooks.initApp();

    // Ouvrir la modale via un clic calendrier sur le 2026-06-15
    sandbox.preparerAbsence(0.5, '2026-06-15');
    const modal = elementsById.get('form-absence');
    assert.equal(modal.classList.contains('hidden'), false, 'La modale doit être ouverte');
    assert.equal(modal.classList.contains('flex'), true, 'La modale doit avoir la classe flex');
    assert.equal(elementsById.get('date-debut').value, '2026-06-15', 'La date du calendrier doit préremplir #date-debut');

    // 1re demi-journée le 2026-06-15 -> acceptée
    elementsById.get('type-absence').value = 'CP';
    elementsById.get('duree-absence').value = '0.5';
    assert.equal(sandbox.ajouterAbsence(), true);
    assert.equal(modal.classList.contains('hidden'), true, 'La modale se ferme après succès');

    // 2e demi-journée le 2026-06-15 -> acceptée
    sandbox.preparerAbsence(0.5, '2026-06-15');
    elementsById.get('type-absence').value = 'RTT';
    elementsById.get('duree-absence').value = '0.5';
    assert.equal(sandbox.ajouterAbsence(), true);

    // 3e demi-journée le 2026-06-15 -> refusée, modale reste ouverte et conserve la saisie
    sandbox.preparerAbsence(0.5, '2026-06-15');
    elementsById.get('type-absence').value = 'CP';
    elementsById.get('duree-absence').value = '0.5';
    const resultThird = sandbox.ajouterAbsence();

    assert.equal(resultThird, false, 'La 3e demi-journée doit être refusée');
    assert.equal(modal.classList.contains('hidden'), false, 'La modale DOIT rester ouverte en cas d’erreur');
    assert.equal(elementsById.get('date-debut').value, '2026-06-15', 'La date saisie doit être préservée');
    assert.equal(elementsById.get('duree-absence').value, '0.5', 'La durée saisie doit être préservée');
    assert.equal(elementsById.get('modal-error-message').classList.contains('hidden'), false, 'Le message d’erreur doit être visible');
});

test('Branchement UI : solde négatif visible avec classe text-error et badge textuel explicite', async () => {
    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({
                absences: [{ id: 1, type: 'RTT', date: '2026-06-01', duree: 3.5 }],
                configCP: { '2026': 25 },
                configRTT: { '2026': 2 }
            })
        })
    });

    await sandbox.__appTestHooks.initApp();

    assert.equal(elementsById.get('solde-rtt').textContent, '-1.5', 'Préserve la valeur négative et demi-journée exacte');
    assert.equal(elementsById.get('solde-rtt').classList.contains('text-error'), true, 'Couleur d’erreur appliquée');
    assert.equal(elementsById.get('negative-badge-rtt').classList.contains('hidden'), false, 'Badge textuel explicite visible');
    assert.match(elementsById.get('negative-badge-rtt').textContent, /Solde RTT négatif/);
});

test('Synchronisation UI : conflit local/distant préserve les deux versions sans écrasement jusqu’au choix explicite', async () => {
    const localVersion = {
        absences: [
            { id: 1, type: 'CP', date: '2026-10-05', duree: 5 },
            { id: 2, type: 'RTT', date: '2026-10-12', duree: 1 }
        ],
        configCP: { '2026': 29 },
        configRTT: { '2026': 12 },
        updatedAt: 1795000000000,
        pendingSync: true
    };

    const remoteVersion = {
        absences: [
            { id: 1, type: 'CP', date: '2026-10-05', duree: 5 }
        ],
        configCP: { '2026': 29 },
        configRTT: { '2026': 12 },
        updatedAt: 1794000000000
    };

    const { sandbox, elementsById, localStorage } = createAppSandbox({
        localStorageInit: {
            conges_rtt_data_v2: JSON.stringify(localVersion)
        },
        fetchImpl: async () => ({
            ok: true,
            json: async () => structuredClone(remoteVersion)
        })
    });

    await sandbox.__appTestHooks.initApp();

    // 1. État conflit affiché, bannière visible, les deux versions préservées
    assert.equal(sandbox.__appTestHooks.getSyncState(), 'conflit');
    assert.equal(elementsById.get('conflict-banner').classList.contains('hidden'), false);
    const conflictBackup = JSON.parse(localStorage.getItem('conges_rtt_data_v2_conflict_backup'));
    assert.equal(conflictBackup.localData.absences.length, 2);
    assert.equal(conflictBackup.remoteData.absences.length, 1);

    // 2. Choix explicite de l'utilisateur : conserver la version distante
    await sandbox.resoudreConflit('remote');
    assert.equal(elementsById.get('conflict-banner').classList.contains('hidden'), true);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 1);
    // Vérifie que l'ancienne version locale a été sauvegardée dans _backup avant remplacement
    const backup = JSON.parse(localStorage.getItem('conges_rtt_data_v2_backup'));
    assert.equal(backup.data.absences.length, 2);
});

test('Fonctionnement hors-ligne et rechargement : conserve et affiche les données locales sans perte', async () => {
    const savedLocal = {
        ...REAL_USER_DATA,
        updatedAt: 1796000000000
    };

    const { sandbox, elementsById, localStorage } = createAppSandbox({
        localStorageInit: {
            conges_rtt_data_v2: JSON.stringify(savedLocal)
        },
        fetchImpl: async () => {
            throw new Error('Failed to fetch (offline)');
        }
    });

    await sandbox.__appTestHooks.initApp();

    assert.equal(sandbox.__appTestHooks.getSyncState(), 'local');
    assert.equal(elementsById.get('solde-cp').textContent, '14');
    assert.equal(elementsById.get('solde-rtt').textContent, '6');
    assert.ok(localStorage.getItem('conges_rtt_data_v2'), 'localStorage est intégralement conservé');
});

test('Service Worker (sw.js) : inclut config.js et engine.js et ne supprime que les anciens caches conges-pwa-cache-*', async () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');

    const listeners = {};
    const deletedCaches = [];
    const addedUrls = [];

    const swSandbox = {
        caches: {
            open: async () => ({
                addAll: async (urls) => { addedUrls.push(...urls); },
                put: async () => {}
            }),
            keys: async () => ['conges-pwa-cache-v12', 'conges-pwa-cache-v17', 'autre-app-cache-v1'],
            delete: async (name) => { deletedCaches.push(name); return true; },
            match: async () => null
        },
        fetch: async () => ({ clone: () => ({}) })
    };
    swSandbox.self = {
        addEventListener: (evt, fn) => { listeners[evt] = fn; }
    };

    vm.createContext(swSandbox);
    vm.runInContext(swCode, swSandbox);

    // 1. Test install : vérifie la mise en cache de config.js et engine.js
    let installPromise;
    listeners.install({ waitUntil: (p) => { installPromise = p; } });
    await installPromise;

    assert.ok(addedUrls.includes('./config.js'), 'sw.js doit mettre en cache ./config.js');
    assert.ok(addedUrls.includes('./engine.js'), 'sw.js doit mettre en cache ./engine.js');
    assert.ok(addedUrls.includes('./app.js'), 'sw.js doit mettre en cache ./app.js');

    // 2. Test activate : supprime conges-pwa-cache-v12 mais conserve conges-pwa-cache-v13 et autre-app-cache-v1
    let activatePromise;
    listeners.activate({ waitUntil: (p) => { activatePromise = p; } });
    await activatePromise;

    assert.deepEqual(deletedCaches, ['conges-pwa-cache-v12'], 'Seul l’ancien cache de cette application doit être supprimé');
});

test('Verrouillage de la suppression : boutons grisés et suppression bloquée par défaut, déblocage manuel persistant jusqu’au reclic', async () => {
    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async () => ({
            ok: true,
            json: async () => structuredClone(REAL_USER_DATA)
        })
    });

    await sandbox.__appTestHooks.initApp();

    const initialCount = sandbox.__appTestHooks.getAppData().absences.length;
    const targetId = REAL_USER_DATA.absences[0].id;

    // 1. Par défaut, le cadenas est verrouillé et les boutons corbeille sont grisés/désactivés
    assert.equal(sandbox.__appTestHooks.isDeleteUnlocked(), false);
    assert.equal(elementsById.get('delete-lock-icon').textContent, 'lock');
    const firstItemBtn = elementsById.get('historique-list').children[0].children[0];
    assert.equal(firstItemBtn.disabled, true, 'Le bouton de suppression doit être désactivé quand verrouillé');
    assert.ok(firstItemBtn.className.includes('opacity-50'), 'Le bouton de suppression doit être grisé (opacity-50)');

    // Tentative de suppression verrouillée -> bloquée
    const blockedResult = sandbox.supprimerAbsence(targetId);
    assert.equal(blockedResult, false);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, initialCount, 'Aucune demande ne doit être supprimée');

    // 2. Clic sur Déverrouiller -> active les boutons et autorise la suppression
    sandbox.toggleDeleteLock();
    assert.equal(sandbox.__appTestHooks.isDeleteUnlocked(), true);
    assert.equal(elementsById.get('delete-lock-icon').textContent, 'lock_open');
    const unlockedBtn = elementsById.get('historique-list').children[0].children[0];
    assert.equal(unlockedBtn.disabled, false, 'Le bouton de suppression doit être actif quand déverrouillé');

    const allowedResult = sandbox.supprimerAbsence(targetId);
    assert.equal(allowedResult, true);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, initialCount - 1, 'La demande est supprimée');

    // 3. Reste déverrouillé jusqu'à ce que l'utilisateur reclique pour verrouiller
    assert.equal(sandbox.__appTestHooks.isDeleteUnlocked(), true);
    sandbox.toggleDeleteLock();
    assert.equal(sandbox.__appTestHooks.isDeleteUnlocked(), false);
});

test('Lot A : modifier une absence existante met à jour le solde, conserve son ID et met à jour updatedAt', async () => {
    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async () => ({
            ok: true,
            json: async () => structuredClone(REAL_USER_DATA)
        })
    });

    await sandbox.__appTestHooks.initApp();
    const beforeUpdatedAt = sandbox.__appTestHooks.getAppData().updatedAt || 0;

    // On édite le CP du 2026-10-05 (id: 1790412079086, durée initiale 5j -> passe à 3j)
    const targetId = 1790412079086;
    const opened = sandbox.editerAbsence(targetId);
    assert.equal(opened, true);
    assert.equal(sandbox.__appTestHooks.getEditingAbsenceId(), targetId);
    assert.equal(elementsById.get('modal-absence-title').textContent, "Modifier l'absence");
    assert.equal(elementsById.get('date-debut').value, '2026-10-05');
    assert.equal(Number(elementsById.get('duree-absence').value), 5);

    // Changement de la durée à 3 jours (2 jours de CP économisés -> solde CP passe de 14 à 16)
    elementsById.get('duree-absence').value = '3';
    const saved = sandbox.ajouterAbsence(1800000000000);
    assert.equal(saved, true);

    const updatedData = sandbox.__appTestHooks.getAppData();
    assert.equal(updatedData.absences.length, 7, 'Le nombre d’absences reste à 7 (pas de doublon créé)');
    const edited = updatedData.absences.find(a => a.id === targetId);
    assert.equal(edited.duree, 3);
    assert.equal(elementsById.get('solde-cp').textContent, '16', 'Le solde CP passe de 14 à 16');
    assert.ok(updatedData.updatedAt > beforeUpdatedAt, 'La modification d’une absence doit mettre à jour updatedAt');
});

test('Lot A : confirmation avant suppression, annulation disponible 10s et ne survivant pas à un rechargement', async () => {
    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async () => ({
            ok: true,
            json: async () => structuredClone(REAL_USER_DATA)
        })
    });

    await sandbox.__appTestHooks.initApp();
    sandbox.toggleDeleteLock(); // Déverrouille le cadenas

    const targetId = 1790970282472; // RTT 1j du 2026-09-25
    const actionTime = 1800000000000;

    // 1. Si la confirmation est refusée (confirmed = false), la suppression n'a pas lieu
    assert.equal(sandbox.supprimerAbsence(targetId, false, actionTime), false);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 7);

    // 2. Étape de demande de confirmation inline puis confirmation explicite
    sandbox.demanderConfirmationSuppression(targetId);
    assert.equal(sandbox.__appTestHooks.getPendingDeleteConfirmId(), targetId);
    assert.equal(sandbox.supprimerAbsence(targetId, true, actionTime), true);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 6);
    assert.equal(elementsById.get('solde-rtt').textContent, '7', 'Le solde RTT passe de 6 à 7');
    assert.equal(elementsById.get('undo-banner').classList.contains('hidden'), false, 'La bannière Annuler est visible');

    // 3. Annulation dans les 10 secondes (à t + 5s) -> restaure l'absence et le solde RTT = 6
    const undone = sandbox.annulerDerniereAction(actionTime + 5000);
    assert.equal(undone, true);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 7);
    assert.equal(elementsById.get('solde-rtt').textContent, '6');

    // 4. Nouvelle suppression mais tentative d'annulation après 10s (à t + 10001ms) -> expirée
    sandbox.supprimerAbsence(targetId, true, actionTime + 20000);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 6);
    const expiredUndo = sandbox.annulerDerniereAction(actionTime + 30001);
    assert.equal(expiredUndo, false, 'L’annulation ne doit plus fonctionner après 10 secondes');
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 6);

    // 5. Ne survit pas à un rechargement (initApp réinitialise lastUndoState)
    sandbox.supprimerAbsence(1791001510220, true, actionTime + 40000);
    assert.ok(sandbox.__appTestHooks.getLastUndoState() !== null);
    await sandbox.__appTestHooks.initApp();
    assert.equal(sandbox.__appTestHooks.getLastUndoState(), null, 'L’annulation ne doit pas survivre à un rechargement');
});

test('Lot A : historique des 5 dernières sauvegardes locales et restauration réversible', async () => {
    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async () => ({
            ok: true,
            json: async () => structuredClone(REAL_USER_DATA)
        })
    });

    await sandbox.__appTestHooks.initApp();
    sandbox.toggleDeleteLock();

    // Supprime une absence -> crée un instantané obligatoire ('delete') contenant les 7 absences
    const targetId = 1790412079086; // CP 5j
    sandbox.supprimerAbsence(targetId, true, 1800000010000);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 6);
    assert.equal(elementsById.get('solde-cp').textContent, '19');

    let history = sandbox.__appTestHooks.getBackupHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].reason, 'delete');
    assert.equal(history[0].data.absences.length, 7);

    const snapshotToRestoreId = history[0].id;

    // Restauration de cet instantané -> doit d'abord enregistrer l'état actuel (6 absences) dans l'historique ('restore')
    const restored = sandbox.restaurerSauvegardeLocale(snapshotToRestoreId, 1800000020000);
    assert.equal(restored, true);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 7, 'Les 7 absences sont restaurées');
    assert.equal(elementsById.get('solde-cp').textContent, '14', 'Le solde CP de référence (14) est restauré');

    history = sandbox.__appTestHooks.getBackupHistory();
    assert.equal(history.length, 2, 'Un instantané "Avant restauration" a été enregistré');
    assert.equal(history[0].reason, 'restore');
    assert.equal(history[0].label, 'Avant restauration');
    assert.equal(history[0].data.absences.length, 6, 'L’état à 6 absences est sauvegardé pour rendre la restauration réversible');

    // Vérifie qu'on peut inverser la restauration en restaurant history[0]
    sandbox.restaurerSauvegardeLocale(history[0].id, 1800000030000);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 6);
});

test('Lot A (Ajustement #5) : supprimer une absence, synchroniser, recharger — l’absence supprimée ne réapparaît pas depuis le cloud', async () => {
    // Simulation d'un serveur Cloud qui met à jour ses données lors du POST
    let cloudState = structuredClone(REAL_USER_DATA);

    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async (_url, options = {}) => {
            if (options.method === 'POST' && options.body) {
                cloudState = JSON.parse(options.body);
                return { ok: true, status: 200 };
            }
            return {
                ok: true,
                status: 200,
                json: async () => structuredClone(cloudState)
            };
        }
    });

    await sandbox.__appTestHooks.initApp();
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 7);

    // 1. Déverrouiller et supprimer l'absence RTT du 2026-11-12 (id: 1793543141050, 2j)
    const deletedId = 1793543141050;
    sandbox.toggleDeleteLock();
    const deleted = sandbox.supprimerAbsence(deletedId, true, 1800000050000);
    assert.equal(deleted, true);
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 6);
    assert.equal(elementsById.get('solde-rtt').textContent, '8');

    // 2. Recharger l'application (initApp) après synchronisation Cloud
    await sandbox.__appTestHooks.initApp();
    const afterReloadAbsences = sandbox.__appTestHooks.getAppData().absences;
    assert.equal(afterReloadAbsences.length, 6, 'Après rechargement, il reste bien 6 absences');
    assert.equal(
        afterReloadAbsences.some(a => a.id === deletedId),
        false,
        'L’absence supprimée ne doit pas réapparaître après rechargement'
    );
    assert.equal(elementsById.get('solde-rtt').textContent, '8');

    // 3. Même si le Cloud renvoie un cache distant obsolète (les 7 absences d'origine sans updatedAt),
    // les données locales plus récentes (updatedAt mis à jour lors de la suppression) empêchent la réapparition
    cloudState = structuredClone(REAL_USER_DATA); // Cloud obsolète à 7 absences sans updatedAt
    await sandbox.__appTestHooks.initApp();
    assert.equal(
        sandbox.__appTestHooks.getAppData().absences.some(a => a.id === deletedId),
        false,
        'Même face à un Cloud retardataire sans updatedAt, l’absence supprimée ne réapparaît pas'
    );
});

test('Lot B (UI) : réglages d’alerte dans une clé localStorage séparée sans modifier appData ni le payload Google Sheets, et affichage déterministe au 2026-11-01', async () => {
    let lastPostedPayload = null;
    const { sandbox, elementsById, localStorage } = createAppSandbox({
        fetchImpl: async (_url, options = {}) => {
            if (options.method === 'POST' && options.body) {
                lastPostedPayload = JSON.parse(options.body);
                return { ok: true, status: 200 };
            }
            return {
                ok: true,
                status: 200,
                json: async () => structuredClone(REAL_USER_DATA)
            };
        }
    });

    await sandbox.__appTestHooks.initApp();

    // 1. Injecter la date du 2026-11-01 avec seuil 60 jours :
    // L'alerte RTT (6j, échéance 2026-12-31) s'affiche, l'alerte CP (14j, échéance 2027-05-31) ne s'affiche pas
    sandbox.__appTestHooks.setAlertPrefs({ seuilAlerteJours: 60, echeanceReportCP: '05-31' });
    sandbox.__appTestHooks.setReferenceDate('2026-11-01');

    const alertsContainer = elementsById.get('expiration-alerts');
    assert.equal(alertsContainer.classList.contains('hidden'), false, 'Le conteneur d’alertes doit être visible au 2026-11-01');
    assert.equal(alertsContainer.children.length, 1, 'Une seule alerte (RTT) doit être affichée');
    assert.equal(alertsContainer.children[0].dataset.alertType, 'RTT');
    assert.match(alertsContainer.children[0].innerHTML, /2026-12-31/);
    assert.match(alertsContainer.children[0].innerHTML, /6 jours/);

    // 2. Sauvegarder les paramètres depuis le panneau de configuration :
    // Vérifie que seuilAlerteJours et echeanceReportCP vont dans conges_rtt_prefs_v1 et PAS dans conges_rtt_data_v2 ni dans le POST Cloud
    elementsById.get('init-seuil-alerte').value = '45';
    elementsById.get('init-echeance-cp').value = '06-30';
    sandbox.sauvegarderConfig();

    const separatePrefs = JSON.parse(localStorage.getItem('conges_rtt_prefs_v1'));
    assert.equal(separatePrefs.seuilAlerteJours, 45);
    assert.equal(separatePrefs.echeanceReportCP, '06-30');

    const mainStoredData = JSON.parse(localStorage.getItem('conges_rtt_data_v2'));
    assert.equal(mainStoredData.seuilAlerteJours, undefined, 'Le format des données principales reste intact');
    assert.equal(mainStoredData.echeanceReportCP, undefined, 'Le format des données principales reste intact');
    assert.ok(lastPostedPayload, 'Un POST vers GOOGLE_SHEETS_URL a été effectué');
    assert.equal(lastPostedPayload.seuilAlerteJours, undefined, 'Le payload Google Sheets ne contient pas seuilAlerteJours');
    assert.equal(lastPostedPayload.echeanceReportCP, undefined, 'Le payload Google Sheets ne contient pas echeanceReportCP');

    // Avec un seuil abaissé à 45 jours au 2026-11-01 (60j avant le 31/12), l'alerte RTT se masque
    assert.equal(alertsContainer.classList.contains('hidden'), true);
});

test('Lot B (UI) : filtres de l’historique en lecture seule (aucun effet sur appData.absences) et réinitialisation si la période filtrée disparaît', async () => {
    const customData = structuredClone(REAL_USER_DATA);
    // Ajout d'une absence unique en 2025 pour tester la disparition d'une période filtrée
    customData.absences.push({ id: 999001, type: 'CP', date: '2025-07-07', duree: 2 });

    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async () => ({
            ok: true,
            json: async () => structuredClone(customData)
        })
    });

    await sandbox.__appTestHooks.initApp();
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 8);

    // 1. Filtrer par type = 'CP' : n'affiche que les 3 CP (2 en 2026 + 1 en 2025), mais appData.absences garde ses 8 entrées
    elementsById.get('filter-history-type').value = 'CP';
    sandbox.changerFiltreHistoriqueType();
    assert.equal(elementsById.get('historique-list').children.length, 3, 'Seules les 3 absences CP sont affichées');
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 8, 'Aucun effet sur appData.absences (lecture seule)');

    // 2. Filtrer sur la période '2025' : affiche uniquement l'absence 999001
    elementsById.get('filter-history-type').value = 'ALL';
    sandbox.changerFiltreHistoriqueType();
    elementsById.get('filter-history-period').value = '2025';
    sandbox.changerFiltreHistoriquePeriode();
    assert.equal(sandbox.__appTestHooks.getHistoryFilters().period, '2025');
    assert.equal(elementsById.get('historique-list').children.length, 1);

    // 3. Supprimer l'unique absence de la période 2025 -> la période 2025 disparaît, le filtre se réinitialise automatiquement à 'ALL'
    sandbox.toggleDeleteLock();
    sandbox.supprimerAbsence(999001, true, 1800000090000);

    assert.equal(sandbox.__appTestHooks.getHistoryFilters().period, 'ALL', 'Le filtre de période se réinitialise automatiquement à ALL');
    assert.equal(elementsById.get('filter-history-period').value, 'ALL');
    assert.equal(elementsById.get('historique-list').children.length, 7, 'Les 7 absences de 2026 sont affichées');
});

test('Lot C (UI) : le simulateur ne modifie aucun solde tant qu’on n’enregistre pas, et "Transformer en demande réelle" préremplit la modale sans créer l’absence automatiquement', async () => {
    const { sandbox, elementsById } = createAppSandbox({
        fetchImpl: async () => ({
            ok: true,
            json: async () => structuredClone(REAL_USER_DATA)
        })
    });

    await sandbox.__appTestHooks.initApp();

    // État initial de référence : 7 absences, CP = 14, RTT = 6
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 7);
    assert.equal(elementsById.get('solde-cp').textContent, '14');
    assert.equal(elementsById.get('solde-rtt').textContent, '6');

    // 1. Simulation en mode plage (date de début + date de fin) : du lundi 2026-11-16 au vendredi 2026-11-20 (5 jours ouvrés de CP)
    elementsById.get('sim-type').value = 'CP';
    elementsById.get('sim-mode').value = 'range';
    sandbox.changerModeSimulateur();
    elementsById.get('sim-date-debut').value = '2026-11-16';
    elementsById.get('sim-date-fin').value = '2026-11-20';

    const simRes = sandbox.lancerSimulationUI();
    assert.equal(simRes.valid, true);
    assert.equal(simRes.duree, 5);
    assert.equal(simRes.soldeRestantPrincipal, 9, '14 - 5 = 9 jours de CP restants dans la simulation');
    assert.match(elementsById.get('sim-result-summary').textContent, /il vous restera 9 jours/);

    // Aucun solde réel ni absence n'a changé dans appData ni sur les cartes de solde
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 7, 'Aucune absence créée pendant la simulation');
    assert.equal(elementsById.get('solde-cp').textContent, '14', 'Le solde CP réel affiché reste à 14');
    assert.equal(elementsById.get('solde-rtt').textContent, '6', 'Le solde RTT réel affiché reste à 6');

    // 2. Clic sur "Transformer en demande réelle" : ouvre et préremplit la modale existante SANS créer l'absence
    const modal = elementsById.get('form-absence');
    assert.equal(modal.classList.contains('hidden'), true);

    const transformed = sandbox.transformerSimulationEnDemande();
    assert.equal(transformed.type, 'CP');
    assert.equal(transformed.date, '2026-11-16');
    assert.equal(transformed.duree, 5);
    assert.equal(modal.classList.contains('hidden'), false, 'La modale est ouverte');
    assert.equal(elementsById.get('type-absence').value, 'CP');
    assert.equal(elementsById.get('date-debut').value, '2026-11-16');
    assert.equal(Number(elementsById.get('duree-absence').value), 5);

    // Tant qu'on n'a pas cliqué sur Enregistrer dans la modale, l'absence n'est toujours pas créée
    assert.equal(sandbox.__appTestHooks.getAppData().absences.length, 7, 'Le bouton Transformer ne doit pas créer l’absence automatiquement');
    assert.equal(elementsById.get('solde-cp').textContent, '14');
});



