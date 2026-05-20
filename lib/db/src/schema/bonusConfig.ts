import { pgTable, serial, integer, real } from "drizzle-orm/pg-core";

export const bonusConfigTable = pgTable("bonus_config", {
  id: serial("id").primaryKey(),
  jackpotPool: integer("jackpot_pool").notNull().default(0),
  firstDepositPct: integer("first_deposit_pct").notNull().default(100),
  reloadPct: integer("reload_pct").notNull().default(100),
  dailyLoginBonus: integer("daily_login_bonus").notNull().default(10),
  sessionMilestoneAmt: integer("session_milestone_amt").notNull().default(25),
  sessionMilestoneEvery: integer("session_milestone_every").notNull().default(200),
  comebackThreshold: integer("comeback_threshold").notNull().default(50),
  comebackAmt: integer("comeback_amt").notNull().default(30),
  miniJackpotOdds: real("mini_jackpot_odds").notNull().default(3),
});

export type BonusConfig = typeof bonusConfigTable.$inferSelect;
