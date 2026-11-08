(() => {
const PRACTICE_STORAGE_KEY = window.PRIVATE_PRACTICE_CONTEXT.storageKey;
'use strict';
const bank = JSON.parse(document.getElementById('question-data').textContent);
const byId = new Map(bank.questions.map(question => [question.id, question]));
const DURATION = 180 * 60 * 1000;
const element = id => document.getElementById(id);
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function isCorrect(question, selected = []) {
    return selected.length === question.correct.length && question.correct.every(index => selected.includes(index));
}
function scores(answers) {
    return bank.domains.map(domain => {
        const questions = bank.questions.filter(question => question.domain === domain);
        const correct = questions.filter(question => isCorrect(question, answers[question.id])).length;
        const answered = questions.filter(question => answers[question.id]?.length).length;
        return { domain, total: questions.length, correct, answered, percentage: questions.length ? correct / questions.length * 100 : null };
    });
}
function remaining(deadline, now = Date.now()) {
    return Math.max(0, Math.ceil((deadline - now) / 1000));
}
function newState(mode = 'practice') {
    return { mode, answers: {}, checked: [], current: 1, submitted: false, deadline: mode === 'exam' ? Date.now() + DURATION : null, finishedAt: null };
}
function validState(value) {
    if (!value || !['practice', 'exam'].includes(value.mode) || typeof value.submitted !== 'boolean' || !byId.has(value.current)) return false;
    const keys = ['mode', 'answers', 'checked', 'current', 'submitted', 'deadline', 'finishedAt'];
    if (Object.keys(value).length !== keys.length || !Object.keys(value).every(key => keys.includes(key))) return false;
    if (value.mode === 'exam' ? !Number.isFinite(value.deadline) || value.deadline <= 0 : value.deadline !== null) return false;
    if (value.submitted ? !Number.isFinite(value.finishedAt) : value.finishedAt !== null) return false;
    if (!value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers) || !Array.isArray(value.checked)) return false;
    if (new Set(value.checked).size !== value.checked.length || !value.checked.every(id => byId.has(id))) return false;
    if (value.mode === 'exam' && value.checked.length) return false;
    return Object.entries(value.answers).every(([id, selections]) => {
        const question = byId.get(Number(id));
        return question && Array.isArray(selections) && new Set(selections).size === selections.length && selections.length <= question.correct.length &&
            selections.every(index => Number.isInteger(index) && index >= 0 && index < question.options.length);
    }) && value.checked.every(id => value.answers[id]?.length === byId.get(id).correct.length);
}
function showError(message, error) {
    element('error').textContent = message;
    element('error').hidden = false;
    console.error(message, error);
}
let state = newState();
let syncLocked = window.PRIVATE_PRACTICE_CONTEXT?.sync === true;
let localCacheInvalid = false;
try {
    const saved = localStorage.getItem(PRACTICE_STORAGE_KEY);
    if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (!validState(parsed)) throw new Error('Saved attempt has an invalid structure.');
        state = parsed;
    }
} catch (error) {
    localCacheInvalid = true;
    showError('Saved progress could not be loaded. A fresh practice attempt is shown. Use a new-attempt button to replace it; browser storage may be unavailable.', error);
}
function save(reason = 'progress') {
    try {
        localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(state));
        localCacheInvalid = false;
    } catch (error) {
        showError('Progress could not be saved on this browser. Keep this page open to retain this attempt.', error);
    }
    if (window.PRIVATE_PRACTICE_CONTEXT?.sync === true && reason !== 'restore') {
        document.dispatchEvent(new CustomEvent('private-practice-progress', { detail: { reason } }));
    }
}
function content(paragraphs) {
    return paragraphs.map(paragraph => {
        const text = escapeHtml(paragraph.text).replace(/https?:\/\/[^\s<>]+/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
        return `${text ? `<p>${text}</p>` : ''}${paragraph.images.map(image => `<img src="${image}" alt="Source diagram" loading="lazy">`).join('')}`;
    }).join('');
}
function examMemory(question) {
    if (bank.studyAids) return bank.studyAids[question.id];
    if (bank.title !== 'PracticeTest1') return null;
    if (question.id === 1) return {
        keywords: 'Daily check + golden AMIs + Linux and Windows',
        hint: 'Separate recurring scheduling from event ingestion and threshold alarms. Look for an ordered workflow that launches instances, prepares the assessment prerequisites, and targets only the tagged instances.',
        shortcut: 'For this source scenario: EventBridge scheduled rule -> Step Functions -> launch EC2 instances -> install the Inspector Classic agent -> tag targets -> run the assessment. An event bus receives events; an alarm is not a daily schedule.',
        note: 'This question describes legacy Amazon Inspector Classic, not the current Amazon Inspector scanning workflow. Retain this distinction when studying; the original answer key is unchanged.',
        failures: [
            { index: 0, label: 'Workflow + event bus', reason: 'An event bus alone does not create a daily schedule, and the option omits the tags used to scope this assessment.' },
            { index: 1, label: 'Custom functions + alarm', reason: 'A threshold alarm is not a daily scheduler. The option also omits the Inspector Classic agent needed for the described assessment.' },
            { index: 3, label: 'Custom functions + scheduled rule', reason: 'The schedule and tags are present, but the required Inspector Classic agent installation is missing.' }
        ],
        services: [
            ['Amazon Inspector Classic', 'Legacy vulnerability ASSESSOR; this source workflow requires assessment preparation and target scoping.'],
            ['AWS Step Functions', 'Multi-step workflow ORCHESTRATOR; coordinates launching, preparation, and assessment.'],
            ['Amazon EC2', 'Instance RUNNER; launches the golden AMI so its operating system can be assessed.'],
            ['Amazon EventBridge', 'Event/schedule TRIGGER; a scheduled rule starts recurring work, while a bus receives and routes events.'],
            ['AWS Lambda', 'Custom-code EXECUTOR; can call APIs but must implement the required setup and sequencing.'],
            ['Amazon CloudWatch Alarms', 'Threshold WATCHER; reacts to alarm state, not a daily calendar schedule.']
        ]
    };
    if (question.id === 2) return {
        keywords: 'Small subset of users + verify before full release',
        hint: 'Distinguish shifting a small portion of live traffic first from approving a release before sending all traffic at once. Equal repeated traffic increments are a different rollout pattern.',
        shortcut: 'Small first release, then the remainder -> AWS CodeDeploy canary deployment. CodeDeployDefault.LambdaCanary10Percent5Minutes sends 10% of traffic first, waits 5 minutes, then shifts the remaining traffic. CloudFormation publishes the version; a manual approval alone does not split traffic.',
        note: '',
        failures: [
            { index: 1, label: 'CLI script + production alias switch', reason: 'Switching the production alias directly does not provide the requested small live-traffic release followed by verification.' },
            { index: 2, label: 'All-at-once deployment', reason: 'All traffic moves immediately, leaving no initial small-subset verification stage.' },
            { index: 3, label: 'Manual approval + production alias', reason: 'Approval gates the release but does not itself split live traffic between old and new versions.' }
        ],
        services: [
            ['AWS CloudFormation', 'Infrastructure/version DEFINER; provisions the resources, but publishing a version alone does not shift traffic gradually.'],
            ['AWS CodeDeploy', 'Deployment/traffic SHIFTER; canary starts small, linear uses equal repeated increments, all-at-once shifts everything.'],
            ['AWS CodePipeline', 'Release-stage COORDINATOR; approval pauses a pipeline, not a traffic split.'],
            ['AWS CodeBuild', 'Build/test RUNNER; can execute deployment commands, but does not inherently provide a canary traffic policy.'],
            ['AWS Lambda', 'Serverless EXECUTOR; published versions and aliases support routing invocations.'],
            ['Amazon DynamoDB', 'Application data STORE; not the deployment traffic controller.'],
            ['GitHub', 'Source-code HOST; supplies the pipeline source, not the runtime rollout strategy.']
        ]
    };
    return null;
}
const visibleHints = new Set();
function memoryExplanation(memory) {
    return `<aside class="notice"><h3>Exam Memory Shortcut</h3><p>${escapeHtml(memory.shortcut)}</p>${memory.note ? `<p>${escapeHtml(memory.note)}</p>` : ''}
        <div class="table-scroll"><table><caption>Why the other options fail</caption><thead><tr><th scope="col">Option</th><th scope="col">Why it fails</th></tr></thead>
        <tbody>${memory.failures.map(failure => `<tr><th scope="row">${String.fromCharCode(65 + failure.index)} - ${escapeHtml(failure.label)}</th><td>${escapeHtml(failure.reason)}</td></tr>`).join('')}</tbody></table></div>
        <h3>Service memory shortcuts</h3><ul>${memory.services.map(([service, detail]) => `<li><strong>${escapeHtml(service)}:</strong> ${escapeHtml(detail)}</li>`).join('')}</ul></aside>`;
}
function filteredQuestions() {
    return bank.questions.filter(question => {
        if (element('domain-filter').value !== 'all' && question.domain !== element('domain-filter').value) return false;
        const review = element('review-filter').value;
        if (review === 'unanswered') return !state.answers[question.id]?.length;
        if (review === 'incorrect') return state.submitted && !isCorrect(question, state.answers[question.id]);
        return true;
    });
}
function renderResults() {
    element('results').hidden = !state.submitted;
    if (!state.submitted) return;
    const rows = scores(state.answers);
    const correct = rows.reduce((sum, row) => sum + row.correct, 0);
    const answered = rows.reduce((sum, row) => sum + row.answered, 0);
    element('results').innerHTML = `<h2 id="results-title">Attempt complete</h2>
        <p><strong>${correct} / ${bank.questions.length} correct (${(correct / bank.questions.length * 100).toFixed(1)}%)</strong>.
        Answered: ${answered}. Unanswered: ${bank.questions.length - answered}.</p>
        <p>Domain accuracy = fully correct questions / all questions in that domain. Unanswered and partially correct multi-select answers count as incorrect. No questions in a domain = N/A.</p>
        <div class="table-scroll"><table><caption>Correct-answer percentage by domain</caption><thead><tr><th scope="col">Domain</th><th scope="col">Correct / total</th><th scope="col">Answered</th><th scope="col">Accuracy</th></tr></thead>
        <tbody>${rows.map(row => `<tr><th scope="row">${escapeHtml(row.domain)}</th><td>${row.correct} / ${row.total}</td><td>${row.answered}</td><td>${row.percentage === null ? 'N/A' : row.percentage.toFixed(1) + '%'}</td></tr>`).join('')}</tbody></table></div>
        <p>Review the questions below to see the correct answers and source explanations.</p>`;
}
function render() {
    const questions = filteredQuestions();
    if (questions.length && !questions.some(question => question.id === state.current)) {
        state.current = questions[0].id;
        save();
    }
    element('mode').textContent = (state.mode === 'exam' ? 'Exam mode' : 'Practice mode') + (state.submitted ? ' - completed' : '');
    const answered = Object.values(state.answers).filter(selections => selections.length).length;
    element('status').textContent = `${answered} of ${bank.questions.length} answered. ${state.submitted ? 'Answers are locked; explanations are available.' : state.mode === 'exam' ? 'Answers and explanations are hidden until submission. The timer continues if you close or reload the page.' : 'Untimed practice. Check an answer to reveal its explanation.'}`;
    element('finish').disabled = state.submitted;
    element('review-filter').querySelector('option[value="incorrect"]').disabled = !state.submitted;
    element('question-nav').innerHTML = questions.map(question => {
        const answered = Boolean(state.answers[question.id]?.length);
        const evaluated = state.submitted || state.checked.includes(question.id);
        const result = evaluated ? (isCorrect(question, state.answers[question.id]) ? 'correct' : 'incorrect') : '';
        return `<button data-question="${question.id}" class="${answered ? 'answered' : ''} ${result} ${question.id === state.current ? 'current' : ''}" ${question.id === state.current ? 'aria-current="step"' : ''} aria-label="Question ${question.id}, ${evaluated ? result : answered ? 'answered' : 'unanswered'}">${question.id}</button>`;
    }).join('');
    renderResults();
    const position = questions.findIndex(question => question.id === state.current);
    element('previous').disabled = position <= 0;
    element('next').disabled = position < 0 || position >= questions.length - 1;
    if (!questions.length) {
        element('question').innerHTML = '<p>No questions match these filters.</p>';
        updateTimer();
        return;
    }
    const question = questions[position];
    const memory = examMemory(question);
    const evaluated = state.submitted || state.checked.includes(question.id);
    const selected = state.answers[question.id] || [];
    element('question').innerHTML = `<h2>Question ${question.id} of ${bank.questions.length}</h2><p>${escapeHtml(question.domain)}</p>
        ${question.domainNote ? `<p class="notice">${escapeHtml(question.domainNote)}</p>` : ''}
        <div class="content">${content(question.stem)}</div>
        <fieldset><legend>Select ${question.correct.length === 1 ? 'ONE answer' : question.correct.length + ' answers'}</legend>
        ${question.options.map((option, index) => `<label class="option ${evaluated ? question.correct.includes(index) ? 'correct' : selected.includes(index) ? 'incorrect' : '' : ''}">
            <input type="${question.correct.length === 1 ? 'radio' : 'checkbox'}" name="answer" value="${index}" ${selected.includes(index) ? 'checked' : ''} ${evaluated ? 'disabled' : ''}>
            <span>${String.fromCharCode(65 + index)}.</span><span class="content">${content([option])}</span></label>`).join('')}</fieldset>
        ${state.mode === 'practice' && !evaluated ? '<button id="check-answer">Check answer</button>' : ''}
        ${memory && (state.mode === 'practice' || state.submitted) ? `<button id="toggle-hint" type="button" aria-controls="exam-memory-hint" aria-expanded="${visibleHints.has(question.id)}">${visibleHints.has(question.id) ? 'Hide' : 'Show'} Hint</button>
        <aside id="exam-memory-hint" class="notice" ${visibleHints.has(question.id) ? '' : 'hidden'}><h3>Exam Memory Hint</h3><p><strong>${escapeHtml(memory.keywords)}</strong></p><p>${escapeHtml(memory.hint)}</p></aside>` : ''}
        <p id="answer-feedback" role="status">${evaluated ? `${isCorrect(question, selected) ? 'Correct.' : selected.length ? 'Incorrect.' : 'Unanswered.'} Correct answer${question.correct.length > 1 ? 's' : ''}: ${question.correct.map(index => String.fromCharCode(65 + index)).join(', ')}.` : ''}</p>
        ${evaluated ? `<details open><summary>Explanation and references</summary>${memory ? memoryExplanation(memory) : ''}<div class="content">${content(question.explanation)}</div></details>` : ''}`;
    updateTimer();
}
function finish(timedOut = false) {
    if (syncLocked || state.submitted) return;
    state.submitted = true;
    state.finishedAt = Date.now();
    save('submit');
    render();
    if (timedOut) element('status').textContent = 'Time expired. Your exam was automatically submitted.';
    element('results').focus();
}
function updateTimer() {
    element('timer').textContent = state.mode === 'practice' ? 'Untimed' : state.submitted ? 'Timer stopped' : (() => {
        const seconds = remaining(state.deadline);
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} remaining`;
    })();
}
function expireIfNeeded() {
    if (syncLocked) return false;
    if (state.mode === 'exam' && !state.submitted && remaining(state.deadline) === 0) {
        finish(true);
        return true;
    }
    return false;
}
function start(mode) {
    if (syncLocked) return;
    if (!confirm(`Start a new ${mode} attempt? This replaces this test's saved answers and results.`)) return;
    state = newState(mode);
    visibleHints.clear();
    element('domain-filter').value = 'all';
    element('review-filter').value = 'all';
    save('reset');
    render();
}
element('start-practice').addEventListener('click', () => start('practice'));
element('start-exam').addEventListener('click', () => start('exam'));
element('finish').addEventListener('click', () => {
    if (!expireIfNeeded() && confirm('Finish this attempt? Unanswered questions count as incorrect.')) finish();
});
element('domain-filter').addEventListener('change', render);
element('review-filter').addEventListener('change', render);
element('question-nav').addEventListener('click', event => {
    const button = event.target.closest('button[data-question]');
    if (syncLocked || !button || expireIfNeeded()) return;
    state.current = Number(button.dataset.question);
    save();
    render();
});
for (const [id, step] of [['previous', -1], ['next', 1]]) {
    element(id).addEventListener('click', () => {
        if (syncLocked || expireIfNeeded()) return;
        const questions = filteredQuestions();
        const position = questions.findIndex(question => question.id === state.current);
        const next = questions[position + step];
        if (next) { state.current = next.id; save(); render(); }
    });
}
element('question').addEventListener('change', event => {
    if (syncLocked || !event.target.matches('input[name="answer"]') || expireIfNeeded() || state.submitted || state.checked.includes(state.current)) return;
    const question = byId.get(state.current);
    const selected = [...element('question').querySelectorAll('input[name="answer"]:checked')].map(input => Number(input.value));
    if (selected.length > question.correct.length) {
        event.target.checked = false;
        element('answer-feedback').textContent = `Select at most ${question.correct.length} answers.`;
        return;
    }
    state.answers[state.current] = selected;
    save();
    render();
});
element('question').addEventListener('click', event => {
    if (syncLocked || expireIfNeeded()) return;
    if (event.target.closest('#toggle-hint')) {
        if (!examMemory(byId.get(state.current)) || (state.mode === 'exam' && !state.submitted)) return;
        if (visibleHints.has(state.current)) visibleHints.delete(state.current);
        else visibleHints.add(state.current);
        render();
        return;
    }
    if (syncLocked || !event.target.closest('#check-answer') || expireIfNeeded() || state.submitted || state.mode !== 'practice') return;
    const question = byId.get(state.current);
    if ((state.answers[state.current] || []).length !== question.correct.length) {
        element('answer-feedback').textContent = `Select exactly ${question.correct.length} answer${question.correct.length > 1 ? 's' : ''} before checking.`;
        return;
    }
    if (!state.checked.includes(state.current)) state.checked.push(state.current);
    save();
    render();
});
render();
expireIfNeeded();
setInterval(() => { if (!expireIfNeeded()) updateTimer(); }, 1000);
document.addEventListener('visibilitychange', expireIfNeeded);

window.PRIVATE_PRACTICE_BRIDGE = Object.freeze({
    getProgress: () => JSON.parse(JSON.stringify(state)),
    validate(value) {
        if (!validState(value)) throw new Error('The saved private practice attempt is invalid.');
    },
    apply(value) {
        this.validate(value);
        state = JSON.parse(JSON.stringify(value));
        element('domain-filter').value = 'all';
        element('review-filter').value = 'all';
        save('restore');
        render();
    },
    lock(value) {
        syncLocked = value;
        element('private-quiz').inert = value;
        if (!value) expireIfNeeded();
    },
    hasLocalCache() {
        if (localCacheInvalid) throw new Error('The browser attempt could not be read safely. Do not overwrite cloud progress.');
        return localStorage.getItem(PRACTICE_STORAGE_KEY) !== null;
    },
    hasProgress: () => state.submitted || state.mode === 'exam' || state.current !== 1 ||
        Object.values(state.answers).some(answers => answers.length) || state.checked.length > 0,
    subscribe(listener) {
        const handler = event => listener(event.detail.reason);
        document.addEventListener('private-practice-progress', handler);
        return () => document.removeEventListener('private-practice-progress', handler);
    }
});
})();