/**
 * Nightly backup uploader.
 *
 * Exports the full local DB as JSON, posts to the cloud Replit deployment's
 * `/api/admin/backup/upload` endpoint. Retries on network failure.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const CLOUD_BASE_URL =
  process.env.AFROFISH_CLOUD_URL ?? "https://afro-fish.replit.app";
const ADMIN_PIN = process.env.ADMIN_PIN ?? "1234";

function adminKey(): string {
  return crypto.createHash("sha256")
    .update(`${ADMIN_PIN}afrofish_admin`)
    .digest("hex");
}

interface BackupArgs {
  arcadeId: string;
  arcadeLabel: string;
  stateFile: string;
}

interface BackupState {
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  attempts: number;
}

function loadState(file: string): BackupState {
  if (!fs.existsSync(file)) return { attempts: 0 };
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { attempts: 0 }; }
}

function saveState(file: string, s: BackupState) {
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
}

async function dumpAllTables() {
  const { db, playersTable, sessionsTable, transactionsTable,
          gameSessionsTable, gameConfigTable, bonusConfigTable, settingsTable } =
    await import("@workspace/db");

  const [players, sessions, transactions, gameSessions, gameConfig, bonusConfig, settings] =
    await Promise.all([
      db.select().from(playersTable),
      db.select().from(sessionsTable),
      db.select().from(transactionsTable),
      db.select().from(gameSessionsTable),
      db.select().from(gameConfigTable),
      db.select().from(bonusConfigTable),
      db.select().from(settingsTable),
    ]);

  // Summary stats
  const totalCredits = players.reduce((s, p) => s + Number(p.balance), 0).toFixed(2);
  const totalWon = players.reduce((s, p) => s + Number(p.totalWon), 0).toFixed(2);

  return {
    summary: {
      playerCount: players.length,
      totalCredits,
      totalWon,
      txCount: transactions.length,
    },
    tables: { players, sessions, transactions, gameSessions, gameConfig, bonusConfig, settings },
  };
}

export async function runBackup(args: BackupArgs): Promise<{ ok: boolean; message: string }> {
  const state = loadState(args.stateFile);
  state.attempts += 1;

  let dump;
  try {
    dump = await dumpAllTables();
  } catch (err) {
    state.lastErrorAt = new Date().toISOString();
    state.lastError = `dump: ${String(err)}`;
    saveState(args.stateFile, state);
    return { ok: false, message: `Failed to read local DB: ${err}` };
  }

  const body = {
    arcadeId: args.arcadeId,
    arcadeLabel: args.arcadeLabel,
    capturedAt: new Date().toISOString(),
    summary: dump.summary,
    payload: dump.tables,
  };

  const url = `${CLOUD_BASE_URL.replace(/\/$/, "")}/api/admin/backup/upload?key=${adminKey()}`;

  let attempt = 0;
  const maxAttempts = 5;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        state.lastSuccessAt = new Date().toISOString();
        state.lastError = undefined;
        state.lastErrorAt = undefined;
        saveState(args.stateFile, state);
        return { ok: true, message: `Uploaded (${dump.summary.playerCount} players, ${dump.summary.txCount} transactions).` };
      }
      const text = await res.text();
      state.lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    } catch (err) {
      state.lastError = `network: ${String(err).slice(0, 200)}`;
    }
    // Exponential backoff: 2s, 4s, 8s, 16s
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  state.lastErrorAt = new Date().toISOString();
  saveState(args.stateFile, state);
  return { ok: false, message: state.lastError ?? "unknown error" };
}

/** Schedule a recurring nightly call. Returns a handle that can be cleared. */
export function scheduleNightlyBackup(
  fn: () => Promise<void> | void,
  opts: { hourLocal: number; minuteLocal: number },
): NodeJS.Timeout {
  function msUntilNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(opts.hourLocal, opts.minuteLocal, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }
  let handle: NodeJS.Timeout;
  function tick() {
    Promise.resolve(fn()).catch(() => {});
    handle = setTimeout(tick, msUntilNext());
  }
  handle = setTimeout(tick, msUntilNext());
  return handle;
}
