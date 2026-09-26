# eMB Class Attendance

An online attendance register for teachers, students, and administrators. Students sign in and check in with a teacher-provided class password; the server scores present (100), late (50), absent (0), and teacher-marked escape (50).

## Deploy on Netlify without a build command

1. Import this repository in Netlify. The committed `out/` directory contains the compiled Next.js frontend. `netlify.toml` sets `command = ""` and `publish = "out"`.
2. Netlify processes `netlify/functions/api.mjs` as a serverless function and provisions Netlify Database from the `@netlify/database` dependency. The initial SQL migration in `netlify/database/migrations/` creates the relational tables automatically during deployment.
3. Open the deployed URL and create the first administrator account immediately. Import student CSV files with `student_id,name` headers. Share the generated one-time student credentials privately.

Netlify Database requires an eligible credit-based Netlify plan. The frontend is prebuilt, so a change to files under `app/` requires a developer to run `npm install` and `npm run build:frontend` locally and commit the updated `out/` directory. Netlify itself needs no build command. Functions still undergo Netlify's standard deployment processing; `command = ""` does not disable that.

The previous Cloudflare-hosted app has a separate SQLite/D1 database. This Netlify version starts with an empty Postgres database; existing attendance data is not migrated automatically.

## Code map

- `app/`, `components/`, `lib/`: maintainable Next.js/TypeScript frontend source.
- `out/`: prebuilt static frontend deployed by Netlify.
- `netlify/functions/api.mjs`: role-aware JSON API and server-side attendance rules.
- `netlify/database/migrations/`: versioned Postgres schema.
- `netlify.toml`: empty build command, static publish directory, and `/api/*` routing.
- `SPEC.md`: detailed behavior and data specification.

## Run locally

1. Install Node.js 22.13 or later and Netlify CLI 26 or later (`npm install -g netlify-cli`). A network connection is needed to install dependencies; the app itself is online-only.
2. Download and extract the project ZIP, then open a terminal in the extracted `eMB-Class-Attendance` directory.
3. Run `npm ci` to install the project dependencies.
4. Run `netlify dev` and open the local URL it prints (normally `http://localhost:8888`). Netlify Dev starts a local Postgres-compatible database and serves the frontend and API together. Follow any CLI setup or sign-in prompts.
5. If the app reports missing database tables, run `netlify database migrations apply` in another terminal in the same project directory, then refresh. Run `netlify database status` to inspect migration status.
6. On the first visit, create an administrator account. This local account and attendance data are separate from any deployed site.

Keep `netlify dev` running while using the app. Do not open `out/index.html` directly: browser file URLs cannot run the API or database. Running the app on a phone requires exposing the local server securely on your network; the default local URL is intended for your computer.

## Local maintenance

Run `npm run typecheck`, `npm run build:frontend`, and `npm run check:function` after changing source. Commit updated `out/` when rebuilding the frontend. Do not commit credentials, local database files, or `.env` files.
