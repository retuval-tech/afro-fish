import { pgTable, serial, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  totalWon: numeric("total_won", { precision: 12, scale: 2 }).notNull().default("0"),
  totalLost: numeric("total_lost", { precision: 12, scale: 2 }).notNull().default("0"),
  gamesPlayed: integer("games_played").notNull().default(0),
  totalKills: integer("total_kills").notNull().default(0),
  killTrophiesClaimed: integer("kill_trophies_claimed").notNull().default(0),
  lastLoginDate: text("last_login_date"),
  firstDepositDone: boolean("first_deposit_done").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
