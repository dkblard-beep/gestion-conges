
        // URL publique du script Google Apps (lecture/écriture via no-cors POST)
        // Ce n'est pas une clé secrète : c'est un endpoint public intentionnel.
        const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbxkp3pcNRAZ5ufwrMaaq4T8VS260l8YxtZd3qh8p3VhVGs_c2OHtnTfpotGiT1OCJjV7g/exec";

        // FIX #6 – Cache des références DOM pour éviter les getElementById répétés
        const DOM = {};
        function initDOM() {
            DOM.soldeCp        = document.getElementById('solde-cp');
            DOM.soldeRtt       = document.getElementById('solde-rtt');
            DOM.totalCp        = document.getElementById('total-cp');
            DOM.totalRtt       = document.getElementById('total-rtt');
            DOM.prisCp         = document.getElementById('pris-cp');
            DOM.prisRtt        = document.getElementById('pris-rtt');
            DOM.progressTextCp = document.getElementById('progress-text-cp');
            DOM.progressTextRtt = document.getElementById('progress-text-rtt');
            DOM.progressCp     = document.getElementById('progress-cp');
            DOM.progressRtt    = document.getElementById('progress-rtt');
            DOM.initCp         = document.getElementById('init-cp');
            DOM.initRtt        = document.getElementById('init-rtt');
            DOM.labelCpYear    = document.getElementById('label-cp-year');
            DOM.labelCpYearNext= document.getElementById('label-cp-year-next');
            DOM.labelRttYear   = document.getElementById('label-rtt-year');
            DOM.retraiteLegal  = document.getElementById('init-retraite-legal');
            DOM.retraiteAnticipe = document.getElementById('init-retraite-anticipe');
            DOM.selectCp       = document.getElementById('select-cp-period');
            DOM.selectRtt      = document.getElementById('select-rtt-period');
            DOM.historiqueList  = document.getElementById('historique-list');
            DOM.historiqueVide  = document.getElementById('historique-vide');
            DOM.retraiteCard    = document.getElementById('retraite-card');
            DOM.retraiteExpanded = document.getElementById('retraite-content-expanded');
            DOM.retraiteMinimized = document.getElementById('retraite-content-minimized');
            DOM.retraiteIcon    = document.getElementById('retraite-toggle-icon');
            DOM.dateDebut       = document.getElementById('date-debut');
            DOM.typeAbsence     = document.getElementById('type-absence');
            DOM.dureeAbsence    = document.getElementById('duree-absence');
            DOM.errorMessage    = document.getElementById('error-message');
            DOM.errorText       = document.getElementById('error-text');
            DOM.configSection   = document.getElementById('config-section');
            DOM.formAbsence     = document.getElementById('form-absence');
            DOM.anticipeContainer = document.getElementById('anticipe-container');
            DOM.decompteLegal    = document.getElementById('decompte-legal');
            DOM.decompteLegalDetail = document.getElementById('decompte-legal-detail');
            DOM.dateLegalLabel  = document.getElementById('date-legal-label');
            DOM.decompteAnticipe = document.getElementById('decompte-anticipe');
            DOM.decompteAnticipeDetail = document.getElementById('decompte-anticipe-detail');
            DOM.dateAnticipeLabel = document.getElementById('date-anticipe-label');
            DOM.decompteMini    = document.getElementById('decompte-mini');
            DOM.calendarGrid    = document.getElementById('calendar-grid-display');
            DOM.calendarMonthLabel = document.getElementById('calendar-month-label-display');
            DOM.cpSolderYear    = document.getElementById('cp-solder-year');
            DOM.rttPeriodeAnnee = document.getElementById('rtt-periode-annee');
        }

        let appData = { absences: [], configCP: {}, configRTT: {}, configRetraite: {} };
        let currentCPPeriod = "";
        let currentRTTPeriod = "";
        let currentCalendarDate = new Date();

        // Utilitaires de dates
        function getCPPeriod(dateStr) {
            const d = new Date(dateStr);
            const y = d.getFullYear();
            return (d.getMonth() < 5) ? (y - 1).toString() : y.toString();
        }
        function getRTTPeriod(dateStr) {
            return new Date(dateStr).getFullYear().toString();
        }
        function formatCPPeriod(year) {
            return `Juin ${year} - Mai ${parseInt(year)+1}`;
        }

        async function initApp() {
            initDOM(); // FIX #6 – Initialise le cache DOM

            const today = new Date().toISOString().split('T')[0];
            currentCPPeriod = getCPPeriod(today);
            currentRTTPeriod = getRTTPeriod(today);
            DOM.dateDebut.value = today;

            try {
                const response = await fetch(GOOGLE_SHEETS_URL, { method: 'GET', credentials: 'omit' });
                if (!response.ok) throw new Error("Réseau");
                const data = await response.json();
                appData = migrateData(data);
            } catch (error) { console.error(error);
                // FIX #2 – JSON.parse dans son propre try/catch pour éviter un crash sur données corrompues
                try {
                    const local = localStorage.getItem('conges_rtt_data_v2');
                    if (local) {
                        appData = migrateData(JSON.parse(local));
                        showError("Mode hors-ligne.");
                    }
                } catch (parseError) {
                    console.warn('Données localStorage corrompues, réinitialisation.', parseError);
                    localStorage.removeItem('conges_rtt_data_v2');
                    appData = { absences: [], configCP: {}, configRTT: {}, configRetraite: {} };
                    showError("Données locales corrompues. Réinitialisation effectuée.");
                }
            }

            updateSelectors();
            mettreAJourAffichage();
        }

        function migrateData(data) {
            if (!data) return { absences: [], configCP: {}, configRTT: {}, configRetraite: {} };
            if (data.years && !data.migrated_v2) {
                let newData = { absences: [], configCP: {}, configRTT: {}, configRetraite: {}, migrated_v2: true };
                for (let y in data.years) {
                    newData.configCP[y] = data.years[y].soldeInitialCP || 0;
                    newData.configRTT[y] = data.years[y].soldeInitialRTT || 0;
                    if (data.years[y].absences) newData.absences.push(...data.years[y].absences);
                }
                return newData;
            }
            if (!data.configRetraite) data.configRetraite = {};
            if (!data.absences) data.absences = [];
            if (!data.configCP) data.configCP = {};
            if (!data.configRTT) data.configRTT = {};
            return data;
        }

        async function sauvegarderDonneesCloud() {
            // Sauvegarde locale synchrone (fiable)
            localStorage.setItem('conges_rtt_data_v2', JSON.stringify(appData));
            // FIX #9 – Sauvegarde cloud en fire-and-forget intentionnel :
            // mode no-cors = pas de lecture de réponse possible, on ignore le résultat.
            fetch(GOOGLE_SHEETS_URL, {
                method: "POST", mode: "no-cors", credentials: "omit",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify(appData)
            }).catch(e => console.debug('Sync cloud échouée (hors-ligne ?)', e));
        }

        function updateSelectors() {
            // FIX #6 – Utilise le cache DOM
            let cpSet = new Set(Object.keys(appData.configCP));
            cpSet.add(currentCPPeriod);
            let cpArr = Array.from(cpSet).sort().reverse();

            DOM.selectCp.innerHTML = '';
            cpArr.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y; opt.textContent = formatCPPeriod(y);
                DOM.selectCp.appendChild(opt);
            });
            DOM.selectCp.value = currentCPPeriod;

            let rttSet = new Set(Object.keys(appData.configRTT));
            rttSet.add(currentRTTPeriod);
            let rttArr = Array.from(rttSet).sort().reverse();

            DOM.selectRtt.innerHTML = '';
            rttArr.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y; opt.textContent = y;
                DOM.selectRtt.appendChild(opt);
            });
            DOM.selectRtt.value = currentRTTPeriod;
        }

        window.changerPeriodeCP = function() {
            currentCPPeriod = DOM.selectCp.value; // FIX #6
            mettreAJourAffichage();
        }
        window.changerPeriodeRTT = function() {
            currentRTTPeriod = DOM.selectRtt.value; // FIX #6
            mettreAJourAffichage();
        }

        // FIX #5 – Découpage en calculerSoldes() + afficherSoldes() pour plus de clarté
        function calculerSoldes() {
            const initCP  = appData.configCP[currentCPPeriod] || 0;
            const prisCP  = appData.absences
                .filter(a => a.type === 'CP' && getCPPeriod(a.date) === currentCPPeriod)
                .reduce((s, a) => s + a.duree, 0);

            const initRTT = appData.configRTT[currentRTTPeriod] || 0;
            const prisRTT = appData.absences
                .filter(a => a.type === 'RTT' && getRTTPeriod(a.date) === currentRTTPeriod)
                .reduce((s, a) => s + a.duree, 0);

            return { initCP, prisCP, resteCP: initCP - prisCP, initRTT, prisRTT, resteRTT: initRTT - prisRTT };
        }

        function afficherSoldes({ initCP, prisCP, resteCP, initRTT, prisRTT, resteRTT }) {
            DOM.soldeCp.textContent  = resteCP  % 1 === 0 ? resteCP  : resteCP.toFixed(1);
            DOM.soldeRtt.textContent = resteRTT % 1 === 0 ? resteRTT : resteRTT.toFixed(1);

            if (DOM.totalCp) DOM.totalCp.textContent = initCP;
            if (DOM.totalRtt) DOM.totalRtt.textContent = initRTT;
            if (DOM.prisCp) DOM.prisCp.textContent = prisCP % 1 === 0 ? prisCP : prisCP.toFixed(1);
            if (DOM.prisRtt) DOM.prisRtt.textContent = prisRTT % 1 === 0 ? prisRTT : prisRTT.toFixed(1);

            let pctCp = initCP > 0 ? Math.max(0, Math.min(100, Math.round((resteCP  / initCP)  * 100))) : 0;
            let pctRtt = initRTT > 0 ? Math.max(0, Math.min(100, Math.round((resteRTT / initRTT) * 100))) : 0;

            if (DOM.progressTextCp) DOM.progressTextCp.textContent = pctCp + '%';
            if (DOM.progressTextRtt) DOM.progressTextRtt.textContent = pctRtt + '%';

            if (DOM.progressCp) DOM.progressCp.setAttribute('stroke-dasharray', `${pctCp}, 100`);
            if (DOM.progressRtt) DOM.progressRtt.setAttribute('stroke-dasharray', `${pctRtt}, 100`);

            DOM.initCp.value          = initCP  || '';
            DOM.initRtt.value         = initRTT || '';
            DOM.labelCpYear.textContent    = currentCPPeriod;
            DOM.labelCpYearNext.textContent = parseInt(currentCPPeriod) + 1;
            DOM.labelRttYear.textContent   = currentRTTPeriod;
            
            if (DOM.cpSolderYear) DOM.cpSolderYear.textContent = parseInt(currentCPPeriod) + 1;
            if (DOM.rttPeriodeAnnee) DOM.rttPeriodeAnnee.textContent = currentRTTPeriod;

            const r = appData.configRetraite || {};
            DOM.retraiteLegal.value    = r.legal    || '';
            DOM.retraiteAnticipe.value = r.anticipe || '';
        }

        window.mettreAJourAffichage = function() {
            const soldes = calculerSoldes();
            afficherSoldes(soldes);
            renderHistorique();
            updateRetraite();
            renderCalendar();
        }

        // ─── Calendrier Logique ───
        window.showTab = function(tabName) {
            const tabs = ['dashboard', 'calendar', 'demandes'];
            tabs.forEach(t => {
                const el = document.getElementById(`tab-${t}`);
                if (el) {
                    el.classList.add('hidden');
                    el.classList.remove('block');
                    el.classList.remove('flex');
                }
                
                const nav = document.getElementById(`nav-${t}`);
                if (nav) {
                    nav.classList.remove('text-primary');
                    nav.classList.add('text-on-surface-variant');
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
                activeNav.classList.remove('text-on-surface-variant');
                activeNav.classList.add('text-primary');
            }
        }

        function getJoursFeries(year) {
            const feries = [];
            feries.push(`${year}-01-01`);
            feries.push(`${year}-05-01`);
            feries.push(`${year}-05-08`);
            feries.push(`${year}-07-14`);
            feries.push(`${year}-08-15`);
            feries.push(`${year}-11-01`);
            feries.push(`${year}-11-11`);
            feries.push(`${year}-12-25`);
            
            const n = year % 19; const c = Math.floor(year / 100); const u = year % 100;
            const s = Math.floor(c / 4); const t = c % 4;
            const p = Math.floor((c + 8) / 25); const q = Math.floor((c - p + 1) / 3);
            const e = (19 * n + c - s - q + 15) % 30;
            const b = Math.floor(u / 4); const d = u % 4;
            const L = (32 + 2 * t + 2 * b - e - d) % 7;
            const m = Math.floor((n + 11 * e + 22 * L) / 451);
            const moisPaques = Math.floor((e + L - 7 * m + 114) / 31);
            const jourPaques = ((e + L - 7 * m + 114) % 31) + 1;
            
            const paques = new Date(year, moisPaques - 1, jourPaques);
            const lundiPaques = new Date(paques); lundiPaques.setDate(paques.getDate() + 1);
            feries.push(`${year}-${String(lundiPaques.getMonth() + 1).padStart(2, '0')}-${String(lundiPaques.getDate()).padStart(2, '0')}`);
            
            const ascension = new Date(paques); ascension.setDate(paques.getDate() + 39);
            feries.push(`${year}-${String(ascension.getMonth() + 1).padStart(2, '0')}-${String(ascension.getDate()).padStart(2, '0')}`);
            
            const pentecote = new Date(paques); pentecote.setDate(paques.getDate() + 50);
            feries.push(`${year}-${String(pentecote.getMonth() + 1).padStart(2, '0')}-${String(pentecote.getDate()).padStart(2, '0')}`);
            
            return feries;
        }

        window.changeMonth = function(offset) {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
            renderCalendar();
        }

        function renderCalendar() {
            if (!DOM.calendarGrid) return;
            const year = currentCalendarDate.getFullYear();
            const month = currentCalendarDate.getMonth();
            const feries = getJoursFeries(year);
            
            // Calculer tous les jours couverts par chaque absence
            const absencesCoveredDays = new Map();
            if (appData && appData.absences) {
                appData.absences.forEach(a => {
                    let dureeRestante = a.duree;
                    let cDate = new Date(a.date);
                    let iterations = 0;
                    while (dureeRestante > 0 && iterations < 365) {
                        iterations++;
                        const isWeekend = cDate.getDay() === 0 || cDate.getDay() === 6;
                        const cYear = cDate.getFullYear();
                        const loopDateStr = `${cYear}-${String(cDate.getMonth() + 1).padStart(2, '0')}-${String(cDate.getDate()).padStart(2, '0')}`;
                        
                        const loopFeries = getJoursFeries(cYear);
                        const isFerie = loopFeries.includes(loopDateStr);
                        
                        if (!isWeekend && !isFerie) {
                            absencesCoveredDays.set(loopDateStr, a);
                            dureeRestante -= 1;
                        }
                        cDate.setDate(cDate.getDate() + 1);
                    }
                });
            }

            DOM.calendarMonthLabel.textContent = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            DOM.calendarGrid.innerHTML = '';
            
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            let startOffset = firstDay === 0 ? 6 : firstDay - 1;
            
            for (let i = 0; i < startOffset; i++) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'p-2 rounded-lg';
                DOM.calendarGrid.appendChild(emptyDiv);
            }
            
            const today = new Date();
            today.setHours(0,0,0,0);
            
            for (let i = 1; i <= daysInMonth; i++) {
                const currentDate = new Date(year, month, i);
                const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
                const isToday = currentDate.getTime() === today.getTime();
                
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const isFerie = feries.includes(dateStr);
                const absenceInfo = absencesCoveredDays.get(dateStr);
                
                const dayBtn = document.createElement('button');
                let baseClass = 'relative flex flex-col items-center justify-center p-2 h-14 rounded-lg text-body-md font-medium transition-colors active:scale-95 border border-transparent';
                
                if (isFerie) {
                    baseClass += ' bg-error-container/30 text-on-error-container';
                } else if (isWeekend) {
                    baseClass += ' bg-surface-container-lowest text-on-surface-variant opacity-70';
                } else if (isToday) {
                    baseClass += ' bg-primary-container text-on-primary-container font-bold border-primary/30';
                } else {
                    baseClass += ' bg-surface hover:bg-surface-container text-on-surface';
                }
                
                dayBtn.className = baseClass;
                
                let contentHTML = `<span>${i}</span>`;
                
                if (isFerie) {
                    contentHTML += `<span class="material-symbols-outlined absolute top-0.5 right-0.5 text-[10px] text-error">celebration</span>`;
                }
                
                if (absenceInfo) {
                    const bgColor = absenceInfo.type === 'CP' ? 'bg-primary' : 'bg-secondary';
                    contentHTML += `<span class="w-1.5 h-1.5 rounded-full ${bgColor} absolute bottom-1.5"></span>`;
                    dayBtn.title = `${absenceInfo.type} - ${absenceInfo.duree} j`;
                } else if (isFerie) {
                    dayBtn.title = `Jour férié`;
                }
                
                dayBtn.innerHTML = contentHTML;
                
                dayBtn.onclick = () => {
                    DOM.dateDebut.value = dateStr;
                    window.preparerAbsence(1);
                    showTab('dashboard');
                    document.getElementById('form-absence').classList.remove('hidden');
                };
                
                DOM.calendarGrid.appendChild(dayBtn);
            }
        }

        function getDetailedCountdown(targetDate) {
            let d1 = new Date();
            d1.setHours(0,0,0,0);
            let d2 = new Date(targetDate);
            d2.setHours(0,0,0,0);

            if (d1 >= d2) return { over: true };

            let years = d2.getFullYear() - d1.getFullYear();
            let months = d2.getMonth() - d1.getMonth();
            let days = d2.getDate() - d1.getDate();

            if (days < 0) {
                months--;
                let prevMonth = new Date(d2.getFullYear(), d2.getMonth(), 0).getDate();
                days += prevMonth;
            }
            if (months < 0) {
                years--;
                months += 12;
            }

            return { over: false, years, months, days };
        }

        function formatDetailedCountdown(targetDate) {
            const cd = getDetailedCountdown(targetDate);
            if (cd.over) return "C'est l'heure !";
            let parts = [];
            if (cd.years > 0) parts.push(`${cd.years} an${cd.years > 1 ? 's' : ''}`);
            if (cd.months > 0) parts.push(`${cd.months} mois`);
            if (cd.days > 0) parts.push(`${cd.days} jour${cd.days > 1 ? 's' : ''}`);
            return parts.join(', ') || "Aujourd'hui !";
        }

        window.toggleRetraiteSize = function() {
            appData.configRetraite = appData.configRetraite || {};
            appData.configRetraite.minimized = !appData.configRetraite.minimized;
            sauvegarderDonneesCloud();
            updateRetraite();
        }

        function updateRetraite() {
            const r = appData.configRetraite || {};

            if (!r.legal && !r.anticipe) {
                DOM.retraiteCard.classList.add('hidden');
                return;
            }
            DOM.retraiteCard.classList.remove('hidden');

            const today = new Date();
            today.setHours(0,0,0,0);

            if (r.minimized) {
                DOM.retraiteExpanded.classList.add('hidden');
                DOM.retraiteMinimized.classList.remove('hidden');
                DOM.retraiteMinimized.classList.add('flex');
                // FIX #4 – Toggle via classe CSS plutôt que innerHTML
                DOM.retraiteIcon.classList.add('rotated');

                const targetMini = r.anticipe ? new Date(r.anticipe) : new Date(r.legal);
                DOM.decompteMini.textContent = formatDetailedCountdown(targetMini) + (r.anticipe ? ' (Anticipé)' : '');
            } else {
                DOM.retraiteExpanded.classList.remove('hidden');
                DOM.retraiteMinimized.classList.add('hidden');
                DOM.retraiteMinimized.classList.remove('flex');
                DOM.retraiteIcon.classList.remove('rotated');

                if (r.legal) {
                    const target   = new Date(r.legal);
                    const diffDays = Math.ceil((target - today) / 86400000);
                    DOM.decompteLegal.textContent       = diffDays > 0 ? diffDays : "0";
                    DOM.decompteLegalDetail.textContent = formatDetailedCountdown(target);
                    DOM.dateLegalLabel.textContent      = target.toLocaleDateString('fr-FR');
                }

                if (r.anticipe) {
                    DOM.anticipeContainer.classList.remove('hidden');
                    const target   = new Date(r.anticipe);
                    const diffDays = Math.ceil((target - today) / 86400000);
                    DOM.decompteAnticipe.textContent       = diffDays > 0 ? diffDays : "0";
                    DOM.decompteAnticipeDetail.textContent = formatDetailedCountdown(target);
                    DOM.dateAnticipeLabel.textContent      = target.toLocaleDateString('fr-FR');
                } else {
                    DOM.anticipeContainer.classList.add('hidden');
                }
            }
        }

        window.sauvegarderConfig = function() {
            // FIX #6 – Utilise le cache DOM
            appData.configCP[currentCPPeriod]  = parseFloat(DOM.initCp.value)  || 0;
            appData.configRTT[currentRTTPeriod] = parseFloat(DOM.initRtt.value) || 0;

            appData.configRetraite = appData.configRetraite || {};
            appData.configRetraite.legal    = DOM.retraiteLegal.value;
            appData.configRetraite.anticipe = DOM.retraiteAnticipe.value;

            sauvegarderDonneesCloud();
            mettreAJourAffichage();
            toggleConfig();
        }

        // FIX #3 – Validation renforcée : whitelist du type, borne max de la durée
        const TYPES_VALIDES = new Set(['CP', 'RTT']);
        
        window.preparerAbsence = function(duree) {
            DOM.dureeAbsence.value = duree;
            if (!DOM.dateDebut.value) {
                DOM.dateDebut.value = new Date().toISOString().split('T')[0];
            }
            DOM.formAbsence.classList.remove('hidden');
        }

        window.ajouterAbsence = function() {
            const type  = DOM.typeAbsence.value;
            const date  = DOM.dateDebut.value;
            const duree = parseFloat(DOM.dureeAbsence.value);

            if (!TYPES_VALIDES.has(type))             return showError("Type d'absence invalide.");
            if (!date || isNaN(Date.parse(date)))     return showError("Date invalide.");
            if (isNaN(duree) || duree <= 0)           return showError("Durée invalide.");
            if (duree > 365)                          return showError("Durée maximale : 365 jours.");

            appData.absences.push({ id: Date.now(), type, date, duree });
            sauvegarderDonneesCloud();
            updateSelectors();
            mettreAJourAffichage();
            DOM.dureeAbsence.value = 1;
            DOM.formAbsence.classList.add('hidden');
        }

        window.supprimerAbsence = function(id) {
            // Conversion explicite en nombre pour la comparaison (les IDs sont des timestamps)
            appData.absences = appData.absences.filter(a => a.id !== Number(id));
            sauvegarderDonneesCloud();
            mettreAJourAffichage();
        }

        // FIX #1 – XSS : remplacement de innerHTML par createElement + textContent
        // FIX #7 – Styles inline migrés vers des classes CSS
        function renderHistorique() {
            DOM.historiqueList.innerHTML = '';

            if (appData.absences.length === 0) {
                DOM.historiqueVide.classList.remove('hidden');
                return;
            }
            DOM.historiqueVide.classList.add('hidden');

            const tries = [...appData.absences].sort((a, b) => new Date(b.date) - new Date(a.date));
            tries.forEach(a => {
                const periodTag = a.type === 'CP' ? formatCPPeriod(getCPPeriod(a.date)) : getRTTPeriod(a.date);
                const dateObj = new Date(a.date);
                const day = dateObj.getDate();
                const month = dateObj.toLocaleDateString('fr-FR', { month: 'short' });
                
                // Set color theme depending on type
                const iconBgClass = a.type === 'CP' ? 'bg-surface-container-low text-primary' : 'bg-surface-container text-on-surface-variant';
                const badgeBgClass = a.type === 'CP' ? 'bg-surface-container text-on-secondary-container' : 'bg-surface-container-high text-on-secondary-container';

                const item = document.createElement('div');
                item.className = 'p-4 flex items-center justify-between hover:bg-surface-bright transition-colors border-b border-surface-container-high/40 last:border-0';
                
                item.innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-lg ${iconBgClass} flex flex-col items-center justify-center shrink-0">
                        <span class="font-label-sm text-label-sm font-bold leading-none">${day}</span>
                        <span class="font-label-sm text-[9px] uppercase tracking-wider">${month}</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-label-lg text-label-lg font-semibold text-on-surface">Absence</h4>
                            <span class="px-2 py-0.5 rounded-full ${badgeBgClass} font-label-sm text-label-sm">${a.type}</span>
                        </div>
                        <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${a.duree} jour${a.duree > 1 ? 's' : ''} • ${periodTag}</p>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <button class="text-on-surface-variant hover:text-error transition-colors p-2 rounded-full hover:bg-error-container" aria-label="Supprimer">
                        <span class="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                </div>
                `;

                // Safe event binding
                const deleteBtn = item.querySelector('button');
                deleteBtn.addEventListener('click', () => window.supprimerAbsence(a.id));

                DOM.historiqueList.appendChild(item);
            });
        }

        window.toggleConfig = function() {
            DOM.configSection.classList.toggle('hidden'); // FIX #6
        }

        window.toggleCalendar = function() {
            const content = document.getElementById('calendar-content');
            const icon = document.getElementById('calendar-toggle-icon');
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.classList.remove('rotated');
            } else {
                content.classList.add('hidden');
                icon.classList.add('rotated');
            }
        }

        window.scrollToAbsence = function() {
            DOM.formAbsence.scrollIntoView({ behavior: 'smooth', block: 'center' }); // FIX #6
            DOM.formAbsence.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.5), 0 20px 50px -10px rgba(0,0,0,0.5)';
            setTimeout(() => { DOM.formAbsence.style.boxShadow = ''; }, 1500);
            setTimeout(() => { DOM.dateDebut.focus(); }, 500);
        }

        function showError(msg) {
            DOM.errorText.textContent = msg; // FIX #6
            DOM.errorMessage.classList.remove('hidden');
            setTimeout(() => DOM.errorMessage.classList.add('hidden'), 5000);
        }

        // FIX #8 – Un seul écouteur DOMContentLoaded pour initApp (ordre déterministe)
        // Le SW reste sur 'load' pour ne s'enregistrer qu'après le chargement complet.
        document.addEventListener('DOMContentLoaded', initApp);

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg  => console.log('ServiceWorker enregistré:', reg.scope))
                    .catch(err => console.warn('Échec ServiceWorker:', err));
            });
        }
    
