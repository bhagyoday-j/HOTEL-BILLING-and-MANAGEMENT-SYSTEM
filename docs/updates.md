# In-app updates

The installed Windows app checks GitHub Releases for a newer version, downloads it
in the background, and installs it **only** when the user chooses
**Settings → Application updates → Restart and install**.

## Stack and compatibility

| Piece | Version / setting |
|---|---|
| Electron | 28.3.3 |
| electron-builder | 24.13.3, NSIS x64 (`oneClick: false`) |
| electron-updater | 6.x (`dependencies` in the root `package.json`) |
| Feed | GitHub Releases, public repository `bhagyoday-j/HOTEL-BILLING-and-MANAGEMENT-SYSTEM` |

electron-builder 24 writes `resources/app-update.yml` from the `publish` block in
`electron-builder.yml`, together with `latest.yml` next to the installer. electron-updater
reads that file; `setFeedURL` is deliberately not called.

The NSIS configuration is an **assisted** installer (`oneClick: false`,
`allowToChangeInstallationDirectory: true`). electron-builder's NSIS template handles
`--updated` and reuses the `InstallLocation` recorded in the registry, so updates install
in place. No NSIS, appId, product name or path setting was changed.

### Public repository requirement

Update checks are anonymous. A GitHub token cannot be shipped in the packaged app, so a
private repository would need an authenticated update proxy or a switch to a generic
HTTPS feed. This repository's releases are public, which keeps the client token-free.
If the repository is made private, in-app updates stop working (the app reports an error
and keeps running) until a proxy/feed is provided. **Never embed a GitHub token, private
key or publishing credential in the app.**

## Runtime behaviour

`apps/desktop/electron/updater/updateService.ts` wires `autoUpdater`:

- Enabled only when `app.isPackaged` is true, the platform is Windows and the build is not
  a development build. In development the UI explains that updates run in the installed app.
- `autoDownload = true`: an available update downloads in the background.
- `autoInstallOnAppQuit = false`: closing the app never installs an update silently.
- A startup check is scheduled 5 seconds after bootstrap. It runs on a timer and never
  delays or blocks window creation, API startup or normal use.
- `quitAndInstall(true, true)` is called only from the explicit install action. The local
  API process is stopped and awaited first, then the installer runs silently and relaunches
  the app.
- Network failures, offline machines, no published release and HTTP errors are recorded in
  the status (`error`) and in the log. They never affect billing or other app features.
- The user-facing card lives in **Settings → Application updates** (owner permission
  `SETTINGS_MANAGE`). It shows the installed/available version, checking, download progress,
  downloaded, error and up-to-date states, a manual **Check for updates** button, and
  **Restart and install** once the download has finished. The owner also gets a one-time
  toast when an update is downloaded.
- IPC channels: `updates:status`, `updates:check`, `updates:install`; the main process
  pushes `updates:status` events to open windows.

Diagnostics are written to `%APPDATA%\Hotel Billing\logs\electron.log` with
`"source":"updater"` (versions, phases, error objects). No credentials exist to log.

## Version and release rules

The updater compares `app.getVersion()` (root `package.json`) with `latest.yml`.

1. Bump the version in **both** `package.json` and `packages/shared/src/constants.ts`
   (`APP_VERSION`, used for display).
2. Commit and create a tag `vX.Y.Z` matching that version exactly.
3. Push the tag. `.github/workflows/release.yml` runs on `windows-latest`, installs,
   verifies tag == `package.json`, runs tests/typecheck/lint/build, and publishes with
   `electron-builder --win nsis --x64 --publish always`.
4. The workflow creates a **draft** release using `secrets.GITHUB_TOKEN`
   (`permissions: contents: write` only). No PAT or signing secret is required.
5. Smoke-test the draft installer, then publish the release on GitHub. Clients only see
   **published** releases; drafts are ignored.

A manual **Run workflow** is also supported: it takes an existing tag as input, checks out
that tag and follows the same verification. Ordinary pushes never publish.

Assets uploaded per release: `HotelBillingSetup.exe`, its `.blockmap` (differential
downloads) and `latest.yml`. The artifact name was intentionally left unchanged.

## Local build and checks

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
npm run installer   # builds release/HotelBillingSetup.exe, never publishes
```

`npm run installer` now passes `--publish never`, so a local build cannot create a
GitHub release.

## One-time step for existing installations

Builds shipped before this change have no updater. Each customer must install the
updater-enabled build **once** manually (send them `HotelBillingSetup.exe`). After that:

- the app checks for and downloads future releases automatically;
- the next published version must be **higher** than the version currently installed,
  otherwise there is nothing to install.

Updating in place keeps `%APPDATA%\Hotel Billing` (database, backups, logs, invoices)
untouched, because the installer replaces only the application files and
`deleteAppDataOnUninstall` remains `false`.

## Data and migration safety

- No schema migration was added for this feature.
- The AppData database path is unchanged and the installer does not touch it.
- The local API is stopped and awaited before the installer starts, so files are not
  replaced while the server is running.
- On the next start the bundled server applies any pending migrations from
  `prisma/migrations` (the migrations are shipped as an extra resource).
- Do not copy the database while the API is writing. The existing backup button first
  asks the API to `PRAGMA wal_checkpoint(TRUNCATE)` and then copies the file; the update
  flow itself does not copy or back up the database.

### Residual migration risk

`apps/server/src/utils/migrations.ts` applies each migration file **statement by
statement** and writes the `_prisma_migrations` row only after all statements succeed.
There is no per-migration transaction and no down-migration support. If the process is
killed or the disk fails halfway through a multi-statement migration, the schema can be
partially applied and the retry at the next start may fail on the already-created objects.
Consequences:

- The update mechanism is safe for data (AppData is untouched), but a **schema-changing
  release** carries this pre-existing risk. Take a backup from **Settings → Backups** and
  verify the release on a test installation before publishing it.
- Keep migrations small and forward-only. Fixing the runner to wrap each migration in a
  transaction would be a separate change; do not edit migrations that may already have
  shipped.

## Unsigned installer limitations

`win.signAndEditExecutable: false` is unchanged. Without a certificate:

- Windows SmartScreen may warn on download/first run.
- electron-builder does not write a `publisherName`, so electron-updater 6.x **skips**
  Authenticode verification of the downloaded installer (`verifySignature` returns early).
  Integrity relies on HTTPS to GitHub and the SHA-512 in `latest.yml`.
- electron-updater 6 does not verify a separately signed update manifest; signed
  manifests and mandatory Authenticode checks arrive in electron-builder/electron-updater
  v27+. Anyone who can publish to the release repository can therefore publish an installer
  that clients accept.
- Because the installer is unsigned, SmartScreen or antivirus software can also block the
  installer that the updater launches silently. If the app closes during an update and does not
  reopen on the new version, download the installer from the release page and run it manually;
  AppData and the database are preserved.
- Do not disable checks or switch to a web installer to work around this. When a code
  signing certificate is available, sign the app and keep the same publisher identity.

## Manual end-to-end test (required on a separate Windows test installation)

This cannot be exercised by unit tests, and a real release must not be published just to
test. Use a throwaway fork/test repository, or a separate test tag in this repository that
is later deleted:

1. In the test copy, set `publish.owner`/`publish.repo` to the test repository and build
   with `npm run installer` (unsigned).
2. Install it on a Windows VM, complete setup and create one menu item + one bill.
3. Publish release `v1.0.0` (or the installed version) in the test repo, then bump to
   `v1.0.1`, tag and let the workflow publish it (publish the draft).
4. Start the app, wait for the startup check, open **Settings → Application updates** and
   confirm the available/downloading/downloaded states.
5. Click **Restart and install**, confirm the app closes, installs, reopens and reports the
   new version in the sidebar.
6. Verify the bill, menu item, owner login, settings and backups are still present, and
   that `%APPDATA%\Hotel Billing\data\hotel.db` was not recreated.
7. Test offline behaviour: disconnect the network, click **Check for updates**, confirm the
   error message appears and billing still works.
8. Kill the app while a download is in progress and confirm it starts normally next time
   (the partial download is discarded/re-downloaded).
