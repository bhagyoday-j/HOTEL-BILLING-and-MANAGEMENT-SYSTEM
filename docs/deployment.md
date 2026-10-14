# Deployment

## Build installer

```powershell
npm run installer
```

This runs `npm run build` (compiles `packages/shared`, `apps/server`, the renderer and the Electron
TypeScript) and then electron-builder.

Artifact: `release/HotelBillingSetup.exe` (Windows x64 NSIS)

For a faster unpacked build (no installer) during testing, use `npm run package` →
`release/win-unpacked`.

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

## Production checklist

1. Change all seed passwords and remove development accounts.
2. Configure the hotel profile, GSTIN and tax rates in **Settings**.
3. Configure printers (**Settings** → printing).
4. Enable automatic backups (**Settings** → backup frequency).
5. Verify A4 + thermal print output on the target printer.
6. Run `npm run db:migrate:deploy` against the AppData database path.
7. Smoke-test: menu → create bill → print → backup.

## Offline

Core operations must not require internet. Optional online sync is out of scope for v1.
