# Publishing checklist — DuckBridge Desktop

This file is the GitHub release runbook. Fill the TODOs, then publish.

## Prerequisites (what you need to give me)
- [ ] GitHub repository URL (owner/repo) — e.g. `github.com/OWNER/duckbridge`
- [ ] Your GitHub username for HTTPS `git remote -v` / `gh` auth
- [ ] Confirm you want both Windows installers (NSIS .exe + MSI) and Linux (AppImage + .deb) — already in `tauri.conf.json`

## One-time setup (do these first, copy/paste)
1. Create the repo on github.com (Public), name it e.g. `duckbridge`. Do NOT add README yet, we will push ours.
2. From this folder:
   ```bat
   git remote add origin https://github.com/OWNER/duckbridge.git
   git branch -M main
   git push -u origin main
   ```
3. In GitHub repo: Settings -> Secrets and variables -> Actions -> New secret:
   - `TAURI_SIGNING_PRIVATE_KEY` = contents of `.tauri_keys.txt` (NOT committed, keep secret!)
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = `test123` (the password I used to generate this pair; you can rotate it later)
4. In `src-tauri/tauri.conf.json`, replace `OWNER` in the updater endpoint with your owner/repo:
   ```json
   "endpoints": ["https://github.com/OWNER/duckbridge/releases/latest/download/latest.json"]
   ```
   Commit + push that change.

## Every release
1. Bump version in `package.json` + `src-tauri/tauri.conf.json` (keep them equal, e.g. 0.1.0 -> 0.1.1).
2. Commit: `git commit -am "release: v0.1.1"` (or version)
3. Build locally to verify:
   ```bat
   npm install
   npm --prefix server install
   npm run tauri build
   ```
   Look in `src-tauri/target/release/bundle/` for installers.
4. Create a GitHub Release from the tag `v0.1.1` and upload the installers + signatures.
   The Tauri CI (see below) will generate `latest.json` automatically if you use the bundle targets.
   If building manually, run:
   ```bat
   npx tauri signer sign "src-tauri/target/release/bundle/msi/*.msi" --password <your password>
   ```
   and place the `.sig` files + `latest.json` into the release assets.

## What auto-update needs (behavior)
- App launches -> updater plugin (if `autoUpdate: true` in settings, enabled by default) fetches `latest.json`.
- If a newer version is found -> dialog -> app closes (sidecar stopped) -> installer runs silently -> app restarts with new version.
- If no update -> app continues.
- If GitHub is unreachable -> app continues offline (no hard fail).

## Secrets file (DO NOT commit)
- Keep `.tauri_keys.txt` (private) and `.tauri_keys.txt.pub` out of git — already in `.gitignore`.
- The public key is already embedded in `tauri.conf.json` as `pubkey`, safe to ship.

## After publish
Tell me "push to GitHub" and I will:
- run `git push -u origin main`
- create the release tag + upload assets
- verify `latest.json` resolves at the endpoint URL

## Local context (do not move)
- Dev server runs locally on `http://127.0.0.1:8765` (settings: host/port editable, default 8765).
- Node solver (jsdom) must be installed with `npm --prefix server install` before `npm run tauri dev`, otherwise chat fails with `Cannot find module 'jsdom'`.
- Admin token / API keys: with `Require API key` OFF the server is open (any token works). With it ON, chat needs a real key from the Keys tab and `/api-keys` needs the Admin token from Settings.
