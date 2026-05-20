import { Router } from "express";
import { db, backupsTable } from "@workspace/db";
import { eq, desc, sql, and, lt } from "drizzle-orm";
import crypto from "crypto";
import { z } from "zod";

const router = Router();

const ADMIN_PIN = process.env.ADMIN_PIN ?? "1234";
const ADMIN_KEY = crypto.createHash("sha256")
  .update(ADMIN_PIN + "afrofish_admin").digest("hex");

function isAdmin(adminKey: unknown): boolean {
  return typeof adminKey === "string" && adminKey === ADMIN_KEY;
}

const BackupUploadSchema = z.object({
  arcadeId: z.string().min(1).max(128),
  arcadeLabel: z.string().max(128).optional(),
  capturedAt: z.string(),
  summary: z.object({
    playerCount: z.number().int().nonnegative(),
    totalCredits: z.union([z.string(), z.number()]),
    totalWon: z.union([z.string(), z.number()]),
    txCount: z.number().int().nonnegative(),
  }),
  payload: z.unknown(),
});

const RETENTION_DAYS = 90;

// POST /api/admin/backup/upload — called by each arcade nightly
router.post("/admin/backup/upload", async (req, res) => {
  if (!isAdmin(req.query.key ?? req.query.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = BackupUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid backup body", details: parsed.error.issues });
    return;
  }

  const { arcadeId, arcadeLabel, capturedAt, summary, payload } = parsed.data;
  const captured = new Date(capturedAt);
  if (Number.isNaN(captured.getTime())) {
    res.status(400).json({ error: "Invalid capturedAt timestamp" });
    return;
  }

  await db.insert(backupsTable).values({
    arcadeId,
    arcadeLabel: arcadeLabel ?? null,
    capturedAt: captured,
    playerCount: summary.playerCount,
    totalCredits: String(summary.totalCredits),
    totalWon: String(summary.totalWon),
    txCount: summary.txCount,
    payload: payload as object,
  });

  // Prune old backups for this arcade
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(backupsTable).where(
    and(
      eq(backupsTable.arcadeId, arcadeId),
      lt(backupsTable.capturedAt, cutoff),
    )
  );

  res.json({ ok: true });
});

// GET /api/admin/backup/arcades — list each arcade and its latest snapshot summary
router.get("/admin/backup/arcades", async (req, res) => {
  if (!isAdmin(req.query.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Latest backup per arcadeId
  const rows = await db.execute<{
    arcade_id: string;
    arcade_label: string | null;
    last_captured_at: Date;
    last_uploaded_at: Date;
    player_count: number;
    total_credits: string;
    total_won: string;
    tx_count: number;
    snapshot_count: number;
  }>(sql`
    SELECT DISTINCT ON (b.arcade_id)
           b.arcade_id,
           b.arcade_label,
           b.captured_at  AS last_captured_at,
           b.uploaded_at  AS last_uploaded_at,
           b.player_count,
           b.total_credits,
           b.total_won,
           b.tx_count,
           cnt.snapshot_count
    FROM backups b
    JOIN (
      SELECT arcade_id, COUNT(*)::int AS snapshot_count FROM backups GROUP BY arcade_id
    ) cnt
      ON cnt.arcade_id = b.arcade_id
    ORDER BY b.arcade_id, b.captured_at DESC, b.id DESC
  `);

  const raw = (rows as any).rows ?? rows ?? [];
  const arcades = (raw as any[]).map((r: any) => ({
    arcadeId: r.arcade_id,
    arcadeLabel: r.arcade_label ?? null,
    lastCapturedAt: new Date(r.last_captured_at).toISOString(),
    lastUploadedAt: new Date(r.last_uploaded_at).toISOString(),
    playerCount: Number(r.player_count),
    totalCredits: Number(r.total_credits),
    totalWon: Number(r.total_won),
    txCount: Number(r.tx_count),
    snapshotCount: Number(r.snapshot_count),
  }));

  res.json({ arcades });
});

// GET /api/admin/backup/snapshots?arcadeId=... — list snapshots for an arcade
router.get("/admin/backup/snapshots", async (req, res) => {
  if (!isAdmin(req.query.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const arcadeId = String(req.query.arcadeId ?? "");
  if (!arcadeId) {
    res.status(400).json({ error: "arcadeId required" });
    return;
  }

  const rows = await db.select({
    id: backupsTable.id,
    capturedAt: backupsTable.capturedAt,
    uploadedAt: backupsTable.uploadedAt,
    playerCount: backupsTable.playerCount,
    totalCredits: backupsTable.totalCredits,
    totalWon: backupsTable.totalWon,
    txCount: backupsTable.txCount,
  }).from(backupsTable)
    .where(eq(backupsTable.arcadeId, arcadeId))
    .orderBy(desc(backupsTable.capturedAt))
    .limit(180);

  res.json({
    snapshots: rows.map(r => ({
      id: r.id,
      capturedAt: r.capturedAt.toISOString(),
      uploadedAt: r.uploadedAt.toISOString(),
      playerCount: r.playerCount,
      totalCredits: Number(r.totalCredits),
      totalWon: Number(r.totalWon),
      txCount: r.txCount,
    })),
  });
});

// GET /api/admin/backup/snapshot?id=...
router.get("/admin/backup/snapshot", async (req, res) => {
  if (!isAdmin(req.query.adminKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const rows = await db.select().from(backupsTable).where(eq(backupsTable.id, id)).limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }
  const r = rows[0];
  res.json({
    id: r.id,
    arcadeId: r.arcadeId,
    arcadeLabel: r.arcadeLabel,
    capturedAt: r.capturedAt.toISOString(),
    uploadedAt: r.uploadedAt.toISOString(),
    playerCount: r.playerCount,
    totalCredits: Number(r.totalCredits),
    totalWon: Number(r.totalWon),
    txCount: r.txCount,
    payload: r.payload,
  });
});

export default router;
