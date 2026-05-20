import { pgTable, serial, boolean } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  withdrawalEnabled: boolean("withdrawal_enabled").notNull().default(true),
});

export type Settings = typeof settingsTable.$inferSelect;
