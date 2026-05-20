import { useState, useMemo } from "react";
import { useGetAdminTransactions, getGetAdminTransactionsQueryKey } from "@workspace/api-client-react";
import { useAdminAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownToLine, ArrowUpFromLine, Gamepad2, Skull, History, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { format } from "date-fns";

type TxType = "all" | "credit_in" | "credit_out" | "game_win" | "game_loss";

const TYPE_META: Record<string, { col: string; bg: string; icon: React.ElementType; label: string; dot: string }> = {
  credit_in:  { col: "#34D399", bg: "rgba(52,211,153,0.12)",  icon: ArrowDownToLine, label: "Cash In",  dot: "#34D399" },
  credit_out: { col: "#F87171", bg: "rgba(248,113,113,0.12)", icon: ArrowUpFromLine,  label: "Cash Out", dot: "#F87171" },
  game_win:   { col: "#FBBF24", bg: "rgba(251,191,36,0.12)",  icon: Gamepad2,         label: "Game Win", dot: "#FBBF24" },
  game_loss:  { col: "#60A5FA", bg: "rgba(96,165,250,0.12)",  icon: Skull,            label: "Game Bet", dot: "#60A5FA" },
};

const FILTERS: { key: TxType; label: string; icon: React.ElementType; col: string }[] = [
  { key: "all",       label: "All",      icon: History,         col: "#9CA3AF" },
  { key: "credit_in", label: "Cash In",  icon: ArrowDownToLine, col: "#34D399" },
  { key: "credit_out",label: "Cash Out", icon: ArrowUpFromLine, col: "#F87171" },
  { key: "game_win",  label: "Wins",     icon: TrendingUp,      col: "#FBBF24" },
  { key: "game_loss", label: "Bets",     icon: TrendingDown,    col: "#60A5FA" },
];

function TypeBadge({ type }: { type: string }) {
  const m = TYPE_META[type] ?? { col: "#9CA3AF", bg: "rgba(156,163,175,0.1)", icon: Gamepad2, label: type };
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{ color: m.col, background: m.bg }}>
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  );
}

export default function AdminTransactions() {
  const { adminKey } = useAdminAuth();
  const [filter, setFilter] = useState<TxType>("all");

  const { data: transactions, isLoading } = useGetAdminTransactions(
    { adminKey: adminKey!, limit: 200 },
    { query: { enabled: !!adminKey, queryKey: getGetAdminTransactionsQueryKey({ adminKey: adminKey!, limit: 200 }) } }
  );

  const filtered = useMemo(() =>
    (transactions ?? []).filter(tx => filter === "all" || tx.type === filter),
    [transactions, filter]
  );

  const summary = useMemo(() => {
    const all = transactions ?? [];
    return {
      cashIn:   all.filter(t => t.type === "credit_in").reduce((s, t) => s + t.amount, 0),
      cashOut:  all.filter(t => t.type === "credit_out").reduce((s, t) => s + t.amount, 0),
      gameWins: all.filter(t => t.type === "game_win").reduce((s, t) => s + t.amount, 0),
      gameBets: all.filter(t => t.type === "game_loss").reduce((s, t) => s + t.amount, 0),
      count:    all.length,
    };
  }, [transactions]);

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight mb-1 flex items-center gap-3">
          <History className="w-8 h-8 text-purple-400" /> Transactions
        </h1>
        <p className="text-white/40 text-sm font-mono">Complete platform activity ledger</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total Cash In",  val: summary.cashIn,   icon: ArrowDownToLine, col: "#34D399" },
          { label: "Total Cash Out", val: summary.cashOut,  icon: ArrowUpFromLine, col: "#F87171" },
          { label: "Total Payouts",  val: summary.gameWins, icon: TrendingUp,      col: "#FBBF24" },
          { label: "Total Bets",     val: summary.gameBets, icon: TrendingDown,    col: "#60A5FA" },
        ].map(({ label, val, icon: Ic, col }) => (
          <div key={label} className="rounded-xl border border-white/8 p-4 relative overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: `${col}99` }}>{label}</p>
              <div className="p-1.5 rounded-lg" style={{ background: `${col}18` }}>
                <Ic className="w-3.5 h-3.5" style={{ color: col }} />
              </div>
            </div>
            {isLoading ? <Skeleton className="h-7 w-24" /> : (
              <div className="font-black font-mono text-2xl" style={{ color: col }}>{val.toLocaleString()}</div>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-30" style={{ background: `linear-gradient(90deg, transparent, ${col}, transparent)` }} />
          </div>
        ))}
      </div>

      {/* Net flow strip */}
      {!isLoading && (
        <div className="rounded-xl border border-white/8 p-4 mb-5 flex flex-wrap items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.015)" }}>
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-mono text-white/50">Net Cash Flow</span>
            <span className={`font-black font-mono text-lg ${summary.cashIn - summary.cashOut >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {summary.cashIn - summary.cashOut >= 0 ? "+" : ""}{(summary.cashIn - summary.cashOut).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-mono text-white/50">House Margin</span>
            <span className={`font-black font-mono text-lg ${summary.gameBets - summary.gameWins >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {summary.gameBets - summary.gameWins >= 0 ? "+" : ""}{(summary.gameBets - summary.gameWins).toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-white/25 font-mono">{summary.count} total records</div>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => {
          const active = filter === f.key;
          const Icon = f.icon;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{
                color: active ? "#000" : f.col,
                background: active ? f.col : `${f.col}14`,
                border: `1px solid ${active ? f.col : f.col + "33"}`,
                boxShadow: active ? `0 0 14px ${f.col}44` : "none",
              }}>
              <Icon className="w-3.5 h-3.5" />
              {f.label}
              {filter !== "all" && f.key === filter && (
                <span className="ml-0.5 bg-black/20 rounded-full px-1.5 py-px text-[10px]">
                  {filtered.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Transactions list */}
      <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
        {/* Header */}
        <div className="grid grid-cols-[140px_1fr_120px_1fr_100px] gap-3 px-5 py-3 border-b border-white/8 text-[10px] font-bold uppercase tracking-widest text-white/30 font-mono">
          <div>Time</div>
          <div>Player</div>
          <div>Type</div>
          <div>Details</div>
          <div className="text-right">Amount</div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr_120px_1fr_100px] gap-3 px-1 py-1">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full ml-auto" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-white/25 font-mono text-sm">
            No transactions found.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(tx => {
              const m = TYPE_META[tx.type] ?? TYPE_META.game_win;
              const isPositive = tx.type === "credit_in" || tx.type === "game_win";
              const amountCol = isPositive ? "#34D399" : "#F87171";
              return (
                <div key={tx.id}
                  className="grid grid-cols-[140px_1fr_120px_1fr_100px] gap-3 px-5 py-3 items-center hover:bg-white/3 transition-colors group"
                >
                  {/* Time */}
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all group-hover:shadow-sm"
                      style={{ background: m.dot, boxShadow: `0 0 0 0 ${m.dot}` }} />
                    <span className="text-xs text-white/35 font-mono whitespace-nowrap">
                      {format(new Date(tx.createdAt), "MMM d, HH:mm:ss")}
                    </span>
                  </div>

                  {/* Player */}
                  <div className="font-semibold text-sm text-white/80 truncate">{tx.playerName}</div>

                  {/* Type badge */}
                  <div><TypeBadge type={tx.type} /></div>

                  {/* Details */}
                  <div className="text-xs text-white/35 font-mono truncate">
                    {tx.game && tx.tier ? (
                      <span className="capitalize">{tx.game.replace("-", " ")} ({tx.tier})</span>
                    ) : tx.note || "—"}
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    <span className="font-black font-mono text-sm" style={{ color: amountCol }}>
                      {isPositive ? "+" : "−"}{tx.amount.toLocaleString()}
                    </span>
                    {tx.amount >= 100 && (
                      <div className="text-[9px] text-white/20 font-mono">pts</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-white/8 text-center text-[10px] text-white/20 font-mono">
            {filtered.length} records {filter !== "all" && `(filtered from ${summary.count} total)`}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
