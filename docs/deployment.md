# Deployment

## Build installer

```powershell
npm run installer
```

This runs `npm run build` (compiles `packages/shared`, `apps/server`, the renderer and the Electron
TypeScript) and then electron-builder with `--publish never` — a local build never creates a GitHub
release.

Artifact: `release/HotelBillingSetup.exe` (Windows x64 NSIS)

For a faster unpacked build (no installer) during testing, use `npm run package` →
`release/win-unpacked`.

### Packaging notes

`node_modules/.prisma` (the generated Prisma client) and the native addons (`node_modules/argon2`,
Prisma's query engine) are copied into the package and unpacked from the asar with `asarUnpack`.
Without that, the installed app's API process died on startup with
`Cannot find module '.prisma/client/default'`. The `prisma/` extra resource ships migrations and the
schema only — never a local `dev.db`.

### Signing

The build is unsigned. `electron-builder.yml` sets `win.signAndEditExecutable: false`, which lets
packaging run without a certificate and avoids electron-builder's `winCodeSign` tools (their
extraction needs symlink privileges — Windows Developer Mode or an elevated shell). Set
`signAndEditExecutable` to `true` and configure a certificate before shipping a signed build.

## Installer behavior

- Windows x64 NSIS
- `oneClick: false` (user can change the install directory)
- Desktop + Start Menu shortcuts
- Preserves the AppData database/backups/logs on upgrade
- `deleteAppDataOnUninstall: false` — user data is not deleted on uninstall by default
- Creates and migrates `%APPDATA%\Hotel Billing\data\hotel.db` on first launch, then asks for the
  one-time owner account (no database step is needed on the target machine)

## First launch on a target machine

1. Install and start the app. The bundled server applies the migrations to the AppData database.
2. The first-run setup screen asks for the hotel name plus the owner's username and password.
   No default or seed credentials exist in a packaged install.
3. Sign in with that owner account and configure the rest in **Settings**.

If a database is ever provisioned manually instead, `npm run db:migrate:deploy` still works: the
startup runner writes Prisma-compatible rows into `_prisma_migrations`.

## Releases and in-app updates

The installed app checks GitHub Releases through electron-updater (see [Updates](updates.md)).
Releases are built and published only by `.github/workflows/release.yml`, triggered by a version
tag or a manual workflow run of an existing tag:

1. Bump the version in `package.json` and `packages/shared/src/constants.ts`.
2. Commit, tag `vX.Y.Z` (the tag must equal the package version), push the tag.
3. The workflow builds on `windows-latest`, runs tests/typecheck/lint/build and uploads
   `HotelBillingSetup.exe`, its blockmap and `latest.yml` to a **draft** release using the
   workflow's `GITHUB_TOKEN` (`contents: write` only).
4. Smoke-test the draft, then publish it on GitHub. Clients ignore drafts.

Existing installations from before the updater was added need a one-time manual install of the
updater-enabled build; after that, updates are delivered in place and keep AppData untouched.

## Production checklist

1. There are no seed accounts to remove — the owner account is created during first-run setup.
   Rotate the owner password after handing the machine over (**Settings** → Account & password).
2. Configure the hotel profile, GSTIN and tax rates in **Settings**.
3. Configure printers (**Settings** → printing).
4. Enable automatic backups (**Settings** → backup frequency).
5. Verify A4 + thermal print output on the target printer.
6. Smoke-test: create a menu item → create a bill → print → backup.

## Offline

Core operations must not require internet. Optional online sync is out of scope for v1.
