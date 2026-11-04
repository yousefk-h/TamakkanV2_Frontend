# Tamakkan unified local baseline (frontend)

Branch `dev/tamakkan-unified`: Docker image isolation + H1 BFF refresh fix, plus `npm run build:standalone`.
Local only; not pushed, not merged into `main`.

Run the whole local environment (MongoDB + API + this web app) from the backend worktree:
`worktrees\backend-unified\docs\LOCAL_DEVELOPMENT.md`  (one command: `tamakkan start`, `tamakkan stop`).

Notes
- `npm run build` (OpenAI Sites wrapper) exits 66 by design - it also demands `dist/.openai/hosting.json`, a hosting
  target Tamakkan doesn't use. The Dockerfile and `npm run build:standalone` call `vinext build` directly (exit 0).
- The local web app is a Vite dev server started by the script with `API_BASE_URL` pinned to the local API.
- Not committed on purpose: `app/dev/mariam-v2-test/` (temporary test page, untracked in the original checkout).
