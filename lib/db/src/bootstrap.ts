import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Creates all tables if they don't yet exist.
 *
 * Used for the desktop (PGlite) build, where there is no drizzle-kit push
 * step at install time — the embedded DB must self-initialise on first launch.
 *
 * Safe to run on every startup: every statement uses IF NOT EXISTS.
 * Keep in sync with `lib/db/src/schema/*` whenever the schema changes.
 */
export async function bootstrapSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS players (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      pin_hash text NOT NULL,
      balance numeric(12,2) NOT NULL DEFAULT '0',
      total_won numeric(12,2) NOT NULL DEFAULT '0',
      total_lost numeric(12,2) NOT NULL DEFAULT '0',
      games_played integer NOT NULL DEFAULT 0,
      total_kills integer NOT NULL DEFAULT 0,
      kill_trophies_claimed integer NOT NULL DEFAULT 0,
      last_login_date text,
      first_deposit_done boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id serial PRIMARY KEY,
      player_id integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      token text NOT NULL UNIQUE,
      created_at timestamp NOT NULL DEFAULT now(),
      expires_at timestamp NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id serial PRIMARY KEY,
      player_id integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      type text NOT NULL,
      amount numeric(12,2) NOT NULL,
      note text,
      game text,
      tier text,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS game_sessions (
      id serial PRIMARY KEY,
      player_id integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      game text NOT NULL,
      tier text NOT NULL,
      fish_name text,
      weapon_multiplier integer NOT NULL DEFAULT 1,
      points_won integer NOT NULL DEFAULT 0,
      bet_amount integer NOT NULL DEFAULT 0,
      hit boolean NOT NULL DEFAULT false,
      has_special_aura boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS game_config (
      id serial PRIMARY KEY,
      game text NOT NULL,
      tier text NOT NULL,
      win_rate real NOT NULL DEFAULT 70
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS bonus_config (
      id serial PRIMARY KEY,
      jackpot_pool integer NOT NULL DEFAULT 0,
      first_deposit_pct integer NOT NULL DEFAULT 100,
      reload_pct integer NOT NULL DEFAULT 100,
      daily_login_bonus integer NOT NULL DEFAULT 10,
      session_milestone_amt integer NOT NULL DEFAULT 25,
      session_milestone_every integer NOT NULL DEFAULT 200,
      comeback_threshold integer NOT NULL DEFAULT 50,
      comeback_amt integer NOT NULL DEFAULT 30,
      mini_jackpot_odds real NOT NULL DEFAULT 3
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS settings (
      id serial PRIMARY KEY,
      withdrawal_enabled boolean NOT NULL DEFAULT true
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backups (
      id serial PRIMARY KEY,
      arcade_id text NOT NULL,
      arcade_label text,
      captured_at timestamp NOT NULL,
      uploaded_at timestamp NOT NULL DEFAULT now(),
      player_count integer NOT NULL DEFAULT 0,
      total_credits numeric(14,2) NOT NULL DEFAULT '0',
      total_won numeric(14,2) NOT NULL DEFAULT '0',
      tx_count integer NOT NULL DEFAULT 0,
      payload jsonb NOT NULL
    );
  `);
}
