import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

type DB = NodePgDatabase<typeof schema>;

let _db: DB;
let _close: () => Promise<void>;
let _isLocal = false;

if (process.env.LOCAL_DB_PATH) {
  const pglite = new PGlite(process.env.LOCAL_DB_PATH);
  _db = drizzlePglite(pglite, { schema }) as unknown as DB;
  _close = async () => { await pglite.close(); };
  _isLocal = true;
} else {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  _db = drizzlePg(pool, { schema });
  _close = async () => { await pool.end(); };
}

export const db = _db;
export const closeDb = _close;
export const isLocalDb = _isLocal;

export * from "./schema";
export { bootstrapSchema } from "./bootstrap";
