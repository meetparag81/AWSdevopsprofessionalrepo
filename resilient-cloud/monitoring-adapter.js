/* Compatibility bridge for the existing Monitoring and Logging quiz engines. */
(() => {
    const config = window.QUIZ_CLOUD_CONFIG;
    const baseKey = `quiz-progress:${config.quizId}`;
    let activeKey = baseKey;
    let suppressSave = false;
    let locked = false;
    let previousState;
    let storageError = false;
    const empty = () => ({
        answers: {}, evaluated: {}, mode: 'practice', activeDomain: 'all',
        timeRemaining: 180 * 60, submitted: false, timerInterval: null
    });
    const localStatus = (message, failed = false) => {
        const indicator = document.getElementById('save-indicator');
        if (!indicator) return;
        indicator.textContent = message;
        indicator.style.opacity = '1';
        indicator.style.color = failed ? '#fb7185' : '';
    };
    const snapshot = () => {
        const { timerInterval, ...state } = appState;
        return JSON.parse(JSON.stringify(state));
    };
    const validate = state => {
        const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        if (!record(state) || !record(state.answers) || !record(state.evaluated) ||
            !['practice', 'exam'].includes(state.mode) ||
            !['all', ...rawQuestions.map(q => q.dom)].includes(state.activeDomain) ||
            !Number.isInteger(state.timeRemaining) || state.timeRemaining < 0 || state.timeRemaining > 180 * 60 ||
            typeof state.submitted !== 'boolean' ||
            !Object.entries(state.answers).every(([id, options]) => {
                const question = rawQuestions.find(q => String(q.id) === id);
                return question && Array.isArray(options) && options.length <= question.c.length &&
                    new Set(options).size === options.length &&
                    options.every(index => Number.isInteger(index) && index >= 0 && index < question.o.length);
            }) ||
            !Object.entries(state.evaluated).every(([id, value]) =>
                rawQuestions.some(q => String(q.id) === id) && typeof value === 'boolean')) {
            throw new Error('Invalid saved progress for this quiz.');
        }
        return {
            answers: state.answers, evaluated: state.evaluated, mode: state.mode,
            activeDomain: state.activeDomain, timeRemaining: state.timeRemaining,
            submitted: state.submitted, timerInterval: null
        };
    };
    const withoutTimer = state => {
        const { timeRemaining, ...rest } = state;
        return JSON.stringify(rest);
    };
    window.saveState = explicitReason => {
        if (suppressSave) return;
        const state = snapshot();
        const reason = explicitReason ?? (state.submitted && !previousState?.submitted ? 'submit' :
            previousState && withoutTimer(state) === withoutTimer(previousState) ? 'timer' : 'progress');
        previousState = state;
        try {
            localStorage.setItem(activeKey, JSON.stringify(state));
            storageError = false;
            localStatus('Saved in this browser');
        } catch (error) {
            if (!storageError) console.error('Unable to save quiz progress.', error);
            storageError = true;
            localStatus('Not saved: browser storage unavailable', true);
        }
        document.dispatchEvent(new CustomEvent('quiz-progress-saved', { detail: { reason } }));
    };
    const readLocal = () => {
        const stored = localStorage.getItem(activeKey);
        return stored ? validate(JSON.parse(stored)) : empty();
    };
    const original = {
        setMode, filterDomain, handleSelectOption, checkAnswer, submitExam, startTimer
    };
    const apply = state => {
        const checked = validate(state);
        stopTimer();
        suppressSave = true;
        try {
            appState = checked;
            document.getElementById('results-screen').classList.add('hidden');
            document.getElementById('submit-container').classList.remove('hidden');
            original.setMode(appState.mode);
            original.filterDomain(appState.activeDomain);
            if (appState.submitted) original.submitExam(true);
            updateProgress();
            const minutes = Math.floor(appState.timeRemaining / 60);
            document.getElementById('timer-display').textContent =
                `${String(minutes).padStart(2, '0')}:${String(appState.timeRemaining % 60).padStart(2, '0')}`;
            previousState = snapshot();
        } finally {
            suppressSave = false;
        }
    };
    window.startTimer = () => {
        if (!locked) original.startTimer();
    };
    for (const name of ['setMode', 'filterDomain', 'handleSelectOption', 'checkAnswer', 'submitExam']) {
        window[name] = (...args) => {
            if (locked) return;
            const result = original[name](...args);
            if (name === 'filterDomain') saveState();
            return result;
        };
    }
    window.resetQuiz = () => {
        if (locked || !confirm('Reset quiz? This replaces the saved attempt for this quiz on all devices after syncing.')) return;
        const mode = document.documentElement.dataset.quizLayout === 'compact' ? 'practice' : appState.mode;
        apply({ ...empty(), mode });
        saveState('progress');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.quizBridge = {
        getProgress: snapshot,
        validate,
        apply(state) {
            apply(state);
            try {
                localStorage.setItem(activeKey, JSON.stringify(snapshot()));
                localStatus('Saved in this browser');
            } catch (error) {
                console.error('Unable to cache cloud quiz progress.', error);
                localStatus('Cloud loaded; browser cache unavailable', true);
            }
        },
        useAccount(userId) {
            stopTimer();
            activeKey = userId ? `${baseKey}:${userId}` : baseKey;
            // Do not write a blank state if a damaged cache cannot be restored.
            apply(readLocal());
        },
        lock(value) {
            locked = value;
            document.querySelector('header').inert = value;
            document.querySelector('main').inert = value;
            if (value) stopTimer();
            else if (appState.mode === 'exam' && !appState.submitted) startTimer();
        }
    };
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('total-q-count').textContent = rawQuestions.length;
        try {
            apply(readLocal());
            if (localStorage.getItem(activeKey)) localStatus('Restored saved progress');
        } catch (error) {
            console.error('Unable to restore quiz progress.', error);
            apply(empty());
            localStatus('Could not restore saved progress', true);
        }
    });
})();
