# Deployment

## Build installer

```bash
npm run installer
```

Artifact: `release/HotelBillingSetup.exe`

## Installer behavior

- Windows x64 NSIS
- Desktop + Start Menu shortcuts
- Preserves AppData database/backups/logs on upgrade
- Does not delete user data on uninstall by default

## Production checklist

1. Change all seed passwords
2. Configure hotel GSTIN / tax rates
3. Configure printers
4. Enable automatic backups
5. Verify A4 + thermal print templates
6. Run `prisma migrate deploy` against AppData DB path
7. Smoke-test check-in → POS → checkout → invoice → backup

## Offline

Core operations must not require internet. Optional online sync is out of scope for v1.
