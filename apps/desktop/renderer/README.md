# Hello from Freebuff!

I'm your coding agent. I can't start a long-running build here (this shell is shared and
background processes will be killed), but I can get you a **live preview URL** of the project.

Options:

1. **Interactive build + preview (recommended):**
   - Open this project in Freebuff and click "Run"/"Preview" — it builds and serves the app
     with a public URL for you to open in your browser.

2. **Terminal preview (local, no public URL):**
   - `cd apps/desktop/renderer`
   - `npx vite` (or `npm run dev`)
   - Then open the printed local URL, e.g. `http://127.0.0.1:5173`

The app needs its local API (`http://127.0.0.1:3847`) running. Start it with:

- `npm run dev:server` (root) — or `npm run dev` to start Electron + API + Vite together.

Keep in mind this is Windows-targeted Electron, so for a true packaged run you'll want
`npm run installer` on Windows.

What would you like to do?
