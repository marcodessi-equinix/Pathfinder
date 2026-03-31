# Decisions

## 2026-03-31

- Local development is standardized on root npm workspaces.
- Verified local workflow: `npm install` and then `npm run dev` from the repository root.
- Frontend remains the minimal React/Vite client and backend remains the Express/SQLite API.
- Backend reads the root `.env` file so local and container configuration stay aligned.
- Building floor plan templates are sourced from `backend/FR2_Grundriss`.
- Admin users can now upload, rename, and delete building templates directly from the admin panel; room references are updated on rename and cleared on delete.
- Building templates now have a persisted `showOnHome` flag so admins can decide which templates appear on the kiosk start screen.
- The admin area was redesigned as a dedicated dark-mode command-center UI with a premium login screen and stronger dashboard hierarchy.