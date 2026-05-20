import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  sessionsTable,
  transactionsTable,
  gameSessionsTable,
  gameConfigTable,
  bonusConfigTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import {
  GameShootBody,
  GetLeaderboardQueryParams,
  GetGameSessionsQueryParams,
  ClaimDailyBonusBody,
  ClaimChestBonusBody,
  ClaimMilestoneBonusBody,
} from "@workspace/api-zod";

const router = Router();

const TIER_MULTIPLIER: Record<string, number> = {
  bronze: 1,
  silver: 10,
  gold: 100,
};

const TROPHY_MILESTONES = [100, 500, 1000];

async function getPlayerFromToken(token: string) {
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token));
  if (sessions.length === 0 || sessions[0].expiresAt < new Date()) return null;
  const players = await db.select().from(playersTable).where(eq(playersTable.id, sessions[0].playerId));
  return players.length > 0 ? players[0] : null;
}

async function getOrCreateBonusConfig() {
  const configs = await db.select().from(bonusConfigTable).limit(1);
  if (configs.length > 0) return configs[0];
  const inserted = await db.insert(bonusConfigTable).values({}).returning();
  return inserted[0];
}

// POST /api/game/shoot
router.post("/game/shoot", async (req, res) => {
  const parsed = GameShootBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { sessionToken, game, tier, weaponMultiplier, fishName, fishValue, hasSpecialAura } = parsed.data;

  const player = await getPlayerFromToken(sessionToken);
  if (!player) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const tierMult = TIER_MULTIPLIER[tier] ?? 1;
  const betAmount = weaponMultiplier * tierMult;

  if (Number(player.balance) < betAmount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  // Get win rate
  const configs = await db.select().from(gameConfigTable)
    .where(and(eq(gameConfigTable.game, game), eq(gameConfigTable.tier, tier)));
  const winRate = configs.length > 0 ? configs[0].winRate : 70;
  // Admin-configured win rate is the player's actual hit chance, applied uniformly.
  // Payout variance comes from the fish multiplier, not from skewing the hit rate.
  const hit = Math.random() * 100 < winRate;

  // Get bonus config
  const bonusConfig = await getOrCreateBonusConfig();

  // Base win
  let pointsWon = 0;
  if (hit) {
    pointsWon = fishValue * weaponMultiplier * tierMult;
    if (hasSpecialAura) pointsWon = Math.round(pointsWon * 1.3);
  }

  // Mini jackpot — configured % chance per shot
  let miniJackpot = 0;
  if (Math.random() * 100 < bonusConfig.miniJackpotOdds) {
    miniJackpot = betAmount * 20;
  }

  // Grand jackpot — 0.08% per shot, awards entire pool
  // Contribution is 2% of each bet, floored to integer (jackpot_pool is integer column).
  // Small bets contribute 0 per shot; larger bets fill it faster — by design.
  let grandJackpot = 0;
  const jackpotContrib = Math.floor(betAmount * 0.02);
  let newPool = bonusConfig.jackpotPool + jackpotContrib;
  if (newPool >= 1 && Math.random() * 100 < 0.18) {
    grandJackpot = newPool;
    newPool = 0;
  }

  // Kill trophy check (only on hit)
  let killTrophy = 0;
  let updatedKills = player.totalKills;
  let newTrophiesClaimed = player.killTrophiesClaimed;
  if (hit) {
    updatedKills = player.totalKills + 1;
    if (newTrophiesClaimed < TROPHY_MILESTONES.length) {
      const nextMilestone = TROPHY_MILESTONES[newTrophiesClaimed];
      if (updatedKills >= nextMilestone) {
        killTrophy = nextMilestone;
        newTrophiesClaimed++;
      }
    }
  }

  const totalBonus = miniJackpot + grandJackpot + killTrophy;
  const newBalance = Number(player.balance) - betAmount + pointsWon + totalBonus;

  // Update player
  await db.update(playersTable).set({
    balance: newBalance.toFixed(2),
    gamesPlayed: player.gamesPlayed + 1,
    totalWon: hit ? (Number(player.totalWon) + pointsWon).toFixed(2) : player.totalWon,
    totalLost: !hit ? (Number(player.totalLost) + betAmount).toFixed(2) : player.totalLost,
    totalKills: updatedKills,
    killTrophiesClaimed: newTrophiesClaimed,
  }).where(eq(playersTable.id, player.id));

  // Update jackpot pool
  await db.update(bonusConfigTable)
    .set({ jackpotPool: newPool })
    .where(eq(bonusConfigTable.id, bonusConfig.id));

  // Record base transaction
  if (hit) {
    await db.insert(transactionsTable).values({
      playerId: player.id, type: "game_win", amount: pointsWon.toFixed(2),
      game, tier, note: `Killed ${fishName} with ${weaponMultiplier}× weapon`,
    });
  } else {
    await db.insert(transactionsTable).values({
      playerId: player.id, type: "game_loss", amount: betAmount.toFixed(2),
      game, tier, note: `Missed ${fishName} with ${weaponMultiplier}× weapon`,
    });
  }

  // Record bonus transactions
  if (miniJackpot > 0) {
    await db.insert(transactionsTable).values({
      playerId: player.id, type: "bonus", amount: miniJackpot.toFixed(2),
      game, tier, note: "Mini Jackpot!",
    });
  }
  if (grandJackpot > 0) {
    await db.insert(transactionsTable).values({
      playerId: player.id, type: "bonus", amount: grandJackpot.toFixed(2),
      game, tier, note: "GRAND JACKPOT!",
    });
  }
  if (killTrophy > 0) {
    await db.insert(transactionsTable).values({
      playerId: player.id, type: "bonus", amount: killTrophy.toFixed(2),
      note: `Kill Count Trophy: ${killTrophy} kills milestone!`,
    });
  }

  // Record game session
  await db.insert(gameSessionsTable).values({
    playerId: player.id, game, tier, fishName, weaponMultiplier,
    pointsWon, betAmount, hit, hasSpecialAura: hasSpecialAura ?? false,
  });

  res.json({
    hit, pointsWon, betAmount,
    newBalance: Math.max(0, newBalance),
    miniJackpot, grandJackpot, killTrophy,
    totalKills: updatedKills,
  });
});

// GET /api/game/jackpot
router.get("/game/jackpot", async (_req, res) => {
  const configs = await db.select().from(bonusConfigTable).limit(1);
  const pool = configs.length > 0 ? configs[0].jackpotPool : 0;
  res.json({ pool });
});

// POST /api/game/claim-daily
router.post("/game/claim-daily", async (req, res) => {
  const parsed = ClaimDailyBonusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const player = await getPlayerFromToken(parsed.data.sessionToken);
  if (!player) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  if (player.lastLoginDate === today) {
    res.json({ bonus: 0, newBalance: Number(player.balance), eligible: false, message: "Already claimed today" });
    return;
  }

  const bonusConfig = await getOrCreateBonusConfig();
  const bonus = bonusConfig.dailyLoginBonus;
  const newBalance = Number(player.balance) + bonus;

  await db.update(playersTable)
    .set({ balance: newBalance.toFixed(2), lastLoginDate: today })
    .where(eq(playersTable.id, player.id));

  await db.insert(transactionsTable).values({
    playerId: player.id, type: "bonus", amount: bonus.toFixed(2),
    note: "Daily login bonus",
  });

  res.json({ bonus, newBalance, eligible: true, message: `Daily bonus! +${bonus} credits` });
});

// POST /api/game/claim-chest
router.post("/game/claim-chest", async (req, res) => {
  const parsed = ClaimChestBonusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const player = await getPlayerFromToken(parsed.data.sessionToken);
  if (!player) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const bonus = 30 + Math.floor(Math.random() * 221);
  const newBalance = Number(player.balance) + bonus;

  await db.update(playersTable)
    .set({ balance: newBalance.toFixed(2) })
    .where(eq(playersTable.id, player.id));

  await db.insert(transactionsTable).values({
    playerId: player.id, type: "bonus", amount: bonus.toFixed(2),
    note: "Bonus Chest",
  });

  res.json({ bonus, newBalance, eligible: true, message: `Bonus Chest! +${bonus} credits` });
});

// POST /api/game/claim-milestone
router.post("/game/claim-milestone", async (req, res) => {
  const parsed = ClaimMilestoneBonusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const player = await getPlayerFromToken(parsed.data.sessionToken);
  if (!player) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const bonusConfig = await getOrCreateBonusConfig();
  const bonus = bonusConfig.sessionMilestoneAmt;
  const newBalance = Number(player.balance) + bonus;

  await db.update(playersTable)
    .set({ balance: newBalance.toFixed(2) })
    .where(eq(playersTable.id, player.id));

  await db.insert(transactionsTable).values({
    playerId: player.id, type: "bonus", amount: bonus.toFixed(2),
    note: "Session Milestone bonus",
  });

  res.json({ bonus, newBalance, eligible: true, message: `Session Milestone! +${bonus} credits` });
});

// GET /api/game/leaderboard
router.get("/game/leaderboard", async (req, res) => {
  const parsed = GetLeaderboardQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 10) : 10;

  const players = await db.select({
    id: playersTable.id,
    name: playersTable.name,
    totalWon: playersTable.totalWon,
    gamesPlayed: playersTable.gamesPlayed,
  })
    .from(playersTable)
    .orderBy(desc(playersTable.totalWon))
    .limit(limit);

  res.json(
    players.map((p, i) => ({
      rank: i + 1,
      playerName: p.name,
      totalWon: Number(p.totalWon),
      gamesPlayed: p.gamesPlayed,
    }))
  );
});

// GET /api/game/sessions
router.get("/game/sessions", async (req, res) => {
  const parsed = GetGameSessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing sessionToken" });
    return;
  }

  const { sessionToken, limit } = parsed.data;
  const player = await getPlayerFromToken(sessionToken);
  if (!player) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const sessions = await db.select().from(gameSessionsTable)
    .where(eq(gameSessionsTable.playerId, player.id))
    .orderBy(desc(gameSessionsTable.createdAt))
    .limit(limit ?? 20);

  res.json(sessions.map(s => ({
    id: s.id, game: s.game, tier: s.tier, fishName: s.fishName,
    weaponMultiplier: s.weaponMultiplier, pointsWon: s.pointsWon,
    betAmount: s.betAmount, hit: s.hit, createdAt: s.createdAt.toISOString(),
  })));
});

// POST /api/game/boss-payout
router.post("/game/boss-payout", async (req, res) => {
  const { payouts, tier, note } = req.body ?? {};
  if (!Array.isArray(payouts) || typeof tier !== "string" || typeof note !== "string") {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const results: { playerName: string; amount: number; newBalance: number }[] = [];

  for (const payout of payouts) {
    if (payout.amount <= 0) continue;
    const player = await getPlayerFromToken(payout.sessionToken);
    if (!player) continue;
    const newBalance = Number(player.balance) + payout.amount;
    await db.update(playersTable).set({
      balance: newBalance.toFixed(2),
      totalWon: (Number(player.totalWon) + payout.amount).toFixed(2),
    }).where(eq(playersTable.id, player.id));
    await db.insert(transactionsTable).values({
      playerId: player.id, type: "bonus",
      amount: payout.amount.toFixed(2),
      game: "multiplayer", tier,
      note,
    });
    results.push({ playerName: player.name, amount: payout.amount, newBalance });
  }

  res.json({ results });
});

export default router;
