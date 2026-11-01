const test = require('node:test');
const assert = require('node:assert/strict');
const AppConfig = require('../config.js');
const AppEngine = require('../engine.js');

test('Jours fériés : lundiPentecoteTravaille est true par défaut (25/05/2026 est travaillé)', () => {
    assert.equal(AppConfig.DEFAULT_FERIES_OPTIONS.lundiPentecoteTravaille, true);

    const feriesDefaut2026 = AppEngine.getJoursFeries(2026);
    assert.ok(!feriesDefaut2026.includes('2026-05-25'), 'Le 25/05/2026 (Pentecôte) ne doit pas être férié par défaut');
    assert.ok(feriesDefaut2026.includes('2026-04-06'), 'Lundi de Pâques 2026 doit être férié');
    assert.ok(feriesDefaut2026.includes('2026-05-14'), 'Ascension 2026 doit être férié');
    assert.equal(AppEngine.isWorkingDay('2026-05-25'), true);

    // Vérifie que l'option reste paramétrable si passée à false
    const feriesPentecoteChome = AppEngine.getJoursFeries(2026, { lundiPentecoteTravaille: false });
    assert.ok(feriesPentecoteChome.includes('2026-05-25'), 'Si lundiPentecoteTravaille=false, le 25/05/2026 est férié');
});

test('Pentecôte travaillée : un congé de 3 jours posé à partir du vendredi 22/05/2026 couvre les 22, 25 et 26 mai', () => {
    const exp = AppEngine.expandAbsenceDays({
        type: 'CP',
        date: '2026-05-22',
        duree: 3
    });

    assert.equal(exp.shifted, false);
    assert.equal(exp.effectiveStartDate, '2026-05-22');
    assert.equal(exp.endDate, '2026-05-26');
    assert.deepEqual(
        exp.days.map(d => ({ date: d.date, weight: d.weight })),
        [
            { date: '2026-05-22', weight: 1 },
            { date: '2026-05-25', weight: 1 },
            { date: '2026-05-26', weight: 1 }
        ]
    );
});

test('Ventilation CP à cheval sur le 1er juin : congé du vendredi 29/05/2026 pour 3 jours (1j sur 2025, 2j sur 2026)', () => {
    const appData = {
        absences: [
            { id: 1, type: 'CP', date: '2026-05-29', duree: 3 }
        ],
        configCP: { '2025': 25, '2026': 25 },
        configRTT: {}
    };

    const exp = AppEngine.expandAbsenceDays(appData.absences[0]);
    assert.deepEqual(
        exp.days.map(d => ({ date: d.date, cpPeriod: d.cpPeriod, weight: d.weight })),
        [
            { date: '2026-05-29', cpPeriod: '2025', weight: 1 },
            { date: '2026-06-01', cpPeriod: '2026', weight: 1 },
            { date: '2026-06-02', cpPeriod: '2026', weight: 1 }
        ]
    );

    const soldes2025 = AppEngine.calculerSoldes(appData, '2025', '2026');
    const soldes2026 = AppEngine.calculerSoldes(appData, '2026', '2026');

    assert.equal(soldes2025.prisCP, 1, '1 jour imputé sur la période CP 2025 (Juin 2025 - Mai 2026)');
    assert.equal(soldes2025.resteCP, 24);
    assert.equal(soldes2026.prisCP, 2, '2 jours imputés sur la période CP 2026 (Juin 2026 - Mai 2027)');
    assert.equal(soldes2026.resteCP, 23);
});

test('Ventilation RTT à cheval sur le 1er janvier : congé du mercredi 30/12/2026 pour 3 jours (2j sur 2026, 1j sur 2027)', () => {
    const appData = {
        absences: [
            { id: 2, type: 'RTT', date: '2026-12-30', duree: 3 }
        ],
        configCP: {},
        configRTT: { '2026': 10, '2027': 10 }
    };

    const exp = AppEngine.expandAbsenceDays(appData.absences[0]);
    // 30/12 (mer), 31/12 (jeu), 01/01 (ven férié), 02-03/01 (week-end), 04/01 (lun)
    assert.deepEqual(
        exp.days.map(d => ({ date: d.date, rttPeriod: d.rttPeriod, weight: d.weight })),
        [
            { date: '2026-12-30', rttPeriod: '2026', weight: 1 },
            { date: '2026-12-31', rttPeriod: '2026', weight: 1 },
            { date: '2027-01-04', rttPeriod: '2027', weight: 1 }
        ]
    );

    const soldes2026 = AppEngine.calculerSoldes(appData, '2026', '2026');
    const soldes2027 = AppEngine.calculerSoldes(appData, '2026', '2027');

    assert.equal(soldes2026.prisRTT, 2);
    assert.equal(soldes2026.resteRTT, 8);
    assert.equal(soldes2027.prisRTT, 1);
    assert.equal(soldes2027.resteRTT, 9);
});

test('Demi-journées : absence de 1,5 jour couvre exactement 2 dates (1j + 0,5j)', () => {
    const exp = AppEngine.expandAbsenceDays({
        type: 'CP',
        date: '2026-06-08',
        duree: 1.5
    });

    assert.equal(exp.days.length, 2, '1,5 jour ne doit couvrir que 2 dates');
    assert.deepEqual(
        exp.days.map(d => ({ date: d.date, weight: d.weight })),
        [
            { date: '2026-06-08', weight: 1 },
            { date: '2026-06-09', weight: 0.5 }
        ]
    );
});

test('Demi-journées : deux demi-journées (0,5 + 0,5) le même jour sont autorisées, une 3e est bloquée', () => {
    const existing = [
        { id: 10, type: 'CP', date: '2026-06-15', duree: 0.5 }
    ];

    // 2e demi-journée sur la même date -> valide (total 1.0)
    const checkSecondHalf = AppEngine.validerAbsence(
        { type: 'RTT', date: '2026-06-15', duree: 0.5 },
        existing
    );
    assert.equal(checkSecondHalf.valid, true, 'Une 2e demi-journée le même jour doit être autorisée');

    const withTwoHalves = [
        ...existing,
        { id: 11, type: 'RTT', date: '2026-06-15', duree: 0.5 }
    ];

    // 3e demi-journée le même jour -> refusée (total 1.5 > 1)
    const checkThirdHalf = AppEngine.validerAbsence(
        { type: 'CP', date: '2026-06-15', duree: 0.5 },
        withTwoHalves
    );
    assert.equal(checkThirdHalf.valid, false, 'Une 3e demi-journée le même jour doit être refusée');
    assert.match(checkThirdHalf.error, /Chevauchement/);
});

test('Solde négatif : autorisé sans blocage avec indicateurs isNegative, isNegativeCP et isNegativeRTT', () => {
    const appData = {
        absences: [
            { id: 1, type: 'CP', date: '2026-06-01', duree: 5 }
        ],
        configCP: { '2026': 3 },
        configRTT: { '2026': 2 }
    };

    const soldes = AppEngine.calculerSoldes(appData, '2026', '2026');
    assert.equal(soldes.resteCP, -2);
    assert.equal(soldes.isNegativeCP, true);
    assert.equal(soldes.isNegativeRTT, false);
    assert.equal(soldes.isNegative, true);
    assert.equal(soldes.pctResteCP, 0, 'La jauge est bornée à 0% quand le solde est négatif');

    // Validation d'une nouvelle absence qui fait passer RTT en négatif : valid === true + isNegative === true
    const validation = AppEngine.validerAbsence(
        { type: 'RTT', date: '2026-06-10', duree: 3 },
        appData.absences,
        {},
        appData
    );
    assert.equal(validation.valid, true, 'Le solde négatif ne doit pas bloquer la validation');
    assert.equal(validation.isNegative, true, 'L’indicateur isNegative doit être à true');
    assert.equal(validation.projectedBalances['2026'], -1);
});

test('Début un week-end ou un jour férié : décalage automatique au premier jour ouvré suivant et signalement', () => {
    // Samedi 06/06/2026 -> décalé au lundi 08/06/2026
    const weekendCheck = AppEngine.validerAbsence({
        type: 'CP',
        date: '2026-06-06',
        duree: 1
    });
    assert.equal(weekendCheck.valid, true);
    assert.equal(weekendCheck.shifted, true);
    assert.equal(weekendCheck.shiftReason, 'weekend');
    assert.equal(weekendCheck.originalDate, '2026-06-06');
    assert.equal(weekendCheck.effectiveStartDate, '2026-06-08');

    // Mardi 14/07/2026 (Fête Nationale) -> décalé au mercredi 15/07/2026
    const ferieCheck = AppEngine.validerAbsence({
        type: 'RTT',
        date: '2026-07-14',
        duree: 2
    });
    assert.equal(ferieCheck.valid, true);
    assert.equal(ferieCheck.shifted, true);
    assert.equal(ferieCheck.shiftReason, 'ferie');
    assert.equal(ferieCheck.originalDate, '2026-07-14');
    assert.equal(ferieCheck.effectiveStartDate, '2026-07-15');
    assert.equal(ferieCheck.endDate, '2026-07-16');
});

test('Synchronisation & Validation payload (config.js) : updatedAt manquant traité comme le plus ancien, conflits signalés sans écrasement silencieux', () => {
    // 1. Validation du payload reçu de GOOGLE_SHEETS_URL
    assert.equal(AppConfig.isValidPayload(null), false);
    assert.equal(AppConfig.isValidPayload({ error: 'Quota exceeded' }), false);
    assert.equal(AppConfig.isValidPayload({ status: 'error' }), false);
    assert.equal(AppConfig.isValidPayload({ randomKey: 123 }), false);
    assert.equal(AppConfig.isValidPayload({ absences: 'not-an-array' }), false);
    assert.equal(
        AppConfig.isValidPayload({
            absences: [{ id: 1, type: 'CP', date: '2026-06-01', duree: 2 }],
            configCP: { '2026': 25 }
        }),
        true
    );

    // 2. Données sans updatedAt traitées comme les plus anciennes (updatedAt = 0)
    const unversionedRemote = {
        absences: [{ id: 1, type: 'CP', date: '2026-06-01', duree: 2 }],
        configCP: { '2026': 25 },
        configRTT: {}
    };
    const migratedRemote = AppConfig.migrateData(unversionedRemote);
    assert.equal(migratedRemote.updatedAt, 0);

    // 3. Local avec updatedAt plus récent que distant sans updatedAt -> pas d'écrasement + conflit signalé
    const newerLocal = {
        absences: [
            { id: 1, type: 'CP', date: '2026-06-01', duree: 2 },
            { id: 2, type: 'RTT', date: '2026-06-10', duree: 1 }
        ],
        configCP: { '2026': 25 },
        configRTT: {},
        updatedAt: 1795000000000,
        pendingSync: true
    };

    const syncResult = AppConfig.resolveSyncState(newerLocal, unversionedRemote);
    assert.equal(syncResult.source, 'local');
    assert.equal(syncResult.conflict, true);
    assert.equal(syncResult.reason, 'LOCAL_NEWER_THAN_REMOTE');
    assert.equal(syncResult.needsPush, true);
    assert.equal(syncResult.data.absences.length, 2, 'Les données locales plus récentes ne sont pas écrasées');

    // 4. Payload distant invalide -> conserve local et signale le problème
    const invalidRemoteResult = AppConfig.resolveSyncState(newerLocal, { error: 'Apps Script Exception' });
    assert.equal(invalidRemoteResult.source, 'local');
    assert.equal(invalidRemoteResult.conflict, true);
    assert.equal(invalidRemoteResult.reason, 'INVALID_REMOTE_PAYLOAD');
    assert.equal(invalidRemoteResult.data.absences.length, 2);
});

