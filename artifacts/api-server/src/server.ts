import { createApp } from "./app";
import { logger } from "./lib/logger";
import { db, isLocalDb, bootstrapSchema, gameConfigTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const DEFAULT_WIN_RATES: { game: string; tier: string; winRate: number }[] = [
  { game: "fish-hunter",  tier: "bronze", winRate: 75 },
  { game: "fish-hunter",  tier: "silver", winRate: 68 },
  { game: "fish-hunter",  tier: "gold",   winRate: 60 },
  { game: "dragon-king",  tier: "bronze", winRate: 72 },
  { game: "dragon-king",  tier: "silver", winRate: 65 },
  { game: "dragon-king",  tier: "gold",   winRate: 58 },
];

async function seedWinRates() {
  for (const cfg of DEFAULT_WIN_RATES) {
    const existing = await db.select().from(gameConfigTable)
      .where(and(eq(gameConfigTable.game, cfg.game), eq(gameConfigTable.tier, cfg.tier)));
    if (existing.length === 0) {
      await db.insert(gameConfigTable).values(cfg);
      logger.info({ game: cfg.game, tier: cfg.tier, winRate: cfg.winRate }, "Seeded default win rate");
    }
  }
}

export interface StartOptions {
  port: number;
  /** When set, the server also serves the SPA from this directory. */
  staticDir?: string;
  /** When true, run `bootstrapSchema()` before seeding. Default: auto (local DB only). */
  bootstrap?: boolean;
  host?: string;
}

/** Boot the API + optional static frontend on the given port.
 *  Resolves once the server is listening. */
export async function startServer(opts: StartOptions): Promise<{ close: () => Promise<void> }> {
  const shouldBootstrap = opts.bootstrap ?? isLocalDb;
  if (shouldBootstrap) {
    logger.info("Bootstrapping local schema");
    await bootstrapSchema();
  }

  await seedWinRates().catch(e => logger.error({ err: e }, "Win rate seeding failed"));

  const app = createApp({ staticDir: opts.staticDir });

  return new Promise((resolve, reject) => {
    const server = app.listen(opts.port, opts.host ?? "0.0.0.0", (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        reject(err);
        return;
      }
      logger.info({ port: opts.port, staticDir: opts.staticDir ?? null }, "Server listening");
      resolve({
        close: () => new Promise<void>((res, rej) => {
          server.close(err => err ? rej(err) : res());
        }),
      });
    });
  });
}
