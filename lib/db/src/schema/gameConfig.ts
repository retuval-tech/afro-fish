import { pgTable, serial, text, real } from "drizzle-orm/pg-core";

export const gameConfigTable = pgTable("game_config", {
  id: serial("id").primaryKey(),
  game: text("game").notNull(), // fish-hunter, dragon-king
  tier: text("tier").notNull(), // bronze, silver, gold
  winRate: real("win_rate").notNull().default(70), // percentage 0-100
});

export type GameConfig = typeof gameConfigTable.$inferSelect;
