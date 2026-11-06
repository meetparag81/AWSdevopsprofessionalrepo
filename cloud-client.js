import { createClient } from '@supabase/supabase-js';

document.addEventListener('DOMContentLoaded', () => {
    const config = window.QUIZ_CLOUD_CONFIG;
    const quiz = window.quizBridge;
    const element = id => document.getElementById(id);
    const status = (message, kind = 'pending') => {
        element('cloud-status').textContent = message;
        element('cloud-status').dataset.kind = kind;
    };
    const report = error => {
        console.error('Quiz cloud sync:', error.message);
        status(`Not synced: ${error.message} Your browser copy is kept. Use Sync now to retry.`, 'error');
    };
    if (!quiz || !config?.url || !config.publishableKey?.startsWith('sb_publishable_') || !config.quizId) {
        status('Cloud setup is incomplete. Check supabase-config.js. Guest saving still works.', 'error');
        element('cloud-login').hidden = true;
        return;
    }

    const client = createClient(config.url, config.publishableKey, {
        auth: { detectSessionInUrl: false },
        global: {
            fetch: (url, options) => fetch(url, {
                ...options,
                signal: AbortSignal.timeout(15000),
                keepalive: String(url).includes('/rpc/save_quiz_progress')
            })
        }
    });
    let userId;
    let ready = false;
    let dirty = false;
    let revision = 0;
    let generation = 0;
    let changes = 0;
    let conflict = false;
    let remoteConflict = null;
    let scheduled;
    let saving;
    let guestCandidate = null;
    let authBusy = false;

    const metadataKey = () => `quiz-cloud:${config.url}:${config.quizId}:${userId}`;
    function writeMetadata() {
        localStorage.setItem(metadataKey(), JSON.stringify({ revision, pending: dirty }));
    }
    function readMetadata() {
        const stored = localStorage.getItem(metadataKey());
        if (!stored) return { revision: 0, pending: false };
        const value = JSON.parse(stored);
        if (!Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.pending !== 'boolean') {
            throw new Error('The saved sync checkpoint is invalid. Do not clear browser data until your progress is backed up.');
        }
        return value;
    }
    function hasProgress(progress) {
        return progress.submitted || Object.keys(progress.answers).length > 0 ||
            Object.keys(progress.evaluated).length > 0 || progress.timeRemaining !== 180 * 60;
    }
    function checkRow(row) {
        if (row && (!Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isFinite(Date.parse(row.updated_at)))) {
            throw new Error('The cloud returned an invalid save.');
        }
        if (row) quiz.validate(row.state);
        return row;
    }
    async function readRemote() {
        const { data, error } = await client.from('quiz_progress')
            .select('state,revision,updated_at').eq('user_id', userId).eq('quiz_id', config.quizId).maybeSingle();
        if (error) throw new Error(error.message);
        return checkRow(data);
    }
    function savedStatus(row) {
        status(`Saved to cloud: ${new Date(row.updated_at).toLocaleString()}. You can resume on another device.`, 'saved');
    }
    function showConflict(row) {
        ready = false;
        conflict = true;
        remoteConflict = row;
        element('cloud-conflict').hidden = false;
        quiz.lock(true);
        status('Sync paused: this device and the cloud have different progress. Choose a save below.', 'error');
    }
    function acceptRemote(row) {
        quiz.apply(row.state);
        revision = row.revision;
        dirty = false;
        conflict = false;
        ready = true;
        writeMetadata();
        element('cloud-conflict').hidden = true;
        savedStatus(row);
    }
    function schedule(reason = 'progress') {
        if (!userId || !ready || conflict) return;
        if (scheduled && reason === 'timer') return;
        clearTimeout(scheduled);
        scheduled = setTimeout(() => {
            scheduled = undefined;
            flush().catch(report);
        }, reason === 'timer' ? 15000 : 600);
    }
    async function flush() {
        if (saving) return saving;
        if (!userId || !ready || !dirty || conflict) return;
        clearTimeout(scheduled);
        scheduled = undefined;
        const activeGeneration = generation;
        const activeUser = userId;
        const changeNumber = changes;
        const state = quiz.getProgress();
        status('Saving to cloud...');
        saving = (async () => {
            const { data, error } = await client.rpc('save_quiz_progress', {
                p_quiz_id: config.quizId, p_state: state, p_expected_revision: revision
            }).single();
            if (generation !== activeGeneration || userId !== activeUser) return;
            if (error?.message === 'QUIZ_CONFLICT') {
                showConflict(await readRemote());
                return;
            }
            if (error) throw new Error(error.message);
            const row = checkRow(data);
            revision = row.revision;
            dirty = changes !== changeNumber;
            writeMetadata();
            if (dirty) status('New changes are waiting to sync...');
            else savedStatus(row);
        })();
        let succeeded = false;
        try {
            await saving;
            succeeded = true;
        } finally {
            saving = undefined;
            if (succeeded && dirty && ready && generation === activeGeneration) schedule();
        }
    }
    async function pull() {
        const activeGeneration = generation;
        quiz.lock(true);
        status('Checking cloud save...');
        try {
            const row = await readRemote();
            if (generation !== activeGeneration) return;
            if (dirty && revision !== (row?.revision ?? 0)) {
                showConflict(row);
                return;
            }
            if (row && !dirty) {
                acceptRemote(row);
            } else {
                if (!row && !hasProgress(quiz.getProgress()) && guestCandidate && hasProgress(guestCandidate) &&
                    confirm('No cloud save exists for this quiz. Upload the guest progress from this browser to your account?')) {
                    quiz.apply(guestCandidate);
                }
                guestCandidate = null;
                revision = row?.revision ?? 0;
                dirty = true;
                ready = true;
                writeMetadata();
            }
        } finally {
            if (generation === activeGeneration && !conflict) quiz.lock(false);
        }
        await flush();
    }
    async function transition(session) {
        const nextId = session?.user.id ?? null;
        if (nextId === userId) return;
        const previousId = userId;
        if (!previousId && nextId) guestCandidate = quiz.getProgress();
        generation++;
        clearTimeout(scheduled);
        scheduled = undefined;
        userId = nextId;
        ready = false;
        dirty = false;
        conflict = false;
        changes = 0;
        element('cloud-conflict').hidden = true;
        element('cloud-login').hidden = Boolean(userId);
        element('cloud-actions').hidden = !userId;
        element('cloud-account').hidden = !userId;
        element('cloud-account').textContent = userId ? `Signed in: ${session.user.email}` : '';
        quiz.lock(true);
        try {
            if (nextId || previousId) quiz.useAccount(nextId);
            if (!nextId) {
                status('Guest mode: saved only in this browser. Sign in to resume across devices.');
                return;
            }
            const metadata = readMetadata();
            revision = metadata.revision;
            dirty = metadata.pending;
            await pull();
        } finally {
            if (!conflict) quiz.lock(false);
        }
    }
    async function syncNow() {
        if (!userId || conflict) return;
        if (ready && dirty) await flush();
        else await pull();
    }
    function run(action) {
        return action().catch(report);
    }
    document.addEventListener('quiz-progress-saved', event => {
        if (!userId) return;
        dirty = true;
        changes++;
        try {
            writeMetadata();
        } catch (error) {
            report(error);
            return;
        }
        status('Saved in this browser; waiting for cloud sync...');
        if (event.detail.reason === 'submit') run(flush);
        else schedule(event.detail.reason);
    });
    element('cloud-login').addEventListener('submit', event => {
        event.preventDefault();
        if (authBusy) return;
        authBusy = true;
        const button = element('cloud-login').querySelector('button');
        button.disabled = true;
        status('Signing in...');
        run(async () => {
            try {
                const { data, error } = await client.auth.signInWithPassword({
                    email: element('cloud-email').value.trim(), password: element('cloud-password').value
                });
                if (error) throw new Error(error.message);
                await transition(data.session);
            } finally {
                element('cloud-password').value = '';
                button.disabled = false;
                authBusy = false;
            }
        });
    });
    element('cloud-sync').addEventListener('click', () => run(syncNow));
    element('cloud-signout').addEventListener('click', () => run(async () => {
        if (conflict) throw new Error('Choose a save before signing out.');
        await flush();
        if (dirty) throw new Error('Your latest changes are not synced. Sync them before signing out.');
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw new Error(error.message);
        await transition(null);
    }));
    element('cloud-use-remote').addEventListener('click', () => run(async () => {
        const row = await readRemote();
        if (!row) throw new Error('The cloud save was removed. Use this device to create a new save.');
        acceptRemote(row);
        quiz.lock(false);
    }));
    element('cloud-use-local').addEventListener('click', () => run(async () => {
        revision = remoteConflict?.revision ?? 0;
        dirty = true;
        conflict = false;
        ready = true;
        element('cloud-conflict').hidden = true;
        writeMetadata();
        quiz.lock(false);
        await flush();
    }));
    window.addEventListener('online', () => run(syncNow));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') run(flush);
        else if (userId && !dirty && !saving && !conflict) run(syncNow);
    });
    window.addEventListener('pagehide', () => run(flush));
    client.auth.onAuthStateChange((event, session) => {
        if (['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT'].includes(event)) {
            // Supabase auth callbacks must return before further authenticated requests.
            setTimeout(() => run(() => transition(session)), 0);
        }
    });
});
