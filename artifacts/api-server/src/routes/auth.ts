import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import {
  PlayerLoginBody,
  GetPlayerMeQueryParams,
} from "@workspace/api-zod";

const router = Router();

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin + "afrofish_salt").digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  const parsed = PlayerLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { name, pin } = parsed.data;
  const pinHash = hashPin(pin);

  const players = await db.select().from(playersTable).where(eq(playersTable.name, name));
  if (players.length === 0 || players[0].pinHash !== pinHash) {
    res.status(401).json({ error: "Invalid name or PIN" });
    return;
  }

  const player = players[0];
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await db.insert(sessionsTable).values({
    playerId: player.id,
    token,
    expiresAt,
  });

  res.json({
    sessionToken: token,
    player: {
      id: player.id,
      name: player.name,
      balance: Number(player.balance),
      totalWon: Number(player.totalWon),
      totalLost: Number(player.totalLost),
      gamesPlayed: player.gamesPlayed,
      createdAt: player.createdAt.toISOString(),
    },
  });
});

// GET /api/players/me
router.get("/players/me", async (req, res) => {
  const parsed = GetPlayerMeQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing sessionToken" });
    return;
  }

  const { sessionToken } = parsed.data;

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.token, sessionToken));
  if (sessions.length === 0 || sessions[0].expiresAt < new Date()) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const players = await db.select().from(playersTable).where(eq(playersTable.id, sessions[0].playerId));
  if (players.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const player = players[0];
  res.json({
    id: player.id,
    name: player.name,
    balance: Number(player.balance),
    totalWon: Number(player.totalWon),
    totalLost: Number(player.totalLost),
    gamesPlayed: player.gamesPlayed,
    createdAt: player.createdAt.toISOString(),
  });
});

export default router;
