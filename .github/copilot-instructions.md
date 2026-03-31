# Project Guidelines

## Workflow
- This is an existing app. Inspect current structure and keep changes small.
- Preserve the current minimal UI and interaction patterns unless a redesign is explicitly requested.
- Prefer root-level commands for local development: `npm install` and `npm run dev`.
- Verify meaningful changes with targeted checks instead of broad rewrites.

## Project Facts
- Root `package.json` uses npm workspaces for `backend` and `frontend`.
- Frontend dev server runs on port 5173 and proxies `/api`, `/uploads`, and `/building-templates` to `http://localhost:3000`.
- Backend loads environment variables from the root `.env` file and runs on port 3000 by default.
- Backend uses SQLite, uploads, and building templates from the `backend` folder.

## Change Quality
- Fix root causes when practical; avoid cosmetic refactors.
- Keep documentation current when workflow or architecture changes.
- For larger changes, add a short note to `docs/decisions.md` or `docs/known-issues.md`.