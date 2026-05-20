import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  transactionsTable,
  gameConfigTable,
  bonusConfigTable,
  settingsTable,
  sessionsTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import crypto from "crypto";
import {
  AdminLoginBody,
  GetAdminPlayersQueryParams,
  CreatePlayerQueryParams,
  CreatePlayerBody,
  DeletePlayerQueryParams,
  ResetPlayerPinQueryParams,
  ResetPlayerPinBody,
  ReloadPlayerCreditsQueryParams,
  ReloadPlayerCreditsBody,
  CashoutPlayerQueryParams,
  CashoutPlayerBody,
  GetAdminTransactionsQueryParams,
  GetAdminStatsQueryParams,
  GetGameConfigQueryParams,
  UpdateGameConfigQueryParams,
  UpdateGameConfigBody,
  RescuePlayerQueryParams,
  GetBonusConfigQueryParams,
  UpdateBonusConfigQueryParams,
  UpdateBonusConfigBody,
} from "@workspace/api-zod";

const router = Router();

const ADMIN_PIN = process.env.ADMIN_PIN ?? "1234";
const ADMIN_KEY = crypto.createHash("sha256").update(ADMIN_PIN + "afrofish_admin").digest("hex");

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin + "afrofish_salt").digest("hex");
}

function isAdmin(adminKey: string): boolean {
  return adminKey === ADMIN_KEY;
}

function serializePlayer(p: typeof playersTable.$inferSelect, overrideBalance?: number) {
  return {
    id: p.id,
    name: p.name,
    balance: overrideBalance ?? Number(p.balance),
    totalWon: Number(p.totalWon),
    totalLost: Number(p.totalLost),
    gamesPlayed: p.gamesPlayed,
    totalKills: p.totalKills,
    killTrophiesClaimed: p.killTrophiesClaimed,
    lastLoginDate: p.lastLoginDate ?? null,
    firstDepositDone: p.firstDepositDone,
    createdAt: p.createdAt.toISOString(),
  };
}

async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const inserted = await db.insert(settingsTable).values({}).returning();
  return inserted[0];
}

async function getOrCreateBonusConfig() {
  const configs = await db.select().from(bonusConfigTable).limit(1);
  if (configs.length > 0) return configs[0];
  const inserted = await db.insert(bonusConfigTable).values({}).returning();
  return inserted[0];
}

function serializeBonusConfig(c: typeof bonusConfigTable.$inferSelect) {
  return {
    jackpotPool: c.jackpotPool,
    firstDepositPct: c.firstDepositPct,
    reloadPct: c.reloadPct,
    dailyLoginBonus: c.dailyLoginBonus,
    sessionMilestoneAmt: c.sessionMilestoneAmt,
    sessionMilestoneEvery: c.sessionMilestoneEvery,
    comebackThreshold: c.comebackThreshold,
    comebackAmt: c.comebackAmt,
    miniJackpotOdds: c.miniJackpotOdds,
  };
}

// POST /api/admin/login
router.post("/admin/login", async (req, res) => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (parsed.data.pin !== ADMIN_PIN) {
    res.status(401).json({ error: "Invalid admin PIN" });
    return;
  }
  res.json({ adminKey: ADMIN_KEY });
});

// GET /api/admin/players
router.get("/admin/players", async (req, res) => {
  const parsed = GetAdminPlayersQueryParams.safeParse(req.query);
  if (!parsed.success || !isAdmin(parsed.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const players = await db.select().from(playersTable).orderBy(desc(playersTable.createdAt));
  res.json(players.map(p => serializePlayer(p)));
});

// POST /api/admin/players — create player
router.post("/admin/players", async (req, res) => {
  const parsedQ = CreatePlayerQueryParams.safeParse(req.query);
  if (!parsedQ.success || !isAdmin(parsedQ.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsedB = CreatePlayerBody.safeParse(req.body);
  if (!parsedB.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { name, pin, initialCredits } = parsedB.data;
  const pinHash = hashPin(pin);

  const existing = await db.select().from(playersTable).where(eq(playersTable.name, name));
  if (existing.length > 0) {
    res.status(409).json({ error: "Player name already taken" });
    return;
  }

  const inserted = await db.insert(playersTable).values({
    name, pinHash, balance: (initialCredits ?? 0).toFixed(2),
  }).returning();

  const player = inserted[0];

  if (initialCredits && initialCredits > 0) {
    await db.insert(transactionsTable).values({
      playerId: player.id, type: "credit_in", amount: initialCredits.toFixed(2),
      note: "Initial credits on account creation",
    });
  }

  res.status(201).json(serializePlayer(player));
});

// POST /api/admin/reset-pin
router.post("/admin/reset-pin", async (req, res) => {
  const parsedQ = ResetPlayerPinQueryParams.safeParse(req.query);
  if (!parsedQ.success || !isAdmin(parsedQ.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsedB = ResetPlayerPinBody.safeParse(req.body);
  if (!parsedB.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { playerId } = parsedQ.data;
  const { newPin } = parsedB.data;

  if (!/^\d{4}$/.test(newPin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const players = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (players.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const player = players[0];
  await db.update(playersTable).set({ pinHash: hashPin(newPin) }).where(eq(playersTable.id, playerId));

  res.json(serializePlayer(player));
});

// POST /api/admin/delete-player
router.post("/admin/delete-player", async (req, res) => {
  const parsed = DeletePlayerQueryParams.safeParse(req.query);
  if (!parsed.success || !isAdmin(parsed.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await db.delete(playersTable).where(eq(playersTable.id, parsed.data.playerId));
  res.json({ success: true });
});

// POST /api/admin/reload-credits — with first deposit + reload bonus
router.post("/admin/reload-credits", async (req, res) => {
  const parsedQ = ReloadPlayerCreditsQueryParams.safeParse(req.query);
  if (!parsedQ.success || !isAdmin(parsedQ.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsedB = ReloadPlayerCreditsBody.safeParse(req.body);
  if (!parsedB.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { amount, note } = parsedB.data;
  const { playerId } = parsedQ.data;

  const players = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (players.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const player = players[0];
  const bonusConfig = await getOrCreateBonusConfig();

  // Determine bonus type
  let bonusApplied = 0;
  let bonusType = "none";
  if (!player.firstDepositDone && bonusConfig.firstDepositPct > 0) {
    bonusApplied = Math.floor(amount * bonusConfig.firstDepositPct / 100);
    bonusType = `First Deposit +${bonusConfig.firstDepositPct}%`;
  } else if (player.firstDepositDone && bonusConfig.reloadPct > 0) {
    bonusApplied = Math.floor(amount * bonusConfig.reloadPct / 100);
    bonusType = `Reload +${bonusConfig.reloadPct}%`;
  }

  const newBalance = Number(player.balance) + amount + bonusApplied;

  await db.update(playersTable).set({
    balance: newBalance.toFixed(2),
    firstDepositDone: true,
  }).where(eq(playersTable.id, playerId));

  await db.insert(transactionsTable).values({
    playerId, type: "credit_in", amount: amount.toFixed(2),
    note: note ?? "Credit reload (cash in)",
  });

  if (bonusApplied > 0) {
    await db.insert(transactionsTable).values({
      playerId, type: "bonus", amount: bonusApplied.toFixed(2),
      note: bonusType,
    });
  }

  const updatedPlayer = { ...player, balance: newBalance.toFixed(2), firstDepositDone: true };
  res.json({
    player: serializePlayer(updatedPlayer as typeof player, newBalance),
    bonusApplied,
    bonusType,
  });
});

// POST /api/admin/cashout
router.post("/admin/cashout", async (req, res) => {
  const parsedQ = CashoutPlayerQueryParams.safeParse(req.query);
  if (!parsedQ.success || !isAdmin(parsedQ.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsedB = CashoutPlayerBody.safeParse(req.body);
  if (!parsedB.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { amount, note } = parsedB.data;
  const { playerId } = parsedQ.data;

  // Check withdrawal toggle
  const settings = await getOrCreateSettings();
  if (!settings.withdrawalEnabled) {
    res.status(403).json({ error: "Withdrawals are currently disabled" });
    return;
  }

  const players = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (players.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const player = players[0];
  if (Number(player.balance) < amount) {
    res.status(400).json({ error: "Insufficient balance for cashout" });
    return;
  }

  const newBalance = Number(player.balance) - amount;
  await db.update(playersTable).set({ balance: newBalance.toFixed(2) }).where(eq(playersTable.id, playerId));

  await db.insert(transactionsTable).values({
    playerId, type: "credit_out", amount: amount.toFixed(2),
    note: note ?? "Cash out",
  });

  res.json(serializePlayer(player, newBalance));
});

// POST /api/admin/rescue — comeback credits
router.post("/admin/rescue", async (req, res) => {
  const parsed = RescuePlayerQueryParams.safeParse(req.query);
  if (!parsed.success || !isAdmin(parsed.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const players = await db.select().from(playersTable).where(eq(playersTable.id, parsed.data.playerId));
  if (players.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const player = players[0];
  const bonusConfig = await getOrCreateBonusConfig();
  const threshold = bonusConfig.comebackThreshold;
  const amount = bonusConfig.comebackAmt;

  if (Number(player.balance) >= threshold) {
    res.status(400).json({
      error: `Balance ${Number(player.balance)} is above comeback threshold ${threshold}`,
    });
    return;
  }

  const newBalance = Number(player.balance) + amount;
  await db.update(playersTable).set({ balance: newBalance.toFixed(2) }).where(eq(playersTable.id, player.id));

  await db.insert(transactionsTable).values({
    playerId: player.id, type: "bonus", amount: amount.toFixed(2),
    note: "Comeback Credits rescue",
  });

  res.json(serializePlayer(player, newBalance));
});

// GET /api/admin/transactions
router.get("/admin/transactions", async (req, res) => {
  const parsed = GetAdminTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success || !isAdmin(parsed.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { limit, playerId } = parsed.data;

  const txns = await db.select({
    id: transactionsTable.id,
    playerId: transactionsTable.playerId,
    type: transactionsTable.type,
    amount: transactionsTable.amount,
    note: transactionsTable.note,
    game: transactionsTable.game,
    tier: transactionsTable.tier,
    createdAt: transactionsTable.createdAt,
    playerName: playersTable.name,
  })
    .from(transactionsTable)
    .leftJoin(playersTable, eq(transactionsTable.playerId, playersTable.id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit ?? 50);

  res.json(txns.map(t => ({
    id: t.id, playerId: t.playerId, playerName: t.playerName ?? "Unknown",
    type: t.type, amount: Number(t.amount), note: t.note,
    game: t.game, tier: t.tier, createdAt: t.createdAt.toISOString(),
  })));
});

// GET /api/admin/stats
router.get("/admin/stats", async (req, res) => {
  const parsed = GetAdminStatsQueryParams.safeParse(req.query);
  if (!parsed.success || !isAdmin(parsed.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const players = await db.select().from(playersTable);
  const totalPlayers = players.length;
  const totalCreditsInCirculation = players.reduce((sum, p) => sum + Number(p.balance), 0);

  const txns = await db.select().from(transactionsTable);
  const totalCashIn = txns.filter(t => t.type === "credit_in").reduce((s, t) => s + Number(t.amount), 0);
  const totalCashOut = txns.filter(t => t.type === "credit_out").reduce((s, t) => s + Number(t.amount), 0);
  const totalGameWins = txns.filter(t => t.type === "game_win").reduce((s, t) => s + Number(t.amount), 0);
  const totalGameLosses = txns.filter(t => t.type === "game_loss").reduce((s, t) => s + Number(t.amount), 0);
  const houseProfit = totalGameLosses - totalGameWins;
  const activePlayers = players.filter(p => Number(p.balance) > 0).length;

  // Multiplayer metrics — derived from transactions tagged game="multiplayer"
  const mpWins = txns.filter(t => t.type === "game_win" && t.game === "multiplayer");
  const mpLosses = txns.filter(t => t.type === "game_loss" && t.game === "multiplayer");
  const multiplayerPayouts = mpWins.reduce((s, t) => s + Number(t.amount), 0);
  const multiplayerBets = mpLosses.reduce((s, t) => s + Number(t.amount), 0);
  // A "session" = one boss-kill event (each boss kill produces one win tx per player)
  // Count distinct boss-battle rounds: group win transactions by createdAt minute
  const mpWinTimes = mpWins.map(t => Math.floor(t.createdAt.getTime() / 30000));
  const multiplayerSessions = new Set(mpWinTimes).size;
  const mpPlayerIds = new Set([...mpWins.map(t => t.playerId), ...mpLosses.map(t => t.playerId)]);
  const multiplayerPlayers = mpPlayerIds.size;

  res.json({
    totalPlayers, totalCreditsInCirculation, totalCashIn, totalCashOut,
    totalGameWins, totalGameLosses, activePlayers, houseProfit,
    multiplayerSessions, multiplayerPlayers, multiplayerBets, multiplayerPayouts,
  });
});

// GET /api/admin/game-config
router.get("/admin/game-config", async (req, res) => {
  const parsed = GetGameConfigQueryParams.safeParse(req.query);
  if (!parsed.success || !isAdmin(parsed.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const configs = await db.select().from(gameConfigTable);
  res.json({ configs });
});

// POST /api/admin/set-game-config
router.post("/admin/set-game-config", async (req, res) => {
  const parsedQ = UpdateGameConfigQueryParams.safeParse(req.query);
  if (!parsedQ.success || !isAdmin(parsedQ.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsedB = UpdateGameConfigBody.safeParse(req.body);
  if (!parsedB.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { game, tier } = parsedQ.data;
  const { winRate } = parsedB.data;

  const existing = await db.select().from(gameConfigTable)
    .where(and(eq(gameConfigTable.game, game), eq(gameConfigTable.tier, tier)));

  if (existing.length > 0) {
    await db.update(gameConfigTable).set({ winRate }).where(eq(gameConfigTable.id, existing[0].id));
    res.json({ id: existing[0].id, game, tier, winRate });
  } else {
    const inserted = await db.insert(gameConfigTable).values({ game, tier, winRate }).returning();
    res.json(inserted[0]);
  }
});

// GET /api/admin/bonus-config
router.get("/admin/bonus-config", async (req, res) => {
  const parsed = GetBonusConfigQueryParams.safeParse(req.query);
  if (!parsed.success || !isAdmin(parsed.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const config = await getOrCreateBonusConfig();
  res.json(serializeBonusConfig(config));
});

// POST /api/admin/bonus-config
router.post("/admin/bonus-config", async (req, res) => {
  const parsedQ = UpdateBonusConfigQueryParams.safeParse(req.query);
  if (!parsedQ.success || !isAdmin(parsedQ.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsedB = UpdateBonusConfigBody.safeParse(req.body);
  if (!parsedB.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const existing = await getOrCreateBonusConfig();
  const updates: Partial<typeof bonusConfigTable.$inferInsert> = {};
  const b = parsedB.data;
  if (b.firstDepositPct !== undefined) updates.firstDepositPct = b.firstDepositPct;
  if (b.reloadPct !== undefined) updates.reloadPct = b.reloadPct;
  if (b.dailyLoginBonus !== undefined) updates.dailyLoginBonus = b.dailyLoginBonus;
  if (b.sessionMilestoneAmt !== undefined) updates.sessionMilestoneAmt = b.sessionMilestoneAmt;
  if (b.sessionMilestoneEvery !== undefined) updates.sessionMilestoneEvery = b.sessionMilestoneEvery;
  if (b.comebackThreshold !== undefined) updates.comebackThreshold = b.comebackThreshold;
  if (b.comebackAmt !== undefined) updates.comebackAmt = b.comebackAmt;
  if (b.miniJackpotOdds !== undefined) updates.miniJackpotOdds = b.miniJackpotOdds;

  await db.update(bonusConfigTable).set(updates).where(eq(bonusConfigTable.id, existing.id));

  const updated = await db.select().from(bonusConfigTable).where(eq(bonusConfigTable.id, existing.id));
  res.json(serializeBonusConfig(updated[0]));
});

// GET /api/admin/analytics
router.get("/admin/analytics", async (req, res) => {
  const parsedQ = GetAdminStatsQueryParams.safeParse(req.query);
  if (!parsedQ.success || !isAdmin(parsedQ.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const now = new Date();
  const windowDays = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? 30)) || 30));
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [allSessions, allTxns, allPlayers] = await Promise.all([
    db.select().from(sessionsTable),
    db.select().from(transactionsTable),
    db.select().from(playersTable),
  ]);

  const winSessions = allSessions.filter(s => s.createdAt >= windowStart);
  const winTxns     = allTxns.filter(t => t.createdAt >= windowStart);
  const winPlayers  = allPlayers.filter(p => p.createdAt >= windowStart);

  // ── Daily buckets for the window ──
  const buckets: Record<string, { logins: number; newPlayers: number; gamePlays: number; cashIn: number; cashOut: number }> = {};
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    buckets[d.toISOString().slice(0, 10)] = { logins: 0, newPlayers: 0, gamePlays: 0, cashIn: 0, cashOut: 0 };
  }
  winSessions.forEach(s => { const k = s.createdAt.toISOString().slice(0, 10); if (buckets[k]) buckets[k].logins++; });
  winPlayers.forEach(p  => { const k = p.createdAt.toISOString().slice(0, 10);  if (buckets[k]) buckets[k].newPlayers++; });
  winTxns.forEach(t => {
    const k = t.createdAt.toISOString().slice(0, 10); if (!buckets[k]) return;
    if (t.type === "game_loss") buckets[k].gamePlays++;
    if (t.type === "credit_in") buckets[k].cashIn += Number(t.amount);
    if (t.type === "credit_out") buckets[k].cashOut += Number(t.amount);
  });
  const dailyTraffic = Object.entries(buckets).map(([date, v]) => ({ date, ...v }));

  // ── Hourly activity — within the window ──
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  winSessions.forEach(s => { hours[s.createdAt.getHours()].count++; });

  // ── Game breakdown (window) ──
  const gameMap: Record<string, { plays: number; bets: number; wins: number }> = {
    "fish-hunter": { plays: 0, bets: 0, wins: 0 },
    "dragon-king":  { plays: 0, bets: 0, wins: 0 },
    "multiplayer":  { plays: 0, bets: 0, wins: 0 },
  };
  winTxns.forEach(t => {
    if (!t.game || !(t.game in gameMap)) return;
    if (t.type === "game_loss") { gameMap[t.game].plays++; gameMap[t.game].bets += Number(t.amount); }
    if (t.type === "game_win")  { gameMap[t.game].wins += Number(t.amount); }
  });
  const gameBreakdown = Object.entries(gameMap).map(([game, v]) => ({
    game, plays: v.plays, bets: v.bets, wins: v.wins,
    winRate: v.bets > 0 ? parseFloat(((v.wins / v.bets) * 100).toFixed(1)) : 0,
  }));

  // ── Tier breakdown (window) ──
  const tierMap: Record<string, { plays: number; bets: number }> = {
    bronze: { plays: 0, bets: 0 }, silver: { plays: 0, bets: 0 }, gold: { plays: 0, bets: 0 },
  };
  winTxns.forEach(t => {
    if (!t.tier || !(t.tier in tierMap) || t.type !== "game_loss") return;
    tierMap[t.tier].plays++; tierMap[t.tier].bets += Number(t.amount);
  });
  const tierBreakdown = Object.entries(tierMap).map(([tier, v]) => ({ tier, ...v }));

  // ── Aggregates ──
  const peakHour       = hours.reduce((best, h) => h.count > hours[best].count ? h.hour : best, 0);
  const totalLogins30d = winSessions.length;
  const avgDailyLogins = parseFloat((totalLogins30d / windowDays).toFixed(1));
  const totalPlays30d  = winTxns.filter(t => t.type === "game_loss").length;
  const totalCashIn    = winTxns.filter(t => t.type === "credit_in").reduce((s, t) => s + Number(t.amount), 0);
  const totalCashOut   = winTxns.filter(t => t.type === "credit_out").reduce((s, t) => s + Number(t.amount), 0);
  const netRevenue     = parseFloat((totalCashIn - totalCashOut).toFixed(2));
  const activePlayers  = new Set(winSessions.map(s => s.playerId)).size;
  const newPlayersWindow = winPlayers.length;
  const totalBonusPaid = winTxns.filter(t => t.type === "bonus").reduce((s, t) => s + Number(t.amount), 0);
  const gameLossT      = winTxns.filter(t => t.type === "game_loss");
  const avgBetSize     = gameLossT.length > 0 ? parseFloat((gameLossT.reduce((s, t) => s + Number(t.amount), 0) / gameLossT.length).toFixed(2)) : 0;

  res.json({
    dailyTraffic, hourlyActivity: hours, gameBreakdown, tierBreakdown,
    peakHour, avgDailyLogins, totalLogins30d, totalPlays30d,
    windowDays, totalCashIn, totalCashOut, netRevenue, activePlayers, newPlayersWindow, totalBonusPaid, avgBetSize,
  });
});

// GET /api/admin/settings
router.get("/admin/settings", async (req, res) => {
  const parsedQ = GetAdminStatsQueryParams.safeParse(req.query);
  if (!parsedQ.success || !isAdmin(parsedQ.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const s = await getOrCreateSettings();
  res.json({ withdrawalEnabled: s.withdrawalEnabled });
});

// POST /api/admin/settings
router.post("/admin/settings", async (req, res) => {
  const parsedQ = GetAdminStatsQueryParams.safeParse(req.query);
  if (!parsedQ.success || !isAdmin(parsedQ.data.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { withdrawalEnabled } = req.body as { withdrawalEnabled: boolean };
  if (typeof withdrawalEnabled !== "boolean") {
    res.status(400).json({ error: "withdrawalEnabled must be a boolean" });
    return;
  }
  const s = await getOrCreateSettings();
  await db.update(settingsTable).set({ withdrawalEnabled }).where(eq(settingsTable.id, s.id));
  res.json({ withdrawalEnabled });
});

export default router;
