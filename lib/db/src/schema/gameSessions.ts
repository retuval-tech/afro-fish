import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const gameSessionsTable = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  game: text("game").notNull(), // fish-hunter, dragon-king
  tier: text("tier").notNull(), // bronze, silver, gold
  fishName: text("fish_name"),
  weaponMultiplier: integer("weapon_multiplier").notNull().default(1),
  pointsWon: integer("points_won").notNull().default(0),
  betAmount: integer("bet_amount").notNull().default(0),
  hit: boolean("hit").notNull().default(false),
  hasSpecialAura: boolean("has_special_aura").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GameSession = typeof gameSessionsTable.$inferSelect;
