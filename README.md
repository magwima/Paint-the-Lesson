# Paint the Lesson

Paint English lessons from any text, then teach them as courses: quizzes, homework, progress, certificates and live lessons.

Live at **https://magwima.github.io/Paint-the-Lesson/**

| Page | What it is |
| --- | --- |
| `index.html` | Landing page (Polish and English) |
| `app.html` | Teacher studio: paint lessons, slides, courses, students, calendar |
| `learn.html` | Student portal: join with a class code, lessons, quizzes, homework, certificates |
| `course.html?c=…` | Public course page with free preview lessons |
| `teacher.html?t=…` | Public teacher page |
| `verify.html?id=…` | Certificate check |

## Set up (once)

### 1. Database
1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/schema.sql` and press **Run**. It creates the tables, the security rules and the file storage. It is safe to run again after updates.

### 2. Sign-in settings
In Supabase → **Authentication** → **URL Configuration**:
- **Site URL**: `https://magwima.github.io/Paint-the-Lesson/`
- **Redirect URLs**: add `https://magwima.github.io/Paint-the-Lesson/**`

Optional:
- To skip email confirmation while testing: **Authentication → Sign In / Providers → Email** → turn off **Confirm email**.
- For "Continue with Google": **Authentication → Sign In / Providers → Google**, then follow Supabase's guide to make a Google client ID.

### 3. GitHub Pages
Repository **Settings → Pages** → **Deploy from a branch** → `main` / `(root)` → **Save**.

## AI
**Free trial (no key):** teachers without a key use the Supabase Edge Function `ai-trial`, which calls Claude with the secret `ANTHROPIC_API_KEY` (or Gemini with `GEMINI_API_KEY` if no Claude key is set). Daily limits are in the table `ai_trial_settings` (`per_user_daily`, `global_daily`, `enabled`); change them in Supabase → Table Editor.

**Own key:** a teacher can paste their own key in **Profile → AI** for unlimited use. Google Gemini keys are free (https://aistudio.google.com/app/apikey). OpenAI and Anthropic keys also work. The key stays in the teacher's browser; it is never stored in the database. Students don't need a key.

## Keys and safety
`js/config.js` holds the project URL and the **anon** key. That key is public by design; the row-level security in `schema.sql` decides what each person can see. **Never** put the `service_role` key in this repository.

What the rules guarantee:
- Teachers see only their own classes, courses, students and submissions.
- Students see only courses they joined, and only lessons that are open (drip release is enforced by the database).
- Quiz answer keys are never sent to students; quizzes are marked on the server.
- Students can't mark lessons complete without passing the quiz, give themselves marks, or issue certificates.

## Not yet
Payments, automatic emails and custom domains. Video files are linked from YouTube, Vimeo or Loom rather than hosted.
