# Known Issues

## Dependency Warnings

- `npm install` currently shows some transitive deprecation warnings such as `inflight`, `glob`, `rimraf`, `fstream`, and `lodash.isequal`.
- These warnings come from nested dependencies, not from direct packages pinned in the root workspace.
- Current local install still completes successfully and `npm run dev` starts frontend and backend correctly.

## Local Runtime Notes

- Node.js 24 or newer is required because the backend uses `node:sqlite`.
- A quick backend verification endpoint is available at `/api/health`.