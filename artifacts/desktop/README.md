# Afro Fish — Desktop Arcade Installer

A self-contained Electron build of Afro Fish for offline arcade-PC use.
Everything (frontend, API, database) runs on the local machine. Once per day
the app uploads a backup snapshot to the cloud Replit deployment for remote
visibility.

## What gets installed

- The full Afro Fish app (games + admin panel) as a desktop application
- An embedded Postgres database (PGlite, runs in-process, zero install)
- A tiny background uploader that posts a JSON snapshot once a night

After install, users see:

- **Windows**: a Start Menu + Desktop shortcut called "Afro Fish Arcade"
- **macOS**: an app in `/Applications` called "Afro Fish Arcade"

Launching the shortcut opens a full-screen window. No internet is required to
play, log in, take cash in, or pay cash out. Internet is only needed for the
nightly backup upload.

## Where data lives

Player accounts, balances, and game history are stored locally in the OS's
standard user-data folder for the app:

| OS      | Path                                                |
| ------- | --------------------------------------------------- |
| Windows | `%APPDATA%\Afro Fish Arcade\db\`                    |
| macOS   | `~/Library/Application Support/Afro Fish Arcade/db/`|
| Linux   | `~/.config/Afro Fish Arcade/db/`                    |

The same folder also contains `arcade-id.json` (the venue's unique ID + label)
and `backup-state.json` (the last successful/failed upload).

To wipe an arcade PC: quit the app, delete that folder, relaunch — a fresh DB
will be created and seeded.

## Building the installers

The build uses [electron-builder](https://www.electron.build/). Cross-platform
output requires the matching host OS (or Wine for Windows from Linux).

```bash
# from the repo root
pnpm --filter @workspace/desktop run build

# then one of:
pnpm --filter @workspace/desktop run dist:win     # produces release/*.exe
pnpm --filter @workspace/desktop run dist:mac     # produces release/*.dmg  (must run on macOS)
pnpm --filter @workspace/desktop run dist:linux   # produces release/*.AppImage
pnpm --filter @workspace/desktop run dist:dir     # produces an unpacked folder for testing
```

Output lands in `artifacts/desktop/release/`.

### Important build-OS rules

- **`.dmg` (macOS) can only be produced on a Mac.** Apple's signing/notarisation
  tools don't run elsewhere.
- **`.exe` (Windows)** can be produced on Windows directly, or on Linux/Mac if
  Wine is installed.
- The Replit Linux container can produce a `dir` build and `.AppImage` — useful
  for verifying the bundle works, but not what arcade owners will install.

### Code signing / notarisation (optional)

By default the installers are unsigned. On first launch:

- **Windows** shows SmartScreen "Unknown publisher" — click "More info" →
  "Run anyway"
- **macOS** shows "Cannot be opened because the developer cannot be verified" —
  right-click the `.dmg` → Open the first time

To remove these warnings, see `electron-builder.yml` and supply:

- Windows: a code-signing cert via `CSC_LINK` + `CSC_KEY_PASSWORD` env vars
- macOS: an Apple Developer ID + `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`

## Updates

There is no auto-updater. To roll out a new version:

1. Build a new installer locally (or via CI)
2. Email/distribute the new `.exe` / `.dmg` to each arcade
3. Owner runs the new installer — it upgrades in place; data is preserved

## Nightly backups

Every night at **03:00 local time**, the desktop app:

1. Reads every row from the local DB
2. POSTs them as JSON to
   `${AFROFISH_CLOUD_URL}/api/admin/backup/upload?key=<sha256 of admin pin>`
3. On network failure, retries with exponential backoff up to 5 times

Defaults can be overridden by environment variables (set them in the OS
environment before launching, or via a shortcut launcher):

| Variable             | Default                          | Purpose                                  |
| -------------------- | -------------------------------- | ---------------------------------------- |
| `AFROFISH_CLOUD_URL` | `https://afro-fish.replit.app`   | Cloud deployment to send backups to      |
| `ADMIN_PIN`          | `1234`                           | Admin pin (also used to sign the upload) |
| `AFROFISH_WINDOWED`  | unset (full-screen)              | Set to any value to disable full-screen  |

A manual upload is also available from the menu bar: **File → Run backup now**.

## What's in the bundle

```
Afro Fish Arcade.exe / .app
├── (Electron runtime)
└── resources/
    ├── app.asar              — main.cjs + the small set of bundled deps
    ├── app.asar.unpacked/
    │   └── node_modules/
    │       └── @electric-sql/pglite   — WASM Postgres (unpacked so it can load .wasm)
    └── web/                  — the built Vite frontend served by Express
```

Approx. installer size: 150–250 MB (Electron + Node + PGlite WASM + assets).
