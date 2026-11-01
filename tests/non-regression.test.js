const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Snapshot exact des données réelles récupérées depuis GOOGLE_SHEETS_URL le 2026-11-01
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

// Implémentation de référence (legacy app.js lignes 61-68 et 173-185)
function legacyGetCPPeriod(dateStr) {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    return (d.getMonth() < 5) ? (y - 1).toString() : y.toString();
}

function legacyGetRTTPeriod(dateStr) {
    return new Date(dateStr).getFullYear().toString();
}

function legacyCalculerSoldes(appData, currentCPPeriod, currentRTTPeriod) {
    const initCP = appData.configCP[currentCPPeriod] || 0;
    const prisCP = appData.absences
        .filter(a => a.type === 'CP' && legacyGetCPPeriod(a.date) === currentCPPeriod)
        .reduce((s, a) => s + a.duree, 0);

    const initRTT = appData.configRTT[currentRTTPeriod] || 0;
    const prisRTT = appData.absences
        .filter(a => a.type === 'RTT' && legacyGetRTTPeriod(a.date) === currentRTTPeriod)
        .reduce((s, a) => s + a.duree, 0);

    return {
        initCP,
        prisCP,
        resteCP: initCP - prisCP,
        initRTT,
        prisRTT,
        resteRTT: initRTT - prisRTT
    };
}

test('Non-régression : calcul de référence sur les données réelles (période 2026)', () => {
    const soldes = legacyCalculerSoldes(REAL_USER_DATA, '2026', '2026');

    assert.deepEqual(soldes, {
        initCP: 29,
        prisCP: 15,
        resteCP: 14,
        initRTT: 12,
        prisRTT: 6,
        resteRTT: 6
    });
});

test('Non-régression obligatoire : engine.js produit CP 2026 = 14, RTT 2026 = 6 et conserve le RTT du 25/05/2026 sans décalage', () => {
    const enginePath = path.join(__dirname, '..', 'engine.js');
    assert.ok(fs.existsSync(enginePath), 'engine.js doit exister (test obligatoire)');

    const engine = require(enginePath);
    const legacySoldes = legacyCalculerSoldes(REAL_USER_DATA, '2026', '2026');
    const newSoldes = engine.calculerSoldes(REAL_USER_DATA, '2026', '2026');

    assert.equal(newSoldes.initCP, 29, 'initCP doit être 29');
    assert.equal(newSoldes.prisCP, 15, 'prisCP doit être 15');
    assert.equal(newSoldes.resteCP, 14, 'resteCP 2026 doit rester à 14');
    assert.equal(newSoldes.initRTT, 12, 'initRTT doit être 12');
    assert.equal(newSoldes.prisRTT, 6, 'prisRTT doit être 6');
    assert.equal(newSoldes.resteRTT, 6, 'resteRTT 2026 doit rester à 6');

    assert.equal(newSoldes.resteCP, legacySoldes.resteCP);
    assert.equal(newSoldes.resteRTT, legacySoldes.resteRTT);

    // Vérification explicite du RTT du 25/05/2026 (Lundi de Pentecôte travaillé)
    const rttPentecote = REAL_USER_DATA.absences.find(a => a.date === '2026-05-25');
    assert.ok(rttPentecote, 'Le RTT du 2026-05-25 doit exister dans les données réelles');

    const expandedPentecote = engine.expandAbsenceDays(rttPentecote);
    assert.equal(expandedPentecote.shifted, false, 'Le RTT du 25/05/2026 ne doit pas être décalé');
    assert.equal(expandedPentecote.effectiveStartDate, '2026-05-25', 'La date effective reste le 2026-05-25');
    assert.equal(expandedPentecote.endDate, '2026-05-25', 'La date de fin reste le 2026-05-25');
    assert.deepEqual(
        expandedPentecote.days.map(d => d.date),
        ['2026-05-25']
    );
});
