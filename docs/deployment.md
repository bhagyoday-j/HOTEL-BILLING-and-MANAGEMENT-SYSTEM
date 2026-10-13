# Deployment

## Build installer

```powershell
npm run build
```

`npm run build` builds the renderer and then runs `build:electron`, which compiles the Electron
TypeScript and invokes electron-builder.

Artifact: `release/HotelBillingSetup.exe`

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
