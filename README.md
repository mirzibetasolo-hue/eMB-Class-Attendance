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

## Local maintenance

Run `npm install`, `npm run typecheck`, `npm run build:frontend`, and `npm run check:function`. Use `netlify dev` with a local Netlify Database for end-to-end API testing. Do not commit credentials, local database files, or `.env` files.
