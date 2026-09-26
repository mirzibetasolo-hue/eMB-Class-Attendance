# eMB Class Attendance — specification

**Version:** Netlify, online-only, 26 September 2026.

## Purpose and deployment

The app records attendance for subjects taught by a teacher. Administrators manage staff; teachers create subjects, import students and run sessions; students sign in and check themselves in. It is responsive on phone and desktop browsers and requires an internet connection. Netlify serves the prebuilt Next.js frontend from `out/` with **no build command**. A Netlify Function implements the API; Netlify Database (Postgres) stores shared records. This deployment starts with an empty database. The separate Cloudflare D1 database is not copied into it.

## Roles and features

| Role | Allowed behavior |
| --- | --- |
| Admin | First-use account setup, create teacher/admin accounts, manage every subject and session, import students, correct/export records. |
| Teacher | Create own subjects, import students, create sessions, view and correct own registers, export CSV. |
| Student | View only enrolled subjects and own attendance; submit one personal check-in per session. |

- **First setup and sign-in:** When no user exists, the first visitor creates an administrator account. Usernames are unique case-insensitively through lowercase normalization. Staff passwords are supplied by the administrator. An imported new student gets a random generated password shown once in the import result. Existing student accounts are enrolled without changing their password. Distribute credentials individually and privately.
- **Subjects:** Required code, description, and semester. Code becomes uppercase. The creator is the subject's teacher; admins can access all subjects.
- **CSV roster:** Headers `student_id,name` (case and punctuation tolerant). Quoted fields and commas in quotes work. The browser previews valid rows; each request accepts 1–300 students. Blank rows, staff username collisions and duplicate enrollments are skipped. Each successful import appends students to roster order. Import can partially succeed; the result lists added students and one-time passwords for new accounts. Username is lowercase student ID.
- **Sessions:** Teacher sets date, start, end and a session password (at least six characters). Times are entered and displayed in `Pacific/Port_Moresby` (UTC+10), with duration >0 and <=24 hours. A session code is hashed and cannot be recovered after creation. Teacher shares it with the class.
- **Check-in:** An enrolled, signed-in student enters the session password. The server checks enrollment, code and time, then inserts one record, protected by a unique `(session_id,student_id)` constraint. Browser device time is ignored. No offline submission or retry queue exists.
- **Scoring:** Online check-in is allowed at or after start and before end. Server time at or before start + exactly 30 minutes means `present`, score 100. After that and before end means `late`, score 50. With no record after end, the register derives `absent`, score 0. A teacher can override a row to present 100, late 50, escape 50 or absent 0. Escape is a teacher judgment, never detected automatically. Corrections record actor, time, reason, previous and new values in an audit table.
- **Register and export:** Show rows in student import order, with student ID/name, status and mark. A selected session can be exported as quoted UTF-8 CSV with student, subject, semester, session start, status, mark and check-in time. A failed request is displayed as an error; no attendance record is created by an offline device.

## Data and security

| Table | Fields and constraints |
| --- | --- |
| `users` | Text ID, unique username, name, role, salted password hash, creation time. |
| `auth_sessions` | Text ID, user ID, SHA-256 token hash, expiration. |
| `subjects` | Text ID, code, description, semester, teacher ID, creation time. |
| `enrollments` | Subject/student IDs and roster position; unique pair. |
| `class_sessions` | Subject ID, epoch-millisecond start/end, salted session-code hash. |
| `attendance` | Unique session/student, status, score, check-in/record times, source. |
| `audit` | Attendance ID, actor ID, previous/next JSON strings, reason and timestamp. |

Passwords and session codes use PBKDF2-HMAC-SHA-256 with a random 16-byte salt and 150,000 iterations. A random 32-byte session token is sent in a Secure, HttpOnly, SameSite=Lax cookie for seven days; only its SHA-256 digest is retained in the database. API mutations reject cross-origin browser requests. Every API request checks session identity and role/ownership or enrollment. No secret, API key or personal password belongs in source control. Generated student credentials are visible only during import and in an optional one-time credentials CSV; handle that file as sensitive.

**Operational limits:** Initial admin setup is available while there are no users; provision it promptly. There is no password reset screen, bulk account management, automated escape detection, offline operation or automated import of the earlier Cloudflare data. Teacher corrections are not currently grouped into a separate review queue. Multi-query correction and import flows are not wrapped in a database transaction, so infrastructure failures may leave partial results; inspect and reconcile such cases before retrying.

## API contract

All endpoints are same-origin `/api/*`, routed by `netlify.toml` to `netlify/functions/api.mjs`. Successful responses are JSON. Errors return `{error: string}` and a non-2xx status.

| Endpoint | Use |
| --- | --- |
| `GET /api/auth` | Current user and setup availability. |
| `POST /api/auth` | `action=setup` or `action=login`; returns a session cookie. |
| `DELETE /api/auth` | Revoke session and clear cookie. |
| `GET /api/data` | Role-filtered subjects, sessions, roster and records. |
| `POST /api/users` | Admin creates staff account. |
| `POST /api/subjects` | Teacher/admin creates subject. |
| `POST /api/import` | Teacher/admin imports parsed rows. |
| `POST /api/sessions` | Teacher/admin creates dated session. |
| `POST /api/checkin` | Student submits code during session; server computes mark. |
| `POST /api/attendance` | Teacher/admin correction and audit entry. |

## Technology and maintenance

Frontend source: Next.js 16 App Router, React 19, TypeScript 5, CSS/Tailwind 4 and reusable UI components. `next.config.ts` uses `output: 'export'`. The committed `out/` is its static build. Backend: Node.js ESM Netlify Function with `@netlify/database` tagged parameterized SQL. Database: Netlify-managed Postgres with SQL migrations under `netlify/database/migrations/`. Deployment configuration: `netlify.toml` with empty `build.command`, `publish = "out"`, function directory and API rewrite. Netlify still installs dependencies, bundles functions and applies migrations during deployment; only the user-supplied frontend build command is blank.

To maintain the UI: edit `app/`, run `npm install`, `npm run typecheck` and `npm run build:frontend` on a developer machine, and commit the resulting `out/` along with source changes. To maintain the backend: edit `netlify/functions/api.mjs`, add forward-only migration files for schema changes, and run `npm run check:function`. Validate setup, import, authorization, check-in boundary times, duplicate prevention, corrections, CSV escaping and mobile layout against a Netlify development database before public use. A Netlify plan with Netlify Database support is required.
