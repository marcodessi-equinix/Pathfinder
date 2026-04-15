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
- Container deployments now use explicit storage paths, a backend healthcheck, and a seeded volume for building templates so fresh VM installs behave closer to local development.

## 2026-04-14

- Kiosk search now supports masked alphanumeric destination codes with a manual search action and a temporary lockout after repeated failed attempts.
- The public kiosk route is now tuned for iPad landscape use with a native keyboard-first search flow, stronger map-first result layout, and a portrait rotation prompt.
- Kiosk feedback was reduced to icon-only rating input, and image viewing now supports centered zoom and full-screen mode with reset behavior.
- Admin console now supports bulk deletion for rooms, templates, and images, explicit deletion of feedback and search analytics, and full-screen image/template viewing.
- IBX separation is now prepared structurally through admin-visible configuration, without enabling full multi-database switching yet.
- The admin login is now isolated into Tailwind-based split-screen components while continuing to use the existing admin theme tokens for dark and light mode.

## 2026-04-15

- The admin area now uses semantic dark and light theme tokens for app backgrounds, panels, text, borders, buttons, inputs, tables, modals and charts so both themes keep intentional contrast instead of relying on scattered one-off colors.
- Kiosk results now use a map-first layout on iPad so the route plan dominates the screen, while feedback was reduced to a three-option scale that is normalized consistently across kiosk, admin tables, charts, and exports.
- Kiosk clients now subscribe to backend content change events so admin updates to rooms, templates, images, and quick links appear on the live iPad view without a manual reload.