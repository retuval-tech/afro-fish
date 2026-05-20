import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // credit_in, credit_out, game_win, game_loss
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  game: text("game"),
  tier: text("tier"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;
