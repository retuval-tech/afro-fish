import { useEffect, useState } from "react";
import { useAdminAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { CloudUpload, HardDrive, Users, Wallet, TrendingUp, History, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface ArcadeRow {
  arcadeId: string;
  arcadeLabel: string | null;
  lastCapturedAt: string;
  lastUploadedAt: string;
  playerCount: number;
  totalCredits: number;
  totalWon: number;
  txCount: number;
  snapshotCount: number;
}

interface Snapshot {
  id: number;
  capturedAt: string;
  uploadedAt: string;
  playerCount: number;
  totalCredits: number;
  totalWon: number;
  txCount: number;
}

export default function AdminBackups() {
  const { adminKey } = useAdminAuth();
  const [arcades, setArcades] = useState<ArcadeRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapLoading, setSnapLoading] = useState(false);

  useEffect(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`/api/admin/backup/arcades?adminKey=${encodeURIComponent(adminKey)}`)
      .then(r => r.json())
      .then(d => { setArcades(d.arcades ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey || !selected) { setSnapshots(null); return; }
    setSnapLoading(true);
    fetch(`/api/admin/backup/snapshots?adminKey=${encodeURIComponent(adminKey)}&arcadeId=${encodeURIComponent(selected)}`)
      .then(r => r.json())
      .then(d => { setSnapshots(d.snapshots ?? []); setSnapLoading(false); })
      .catch(() => setSnapLoading(false));
  }, [adminKey, selected]);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight mb-1 flex items-center gap-3">
          <CloudUpload className="w-8 h-8 text-cyan-400" /> Backups
        </h1>
        <p className="text-white/40 text-sm font-mono">
          Nightly snapshots uploaded from each arcade desktop install
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !arcades || arcades.length === 0 ? (
        <div className="rounded-xl border border-white/8 p-12 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
          <HardDrive className="w-12 h-12 mx-auto mb-4 text-white/20" />
          <p className="text-white/40 text-sm">No backups received yet.</p>
          <p className="text-white/30 text-xs mt-2 font-mono">
            Arcades upload nightly at 03:00 local time. The first backup will appear within 24 hours of install.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Arcade list */}
          <div className="space-y-3">
            <h2 className="text-xs uppercase tracking-widest text-white/40 font-bold mb-2">
              Arcades ({arcades.length})
            </h2>
            {arcades.map(a => {
              const isSel = selected === a.arcadeId;
              const stale = Date.now() - new Date(a.lastCapturedAt).getTime() > 36 * 60 * 60 * 1000;
              return (
                <button
                  key={a.arcadeId}
                  onClick={() => setSelected(a.arcadeId)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    isSel
                      ? "border-cyan-400/50 bg-cyan-400/5"
                      : "border-white/8 hover:border-white/15 hover:bg-white/3"
                  }`}
                  style={{ background: isSel ? undefined : "rgba(255,255,255,0.02)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        {a.arcadeLabel ?? "Unlabelled"}
                      </div>
                      <div className="text-[10px] font-mono text-white/30 truncate">
                        {a.arcadeId}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                    <Stat icon={Users}      label="Players" val={a.playerCount} />
                    <Stat icon={Wallet}     label="Credits" val={a.totalCredits.toFixed(0)} />
                    <Stat icon={TrendingUp} label="Won"     val={a.totalWon.toFixed(0)} />
                    <Stat icon={History}    label="Txns"    val={a.txCount} />
                  </div>
                  <div className={`mt-3 text-[10px] font-mono ${stale ? "text-amber-400" : "text-white/40"}`}>
                    Last: {format(new Date(a.lastCapturedAt), "MMM d, HH:mm")}
                    {stale && " — stale (>36h)"}
                    {" · "}
                    {a.snapshotCount} snapshot{a.snapshotCount === 1 ? "" : "s"}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Snapshot list */}
          <div>
            <h2 className="text-xs uppercase tracking-widest text-white/40 font-bold mb-2">
              {selected ? "Snapshots" : "Select an arcade"}
            </h2>
            {!selected ? (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-white/30 text-sm">
                Pick an arcade to see its snapshot history
              </div>
            ) : snapLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !snapshots || snapshots.length === 0 ? (
              <div className="text-white/40 text-sm">No snapshots</div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                {snapshots.map(s => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-white/8 p-3 flex items-center justify-between"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                  >
                    <div>
                      <div className="font-mono text-sm text-white">
                        {format(new Date(s.capturedAt), "MMM d, yyyy · HH:mm")}
                      </div>
                      <div className="text-[10px] text-white/40 font-mono">
                        {s.playerCount} players · {s.txCount} txns · {s.totalCredits.toFixed(0)} cr
                      </div>
                    </div>
                    <a
                      href={`/api/admin/backup/snapshot?adminKey=${encodeURIComponent(adminKey ?? "")}&id=${s.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-mono"
                    >
                      view JSON
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Stat({ icon: Icon, label, val }: { icon: React.ElementType; label: string; val: string | number }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 text-white/40">
        <Icon className="w-3 h-3" />
        <span className="text-[9px] uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-bold font-mono text-white text-sm mt-0.5">{val}</span>
    </div>
  );
}
