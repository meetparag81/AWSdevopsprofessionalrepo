function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
        function highlightText(text, clues) {
            if (!clues || clues.length === 0) return text;
            let highlighted = text;
            clues.forEach(clue => {
                const regex = new RegExp(`(${escapeRegExp(clue)})`, 'gi');
                highlighted = highlighted.replace(regex, '<span class="keyword-highlight">$1</span>');
            });
            return highlighted;
        }

        function setMode(mode) {
            appState.mode = mode;
            const btnPractice = document.getElementById('btn-practice-mode');
            const btnExam = document.getElementById('btn-exam-mode');
            const timerContainer = document.getElementById('timer-container');

            if (mode === 'practice') {
                btnPractice.className = "px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 bg-amber-500 text-slate-900 shadow";
                btnExam.className = "px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 text-slate-400 hover:text-slate-200";
                timerContainer.classList.add('hidden');
                stopTimer();
            } else {
                btnExam.className = "px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 bg-amber-500 text-slate-900 shadow";
                btnPractice.className = "px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 text-slate-400 hover:text-slate-200";
                timerContainer.classList.remove('hidden');
                if (!appState.submitted) startTimer();
            }
            saveState();
            renderQuestions();
        }

        function startTimer() {
            if (appState.timerInterval) clearInterval(appState.timerInterval);
            appState.timerInterval = setInterval(() => {
                if (appState.timeRemaining <= 0) {
                    clearInterval(appState.timerInterval);
                    submitExam();
                } else {
                    appState.timeRemaining--;
                    updateTimerDisplay();
                    if (appState.timeRemaining % 5 === 0) saveState();
                }
            }, 1000);
        }

        function stopTimer() {
            if (appState.timerInterval) clearInterval(appState.timerInterval);
        }

        function updateTimerDisplay() {
            const minutes = Math.floor(appState.timeRemaining / 60);
            const seconds = appState.timeRemaining % 60;
            document.getElementById('timer-display').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        function filterDomain(domain) {
            appState.activeDomain = domain;
            const buttons = document.querySelectorAll('.domain-btn');
            buttons.forEach(btn => {
                if ((domain === 'all' && btn.textContent.includes('All Domains')) || (domain !== 'all' && btn.textContent.includes(domain))) {
                    btn.className = "domain-btn active px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-slate-900 border border-amber-500 transition shadow";
                } else {
                    btn.className = "domain-btn px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition";
                }
            });
            renderQuestions();
        }

        function handleSelectOption(qId, optIdx, isMulti) {
            if (appState.submitted && appState.mode === 'exam') return;
            if (appState.mode === 'practice' && appState.evaluated[qId]) return;

            const q = rawQuestions.find(item => item.id === qId);
            if (!appState.answers[qId]) appState.answers[qId] = [];

            const userSelected = appState.answers[qId];
            const requiredSelections = q.c.length;

            if (isMulti) {
                const idx = userSelected.indexOf(optIdx);
                if (idx > -1) {
                    userSelected.splice(idx, 1);
                } else {
                    if (userSelected.length < requiredSelections) {
                        userSelected.push(optIdx);
                    }
                }
            } else {
                appState.answers[qId] = [optIdx];
            }

            saveState();
            updateProgress();
            renderQuestionCard(qId);
        }

        function checkAnswer(qId) {
            appState.evaluated[qId] = true;
            saveState();
            updateProgress();
            renderQuestionCard(qId);
        }

        function updateProgress() {
            let answeredCount = 0;
            if (appState.mode === 'practice') {
                answeredCount = Object.keys(appState.evaluated).length;
            } else {
                answeredCount = Object.keys(appState.answers).filter(k => {
                    const q = rawQuestions.find(item => item.id == k);
                    return appState.answers[k] && appState.answers[k].length === q.c.length;
                }).length;
            }
            
            document.getElementById('answered-count').textContent = answeredCount;
            const pct = Math.round((answeredCount / rawQuestions.length) * 100);
            document.getElementById('progress-bar').style.width = `${pct}%`;
        }

        function renderQuestions() {
            const container = document.getElementById('questions-list');
            container.innerHTML = '';
            
            const cheatSheet = document.getElementById('cheat-sheet');
            if (cheatSheet) {
                if (appState.activeDomain === 'all' || rawQuestions.some(q => q.dom === appState.activeDomain)) {
                    cheatSheet.parentElement.classList.remove('hidden');
                } else {
                    cheatSheet.parentElement.classList.add('hidden');
                }
            }
            
            const filtered = rawQuestions.filter(q => appState.activeDomain === 'all' || q.dom.includes(appState.activeDomain));
            filtered.forEach(q => container.appendChild(createQuestionCardHtml(q)));
        }

        function renderQuestionCard(qId) {
            const existingCard = document.getElementById(`question-card-${qId}`);
            if (existingCard) {
                const newCard = createQuestionCardHtml(rawQuestions.find(q => q.id === qId));
                existingCard.replaceWith(newCard);
            }
        }

        function createQuestionCardHtml(q) {
            const card = document.createElement('div');
            card.id = `question-card-${q.id}`;
            card.className = "bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-lg transition-all duration-200 hover:border-slate-600";

            const userSelected = appState.answers[q.id] || [];
            const isMulti = q.c.length > 1;
            const requiredSelections = q.c.length;
            
            const isPracticeEvaluated = appState.mode === 'practice' && appState.evaluated[q.id];
            const isExamEvaluated = appState.submitted;

            let displayQuestion = q.q;
            if ((isPracticeEvaluated || isExamEvaluated) && q.x && q.x.length > 0) {
                displayQuestion = highlightText(q.q, q.x);
            }

            let html = `
                <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div class="flex items-center space-x-2">
                        <span class="px-2.5 py-1 text-xs font-extrabold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">Question ${q.id}</span>
                        ${isMulti ? `<span class="px-2 py-0.5 text-[10px] font-semibold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded">Select ${requiredSelections}</span>` : ''}
                    </div>
                    <span class="text-xs font-medium text-slate-400 bg-slate-900/60 px-3 py-1 rounded-full border border-slate-700/50">${q.dom}</span>
                </div>
                <p class="text-slate-100 font-medium text-sm sm:text-base leading-relaxed mb-5">${displayQuestion}</p>
                <div class="space-y-2.5">
            `;

            q.o.forEach((optText, optIdx) => {
                const isSelected = userSelected.includes(optIdx);
                const isCorrect = q.c.includes(optIdx);

                let optClass = "border-slate-700 bg-slate-900/40 hover:bg-slate-700/50 text-slate-200";
                
                // EXPLICIT SVG WIDTH/HEIGHT CONSTRAINTS ADDED HERE TO PREVENT BLOWUPS
                let indicatorHtml = `<div style="width: 16px; height: 16px; min-width: 16px;" class="rounded-full border border-slate-500 flex items-center justify-center mr-3 mt-0.5 shrink-0 ${isSelected ? 'border-amber-500 bg-amber-500' : ''}">${isSelected ? '<div style="width: 6px; height: 6px;" class="rounded-full bg-slate-900"></div>' : ''}</div>`;
                if (isMulti) {
                    indicatorHtml = `<div style="width: 16px; height: 16px; min-width: 16px;" class="rounded border border-slate-500 flex items-center justify-center mr-3 mt-0.5 shrink-0 ${isSelected ? 'border-amber-500 bg-amber-500' : ''}">${isSelected ? '<svg style="width: 12px; height: 12px;" class="text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>' : ''}</div>`;
                }

                if (isPracticeEvaluated || isExamEvaluated) {
                    if (isCorrect) {
                        optClass = "border-emerald-500/60 bg-emerald-950/30 text-emerald-200 font-medium";
                        indicatorHtml = `<div style="width: 16px; height: 16px; min-width: 16px;" class="rounded-full bg-emerald-500 text-slate-900 flex items-center justify-center mr-3 mt-0.5 shrink-0 font-bold text-xs">✓</div>`;
                    } else if (isSelected && !isCorrect) {
                        optClass = "border-rose-500/60 bg-rose-950/30 text-rose-200 font-medium";
                        indicatorHtml = `<div style="width: 16px; height: 16px; min-width: 16px;" class="rounded-full bg-rose-500 text-white flex items-center justify-center mr-3 mt-0.5 shrink-0 font-bold text-xs">✕</div>`;
                    }
                } else if (isSelected) {
                    optClass = "border-amber-500/80 bg-amber-500/10 text-amber-200 font-medium shadow-sm";
                }

                const pointerEvent = (isPracticeEvaluated || isExamEvaluated) ? 'pointer-events-none' : 'cursor-pointer';

                html += `
                    <label onclick="handleSelectOption(${q.id}, ${optIdx}, ${isMulti})" class="flex items-start p-3.5 rounded-xl border transition-all duration-150 select-none ${optClass} ${pointerEvent}">
                        ${indicatorHtml}
                        <span class="text-xs sm:text-sm leading-snug">${optText}</span>
                    </label>
                `;
            });

            html += `</div>`;

            if (appState.mode === 'practice' && !isPracticeEvaluated) {
                const btnDisabled = userSelected.length !== requiredSelections ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-400';
                html += `<button ${userSelected.length !== requiredSelections ? 'disabled' : ''} onclick="checkAnswer(${q.id})" class="mt-5 px-5 py-2 bg-amber-500 text-slate-900 font-bold text-sm rounded-lg transition ${btnDisabled}">Check Answer</button>`;
            }

            if (isPracticeEvaluated || isExamEvaluated) {
                const userCorrect = isQuestionCorrect(q.id);
                const cluesHtml = q.x && q.x.length > 0 
                    ? q.x.map(clue => `<span class="inline-block bg-yellow-500/10 text-amber-400 border border-yellow-500/20 px-2 py-1 rounded text-xs font-mono mr-1.5 mb-1.5">"${clue}"</span>`).join('')
                    : '<span class="text-xs text-slate-500">No explicit clues extracted for this question</span>';

                html += `
                    <details class="aws-expl-container" open>
                        <summary class="aws-expl-summary">Show/Hide Explanation</summary>
                        <div class="mt-4 border-t border-slate-700/80 fade-in">
                            <div class="flex items-center space-x-2 mb-3 mt-3">
                                <span class="text-xs font-bold uppercase tracking-wider ${userCorrect ? 'text-emerald-400' : 'text-rose-400'}">
                                    ${userCorrect ? '✓ Correct Answer' : '✕ Incorrect'}
                                </span>
                            </div>
                            ${q.x && q.x.length > 0 ? `
                            <div class="mb-3 p-3.5 rounded-xl bg-slate-900/60 border border-amber-500/30">
                                <span class="text-[11px] font-extrabold uppercase tracking-wider text-amber-400 block mb-2">Exam Clues (Keyword Indicators):</span>
                                <div class="flex flex-wrap">${cluesHtml}</div>
                            </div>` : ''}
                            
                            ${q.customHtml ? q.customHtml : `
                            <div class="p-4 rounded-xl bg-slate-900/80 border border-slate-700/60 text-xs sm:text-sm text-slate-300 leading-relaxed mb-3">
                                <strong class="text-slate-100 block mb-1">Architectural Breakdown:</strong>
                                ${q.e}
                            </div>
                            ${q.w ? `
                            <div class="p-4 rounded-xl bg-rose-950/20 border border-rose-900/40 text-xs sm:text-sm text-slate-400 leading-relaxed">
                                <strong class="text-rose-400 block mb-2">Why Incorrect Options Fail:</strong>
                                ${q.w}
                            </div>
                            ` : ''}
                            `}
                        </div>
                    </details>
                `;
            }
            card.innerHTML = html;
            return card;
        }

        function isQuestionCorrect(qId) {
            const q = rawQuestions.find(item => item.id === qId);
            const userAns = appState.answers[qId] || [];
            if (userAns.length !== q.c.length) return false;
            return q.c.every(val => userAns.includes(val));
        }

        function submitExam(skipSave = false) {
            appState.submitted = true;
            stopTimer();
            if(!skipSave) {
                saveState();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }

            let correctCount = 0;
            rawQuestions.forEach(q => { if (isQuestionCorrect(q.id)) correctCount++; });

            const percentage = Math.round((correctCount / rawQuestions.length) * 100);
            const isPass = percentage >= 75;

            document.getElementById('results-screen').classList.remove('hidden');
            document.getElementById('submit-container').classList.add('hidden');

            const scoreBadge = document.getElementById('score-badge');
            document.getElementById('score-percentage').textContent = `${percentage}%`;
            document.getElementById('score-raw').textContent = `${correctCount} / ${rawQuestions.length} Correct`;
            
            const scoreStatus = document.getElementById('score-status');
            if (isPass) {
                scoreBadge.className = "mt-6 inline-flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/20 shadow-inner text-emerald-400";
                scoreStatus.textContent = "PASS";
                scoreStatus.className = "mt-2 text-xs uppercase tracking-widest font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
            } else {
                scoreBadge.className = "mt-6 inline-flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-rose-500/50 bg-rose-950/20 shadow-inner text-rose-400";
                scoreStatus.textContent = "FAIL";
                scoreStatus.className = "mt-2 text-xs uppercase tracking-widest font-bold px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30";
            }

            const domains = [...new Set(rawQuestions.map(q => q.dom))];
            const domainGrid = document.getElementById('domain-results-grid');
            domainGrid.innerHTML = '';

            domains.forEach(dName => {
                const domainQuestions = rawQuestions.filter(q => q.dom === dName);
                if(domainQuestions.length === 0) return;
                
                let dCorrect = 0;
                domainQuestions.forEach(dq => { if (isQuestionCorrect(dq.id)) dCorrect++; });
                const dPct = Math.round((dCorrect / domainQuestions.length) * 100);

                domainGrid.innerHTML += `
                    <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 flex flex-col justify-between">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-semibold text-slate-200">${dName}</span>
                            <span class="text-xs font-extrabold ${dPct >= 75 ? 'text-emerald-400' : 'text-amber-400'}">${dPct}%</span>
                        </div>
                        <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                            <div class="h-full ${dPct >= 75 ? 'bg-emerald-500' : 'bg-amber-500'}" style="width: ${dPct}%"></div>
                        </div>
                        <span class="text-[10px] text-slate-400 mt-2 block">${dCorrect} of ${domainQuestions.length} correct</span>
                    </div>
                `;
            });
            renderQuestions(); 
        }

        function resetQuiz() {
            if(confirm("Are you sure you want to reset the quiz? This will clear all your saved progress.")) {
                
                appState.answers = {};
                appState.evaluated = {};
                appState.submitted = false;
                appState.timeRemaining = 180 * 60;
                document.getElementById('results-screen').classList.add('hidden');
                document.getElementById('submit-container').classList.remove('hidden');
                if (appState.mode === 'exam') startTimer();
                updateProgress();
                renderQuestions();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    

// Shared by all generated domain masters; the cloud adapter owns persistence.
const baseMasterCard = createQuestionCardHtml;
createQuestionCardHtml = function(question) {
    const card = baseMasterCard(question);
    const provenance = document.createElement('p');
    provenance.className = 'text-xs text-slate-400 mb-3';
    provenance.style.overflowWrap = 'anywhere';
    provenance.textContent = question.sources.map(source =>
        'Part ' + source.part + ' / original Question ' + source.questionId).join('; ');
    card.prepend(provenance);
    if ((appState.submitted || appState.evaluated[question.id]) && question.alternateExplanations.length) {
        for (const variant of question.alternateExplanations) {
            const details = document.createElement('details');
            details.className = 'aws-expl-container alternate-explanation';
            const summary = document.createElement('summary');
            summary.className = 'aws-expl-summary';
            summary.textContent = 'Additional original explanation - Part ' + variant.source.part +
                ', Question ' + variant.source.questionId;
            details.appendChild(summary);
            const content = document.createElement('div');
            content.className = 'mt-4 leading-relaxed';
            const explanation = variant.explanation;
            content.innerHTML = explanation.customHtml ||
                '<div>' + (explanation.e || '') + '</div><div class="mt-4">' + (explanation.w || '') + '</div>';
            details.appendChild(content);
            if (explanation.x && explanation.x.length) {
                const clues = document.createElement('p');
                clues.textContent = 'Original clues: ' + explanation.x.join('; ');
                details.appendChild(clues);
            }
            card.appendChild(details);
        }
    }
    return card;
};

const masterFilterGroup = document.querySelector('.domain-btn').parentElement;
masterFilterGroup.replaceChildren();
for (const domain of ['all', ...new Set(rawQuestions.map(question => question.dom))]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.domain = domain;
    button.textContent = domain === 'all' ? 'All Domains' : domain;
    button.addEventListener('click', () => filterDomain(domain));
    masterFilterGroup.appendChild(button);
}
filterDomain = function(domain) {
    appState.activeDomain = domain;
    for (const button of masterFilterGroup.children) {
        button.className = button.dataset.domain === domain ?
            'domain-btn active px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-slate-900 border border-amber-500 transition shadow' :
            'domain-btn px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition';
    }
    renderQuestions();
};
