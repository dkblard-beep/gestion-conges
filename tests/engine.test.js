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

test('Lot A (engine.js) : validerAbsence avec excludeId permet de modifier une absence sur ses propres dates mais bloque un vrai chevauchement', () => {
    const existing = [
        { id: 100, type: 'CP', date: '2026-10-05', duree: 5 },
        { id: 200, type: 'RTT', date: '2026-10-12', duree: 1 }
    ];

    // Sans excludeId, modifier l'absence 100 sur la même date échoue pour chevauchement avec elle-même
    const withoutExclude = AppEngine.validerAbsence(
        { type: 'CP', date: '2026-10-05', duree: 3 },
        existing
    );
    assert.equal(withoutExclude.valid, false);

    // Avec excludeId: 100, la modification sur ses propres dates est valide
    const withExclude = AppEngine.validerAbsence(
        { type: 'CP', date: '2026-10-05', duree: 3 },
        existing,
        { excludeId: 100 }
    );
    assert.equal(withExclude.valid, true);

    // Si l'absence 100 modifiée déborde sur l'absence 200 (lun 12/10), elle est bien bloquée
    const overlapOther = AppEngine.validerAbsence(
        { type: 'CP', date: '2026-10-05', duree: 6 },
        existing,
        { excludeId: 100 }
    );
    assert.equal(overlapOther.valid, false);
    assert.match(overlapOther.error, /Chevauchement/);
});

test('Lot A (config.js) : recordBackupSnapshot applique le plafond de 5, maximum 1/jour pour les modifs courantes, et systématique pour delete/restore/import', () => {
    const sampleData = { absences: [{ id: 1, type: 'CP', date: '2026-10-05', duree: 5 }], configCP: { '2026': 29 }, configRTT: { '2026': 12 } };
    const day1Morning = new Date(2026, 10, 1, 9, 0, 0).getTime();
    const day1Afternoon = new Date(2026, 10, 1, 15, 0, 0).getTime();
    const day2Morning = new Date(2026, 10, 2, 10, 0, 0).getTime();

    // 1re modification courante ('edit') le jour 1 -> enregistrée
    let res = AppConfig.recordBackupSnapshot([], sampleData, { reason: 'edit', label: 'Modif 1', now: day1Morning });
    assert.equal(res.recorded, true);
    assert.equal(res.history.length, 1);

    // 2e modification courante ('add') le même jour 1 -> ignorée (max 1/jour pour les autres modifications)
    res = AppConfig.recordBackupSnapshot(res.history, sampleData, { reason: 'add', label: 'Modif 2 même jour', now: day1Afternoon });
    assert.equal(res.recorded, false);
    assert.equal(res.history.length, 1);

    // Modification le jour 2 -> enregistrée
    res = AppConfig.recordBackupSnapshot(res.history, sampleData, { reason: 'edit', label: 'Modif jour 2', now: day2Morning });
    assert.equal(res.recorded, true);
    assert.equal(res.history.length, 2);

    // Actions critiques ('delete', 'restore', 'import') le même jour -> toujours enregistrées, plafond à 5
    for (let i = 1; i <= 5; i++) {
        res = AppConfig.recordBackupSnapshot(res.history, sampleData, {
            reason: i % 2 === 0 ? 'restore' : 'delete',
            label: `Action critique ${i}`,
            now: day2Morning + i * 1000
        });
        assert.equal(res.recorded, true);
    }

    assert.equal(res.history.length, 5, 'Le plafond de 5 sauvegardes locales est respecté');
    assert.equal(res.history[0].label, 'Action critique 5', 'La sauvegarde la plus récente est en tête');
});

test('Lot B (engine.js) : calculerAlertesExpiration au 2026-11-01 (seuil 60j) affiche RTT (6j, échéance 2026-12-31) et masque CP (14j, échéance 2027-05-31)', () => {
    const referenceData = {
        absences: [
            { id: 1790412079086, type: 'CP', date: '2026-10-05', duree: 5 },
            { id: 1790412095516, type: 'CP', date: '2026-08-03', duree: 10 },
            { id: 1790970282472, type: 'RTT', date: '2026-09-25', duree: 1 },
            { id: 1791001510220, type: 'RTT', date: '2026-07-13', duree: 1 },
            { id: 1791001615916, type: 'RTT', date: '2026-05-15', duree: 1 },
            { id: 1791001638651, type: 'RTT', date: '2026-05-25', duree: 1 },
            { id: 1793543141050, type: 'RTT', date: '2026-11-12', duree: 2 }
        ],
        configCP: { '2026': 29 },
        configRTT: { '2026': 12 }
    };

    // 1. Au 2026-11-01 avec seuil de 60 jours :
    // - RTT 2026 : reste 6j, échéance 2026-12-31 (60 jours calendaires restants <= 60) -> ACTIVE
    // - CP 2026  : reste 14j, échéance 2027-05-31 (211 jours calendaires restants > 60) -> INACTIVE
    const resNov = AppEngine.calculerAlertesExpiration(referenceData, '2026-11-01', {
        seuilAlerteJours: 60,
        echeanceReportCP: '05-31',
        lundiPentecoteTravaille: true
    });

    assert.equal(resNov.rtt.active, true, 'L’alerte RTT (6j, échéance 2026-12-31) doit s’afficher au 2026-11-01');
    assert.equal(resNov.rtt.reste, 6);
    assert.equal(resNov.rtt.deadline, '2026-12-31');
    assert.equal(resNov.rtt.joursCalendairesRestants, 60);
    assert.equal(resNov.rtt.joursOuvresRestants, 42, '42 jours ouvrés entre le 01/11/2026 et le 31/12/2026 (hors mer 11/11 et ven 25/12)');

    assert.equal(resNov.cp.active, false, 'L’alerte CP (14j, échéance 2027-05-31) ne doit PAS s’afficher au 2026-11-01');
    assert.equal(resNov.cp.reste, 14);
    assert.equal(resNov.cp.deadline, '2027-05-31');
    assert.equal(resNov.cp.joursCalendairesRestants, 211);
    assert.equal(resNov.alerts.length, 1);
    assert.equal(resNov.alerts[0].type, 'RTT');

    // 2. Le jour même de l'échéance RTT (2026-12-31) : alerte active, 0 jour calendaire restant, 1 jour ouvré (le jeudi 31/12 lui-même)
    const resSameDayRtt = AppEngine.calculerAlertesExpiration(referenceData, '2026-12-31', {
        seuilAlerteJours: 60,
        cpPeriod: '2026',
        rttPeriod: '2026'
    });
    assert.equal(resSameDayRtt.rtt.active, true, 'Le jour même de l’échéance (2026-12-31), l’alerte RTT reste active');
    assert.equal(resSameDayRtt.rtt.joursCalendairesRestants, 0);
    assert.equal(resSameDayRtt.rtt.joursOuvresRestants, 1);

    // 3. Le lendemain de l'échéance RTT (2027-01-01 sur période RTT 2026) : aucune alerte, aucun nombre négatif
    const resAfterRtt = AppEngine.calculerAlertesExpiration(referenceData, '2027-01-01', {
        seuilAlerteJours: 60,
        cpPeriod: '2026',
        rttPeriod: '2026'
    });
    assert.equal(resAfterRtt.rtt.active, false, 'Le lendemain de l’échéance, aucune alerte RTT');
    assert.equal(resAfterRtt.rtt.joursCalendairesRestants, 0, 'Aucun nombre calendaire négatif');
    assert.equal(resAfterRtt.rtt.joursOuvresRestants, 0, 'Aucun nombre de jours ouvrés négatif');

    // 4. Le jour même de l'échéance CP (2027-05-31) et le lendemain (2027-06-01 sur période CP 2026)
    const resSameDayCp = AppEngine.calculerAlertesExpiration(referenceData, '2027-05-31', {
        seuilAlerteJours: 60,
        cpPeriod: '2026',
        rttPeriod: '2027'
    });
    assert.equal(resSameDayCp.cp.active, true, 'Le jour même de l’échéance CP (2027-05-31), l’alerte CP est active');
    assert.equal(resSameDayCp.cp.joursCalendairesRestants, 0);
    assert.equal(resSameDayCp.cp.joursOuvresRestants, 1);

    const resAfterCp = AppEngine.calculerAlertesExpiration(referenceData, '2027-06-01', {
        seuilAlerteJours: 60,
        cpPeriod: '2026',
        rttPeriod: '2027'
    });
    assert.equal(resAfterCp.cp.active, false, 'Le lendemain de l’échéance CP, aucune alerte');
    assert.equal(resAfterCp.cp.joursCalendairesRestants, 0, 'Aucun nombre négatif');
    assert.equal(resAfterCp.cp.joursOuvresRestants, 0, 'Aucun nombre négatif');
});

test('Lot B (engine.js) : compterJoursOuvresEntre exclut week-ends et fériés et respecte lundiPentecoteTravaille', () => {
    // Semaine du lundi 25/05/2026 (Pentecôte) au dimanche 31/05/2026 :
    // - Avec lundiPentecoteTravaille: true (défaut) -> 5 jours ouvrés (lun 25 au ven 29)
    // - Avec lundiPentecoteTravaille: false -> 4 jours ouvrés (mar 26 au ven 29)
    const workedCount = AppEngine.compterJoursOuvresEntre('2026-05-25', '2026-05-31', {
        lundiPentecoteTravaille: true
    });
    const holidayCount = AppEngine.compterJoursOuvresEntre('2026-05-25', '2026-05-31', {
        lundiPentecoteTravaille: false
    });

    assert.equal(workedCount, 5, 'Lundi de Pentecôte travaillé compte comme jour ouvré');
    assert.equal(holidayCount, 4, 'Lundi de Pentecôte férié est exclu des jours ouvrés restants');
    assert.equal(AppEngine.compterJoursOuvresEntre('2026-06-10', '2026-06-01'), 0, 'Retourne 0 si startDate > endDate');
});

test('Lot B (engine.js) : filtrerAbsencesHistorique est en lecture seule et réinitialise la période si elle disparaît', () => {
    const originalAbsences = [
        { id: 1, type: 'CP', date: '2026-10-05', duree: 5 },
        { id: 2, type: 'RTT', date: '2026-09-25', duree: 1 },
        { id: 3, type: 'CP', date: '2025-07-10', duree: 2 }
    ];
    const snapshotBefore = JSON.stringify(originalAbsences);

    // 1. Filtre par type RTT uniquement
    const rttOnly = AppEngine.filtrerAbsencesHistorique(originalAbsences, { type: 'RTT', period: 'ALL' });
    assert.equal(rttOnly.items.length, 1);
    assert.equal(rttOnly.items[0].id, 2);
    assert.equal(JSON.stringify(originalAbsences), snapshotBefore, 'Aucune mutation du tableau absences d’origine');

    // 2. Filtre sur la période 2025
    const period2025 = AppEngine.filtrerAbsencesHistorique(originalAbsences, { type: 'ALL', period: '2025' });
    assert.equal(period2025.effectivePeriod, '2025');
    assert.equal(period2025.items.length, 1);
    assert.equal(period2025.items[0].id, 3);

    // 3. Si l'absence de 2025 est supprimée, la période 2025 disparaît -> réinitialisation automatique à 'ALL'
    const without2025 = originalAbsences.filter(a => a.id !== 3);
    const resetResult = AppEngine.filtrerAbsencesHistorique(without2025, { type: 'ALL', period: '2025' });
    assert.equal(resetResult.effectivePeriod, 'ALL', 'La période filtrée disparue est réinitialisée à ALL');
    assert.equal(resetResult.items.length, 2, 'Toutes les absences restantes sont affichées');
});


