# SDLC35 cloud quiz

This pilot publishes only the SDLC35 quiz. Other HTML quizzes are unchanged.
GitHub Pages hosts the public questions; Supabase Auth and row-level security
protect each account's saved answers and latest result. No passwords or secret
API keys belong in this repository.

## 1. Prepare Supabase

1. Open your project, then **SQL Editor > New query**. Paste and run
   [supabase-schema.sql](supabase-schema.sql).
2. In **Authentication > Users > Add user > Create new user**, create your
   email/password login and enable **Auto Confirm User**. Enter the password
   only in Supabase and the quiz login form, not in chat or source code.
3. For this personal pilot, disable public sign-ups under Authentication's
   sign-up settings. Users are provisioned through the dashboard; no email
   delivery service or OAuth application is required.
4. [supabase-config.js](supabase-config.js) contains the project's public URL,
   publishable key, and a stable quiz ID. These values may be public. Never
   substitute a service-role or secret key.

The SQL script is repeatable. It creates per-user read/write policies and a
revision-checked save function. Do not disable row-level security. Each future
quiz must have a different stable `quizId` and local storage key.

## 2. Publish on GitHub Pages

Publish these runtime files at the root of `meetparag81/AWSdevopsprofessionalrepo`:

- `SDLC35 questionsnew.html` renamed to `index.html`
- `SDLC35 questionsnew.css`
- `quiz-cloud.css`
- `quiz-cloud.js`
- `supabase-config.js`

In the repository, open **Settings > Pages**. Select **Deploy from a branch**,
then **main**, **/(root)**, and **Save**.

After deployment, the quiz URL is:
<https://meetparag81.github.io/AWSdevopsprofessionalrepo/>

Do not upload your other workspace files, saved browser data, credentials, or
database exports. Quiz questions and website code are public on Pages; the
database is not a public results page. GitHub account login alone does not log
you into the quiz.

## 3. Check PC and mobile

1. Open the hosted URL on PC and sign in using the login created in Supabase.
2. Answer and check a question, or submit the exam.
3. Wait for **Saved to cloud** before closing.
4. Open the same URL on mobile or another PC and sign in with the same account.
   The latest synced answers, evaluated explanations, mode, remaining exam time,
   and submitted result should return.
5. If two devices change the quiz, a conflict prompt asks which save to keep.
   No silent last-writer-wins replacement is performed.

The clock pauses when the page is closed. Timer-only changes sync about every
15 seconds; answers sync after a short debounce, and submission syncs immediately.
Closing before confirmation or while offline cannot guarantee cloud persistence.
When offline, changes remain in the signed-in user's browser cache and can sync
when connected again. **Sync now** retries failures or loads newer remote results.
If signed out while offline, sign-in requires internet access.

Guest and signed-in saves use different browser keys. On first sign-in, existing
guest progress is imported only with confirmation and only when no cloud save
exists. Existing local `file:` progress does not automatically move to the hosted
website because browser storage is origin-specific.

Each quiz stores **one latest attempt**, not attempt history. **Reset Quiz**
replaces that saved attempt once synced. Clearing browser data removes local
copies and the login, not successfully synced cloud saves. Sign out on shared
computers; local browser data and session tokens are not an encrypted vault.

## Development

Run `npm ci` followed by `npm run build` in this folder to rebuild the bundled
Supabase browser client after editing [cloud-client.js](cloud-client.js).
The checked-in bundle has no CDN dependency. Keep the existing generated quiz
stylesheet alongside the HTML. New Tailwind utility classes require regenerating
that stylesheet with Tailwind CSS 3.

## Free-plan limitations

Supabase's free tier may pause after a week of inactivity. Resume it from the
dashboard, then press **Sync now**. No paid plan is required for this pilot.
Check the current provider quotas before expanding usage. A successful local
save is not a successful cloud save: the two indicators are deliberately separate.
