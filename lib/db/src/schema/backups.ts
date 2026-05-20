import { pgTable, serial, text, integer, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Snapshot uploads from desktop arcade installations.
 * Stored on the cloud DB; populated by nightly POST from each arcade PC.
 */
export const backupsTable = pgTable("backups", {
  id: serial("id").primaryKey(),
  arcadeId: text("arcade_id").notNull(),
  arcadeLabel: text("arcade_label"),
  capturedAt: timestamp("captured_at").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  playerCount: integer("player_count").notNull().default(0),
  totalCredits: numeric("total_credits", { precision: 14, scale: 2 }).notNull().default("0"),
  totalWon: numeric("total_won", { precision: 14, scale: 2 }).notNull().default("0"),
  txCount: integer("tx_count").notNull().default(0),
  payload: jsonb("payload").notNull(),
});

export type Backup = typeof backupsTable.$inferSelect;
