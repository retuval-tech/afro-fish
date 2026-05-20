/**
 * Afro Fish Desktop — Electron main process.
 *
 * Boots an embedded API + static frontend on a random local port,
 * persists everything to PGlite in the user's data directory, then
 * opens a BrowserWindow against it.
 */
import { app, BrowserWindow, Menu, dialog, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import net from "node:net";

// ── Resolve resource paths (works in both `electron .` dev mode and packaged) ──
const isPackaged = app.isPackaged;
const resourcesRoot = isPackaged
  ? process.resourcesPath
  : path.resolve(__dirname, "..");

const FRONTEND_DIR = path.join(resourcesRoot, "web");
const USER_DATA = app.getPath("userData");
const DB_DIR = path.join(USER_DATA, "db");
const ARCADE_ID_FILE = path.join(USER_DATA, "arcade-id.json");
const BACKUP_STATE_FILE = path.join(USER_DATA, "backup-state.json");

fs.mkdirSync(DB_DIR, { recursive: true });

// ── Configure environment BEFORE importing the server (env-driven) ──
process.env.LOCAL_DB_PATH = DB_DIR;
process.env.NODE_ENV = process.env.NODE_ENV ?? "production";
if (!process.env.ADMIN_PIN) process.env.ADMIN_PIN = "1234";
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
}

// ── Arcade identity (stable UUID + optional human label) ──
interface ArcadeIdentity { id: string; label: string; createdAt: string; }
function loadOrCreateArcadeId(): ArcadeIdentity {
  if (fs.existsSync(ARCADE_ID_FILE)) {
    try { return JSON.parse(fs.readFileSync(ARCADE_ID_FILE, "utf8")); } catch {}
  }
  const id: ArcadeIdentity = {
    id: crypto.randomUUID(),
    label: `Arcade-${Math.floor(Math.random() * 9000 + 1000)}`,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(ARCADE_ID_FILE, JSON.stringify(id, null, 2));
  return id;
}
const arcade = loadOrCreateArcadeId();

// ── Pick a free localhost port ──
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (typeof addr === "object" && addr) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("Could not get free port"));
      }
    });
  });
}

// ── Start embedded server ──
async function bootServer(): Promise<{ port: number; close: () => Promise<void> }> {
  // Import only after env is set — startServer reads LOCAL_DB_PATH.
  const { startServer } = await import("@workspace/api-server/server");
  const port = await getFreePort();
  const { close } = await startServer({
    port,
    host: "127.0.0.1",
    staticDir: FRONTEND_DIR,
    bootstrap: true,
  });
  return { port, close };
}

let serverHandle: { port: number; close: () => Promise<void> } | null = null;
let mainWindow: BrowserWindow | null = null;
let backupTimer: NodeJS.Timeout | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    fullscreen: !process.env.AFROFISH_WINDOWED,
    autoHideMenuBar: true,
    title: "Afro Fish Arcade",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (!serverHandle) throw new Error("Server not started");
  await mainWindow.loadURL(`http://127.0.0.1:${serverHandle.port}/`);
  mainWindow.on("closed", () => { mainWindow = null; });
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Run backup now",
          click: async () => { await runBackup(true); },
        },
        { type: "separator" },
        {
          label: "Show data folder",
          click: () => { shell.openPath(USER_DATA); },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Afro Fish",
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "Afro Fish Arcade",
              message: "Afro Fish Arcade",
              detail: [
                `Version: ${app.getVersion()}`,
                `Arcade ID: ${arcade.id}`,
                `Label: ${arcade.label}`,
                `Data folder: ${USER_DATA}`,
              ].join("\n"),
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Backup logic ──
import { runBackup as _runBackup, scheduleNightlyBackup } from "./backup";

async function runBackup(manual = false): Promise<void> {
  try {
    const result = await _runBackup({
      arcadeId: arcade.id,
      arcadeLabel: arcade.label,
      stateFile: BACKUP_STATE_FILE,
    });
    if (manual) {
      dialog.showMessageBox({
        type: result.ok ? "info" : "warning",
        title: "Backup",
        message: result.ok ? "Backup uploaded successfully" : "Backup failed",
        detail: result.message,
      });
    }
  } catch (err) {
    if (manual) {
      dialog.showErrorBox("Backup failed", String(err));
    }
  }
}

// ── Lifecycle ──
app.whenReady().then(async () => {
  try {
    serverHandle = await bootServer();
    buildMenu();
    await createWindow();
    // Schedule nightly backup
    backupTimer = scheduleNightlyBackup(
      () => runBackup(false),
      { hourLocal: 3, minuteLocal: 0 },
    );
  } catch (err) {
    dialog.showErrorBox(
      "Afro Fish failed to start",
      String((err as Error)?.stack ?? err),
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let isQuitting = false;
app.on("before-quit", async (e) => {
  if (isQuitting) return;
  if (backupTimer) { clearTimeout(backupTimer); backupTimer = null; }
  if (serverHandle) {
    e.preventDefault();
    isQuitting = true;
    try { await serverHandle.close(); } catch {}
    serverHandle = null;
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null && serverHandle) createWindow();
});
