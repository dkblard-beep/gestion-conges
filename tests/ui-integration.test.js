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
        setTimeout: (fn) => { fn(); return 1; },
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
            keys: async () => ['conges-pwa-cache-v12', 'conges-pwa-cache-v13', 'autre-app-cache-v1'],
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

