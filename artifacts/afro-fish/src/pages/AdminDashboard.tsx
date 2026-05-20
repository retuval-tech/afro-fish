import { useGetAdminStats, getGetAdminStatsQueryKey, useGetAdminTransactions, getGetAdminTransactionsQueryKey, useGetAdminPlayers, getGetAdminPlayersQueryKey } from "@workspace/api-client-react";
import { useAdminAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, ArrowDownToLine, ArrowUpFromLine,
  Gamepad2, TrendingUp, TrendingDown, Zap,
  Crown, Activity, BarChart3, Wallet, Swords, Shield, Target, UsersRound,
} from "lucide-react";
import { format } from "date-fns";

function StatCard({
  title, value, icon: Icon, color, bg, glow, prefix = "", isCurrency = false, sub,
}: {
  title: string; value: number | undefined; icon: React.ElementType;
  color: string; bg: string; glow: string; prefix?: string; isCurrency?: boolean; sub?: string;
}) {
  return (
    <div
      className="relative rounded-xl border border-white/8 overflow-hidden p-5 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.03)", boxShadow: `0 0 0 1px ${glow}22, inset 0 1px 0 rgba(255,255,255,0.06)` }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/45">{title}</p>
        <div className="p-2 rounded-lg" style={{ background: bg }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      {value === undefined ? (
        <Skeleton className="h-9 w-32" />
      ) : (
        <div>
          <div className={`text-3xl font-black font-mono tracking-tight`} style={{ color }}>
            {prefix}{isCurrency ? value.toLocaleString() : value}
          </div>
          {sub && <p className="text-xs text-white/35 mt-1">{sub}</p>}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-40" style={{ background: `linear-gradient(90deg, transparent, ${glow}, transparent)` }} />
    </div>
  );
}

function MiniBar({ label, a, b, colA, colB }: { label: string; a: number; b: number; colA: string; colB: string }) {
  const total = (a + b) || 1;
  const pct = (a / total) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-mono">
        <span style={{ color: colA }}>{a.toLocaleString()} wins</span>
        <span className="text-white/30 text-[10px] uppercase tracking-widest">{label}</span>
        <span style={{ color: colB }}>{b.toLocaleString()} bets</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden bg-white/8">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${colA}, ${colB})` }} />
      </div>
      <div className="flex justify-between text-[10px] text-white/30">
        <span>{pct.toFixed(1)}% payout</span>
        <span>{(100 - pct).toFixed(1)}% house edge</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { adminKey } = useAdminAuth();

  const { data: stats, isLoading: statsLoading } = useGetAdminStats(
    { adminKey: adminKey! },
    { query: { enabled: !!adminKey, queryKey: getGetAdminStatsQueryKey({ adminKey: adminKey! }) } }
  );
  const { data: transactions, isLoading: txLoading } = useGetAdminTransactions(
    { adminKey: adminKey!, limit: 8 },
    { query: { enabled: !!adminKey, queryKey: getGetAdminTransactionsQueryKey({ adminKey: adminKey!, limit: 8 }) } }
  );
  const { data: players } = useGetAdminPlayers(
    { adminKey: adminKey! },
    { query: { enabled: !!adminKey, queryKey: getGetAdminPlayersQueryKey({ adminKey: adminKey! }) } }
  );

  const houseProfit = stats?.houseProfit ?? 0;
  const topPlayers = [...(players ?? [])].sort((a, b) => b.balance - a.balance).slice(0, 5);

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-1 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-yellow-400" />
            Dashboard
          </h1>
          <p className="text-white/40 text-sm font-mono">Platform analytics &amp; financial overview</p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono">Live snapshot</p>
          <p className="text-xs text-white/50 font-mono">{format(new Date(), "MMM d, yyyy HH:mm")}</p>
        </div>
      </div>

      {/* Hero: House Profit */}
      <div
        className="relative rounded-2xl border border-yellow-400/20 p-6 mb-6 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(255,214,10,0.08) 0%, rgba(0,0,0,0) 60%)", boxShadow: "0 0 60px rgba(255,214,10,0.06) inset" }}
      >
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,214,10,0.07) 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-yellow-400/70 mb-2 font-mono">House Profit (Net)</p>
            {statsLoading ? <Skeleton className="h-14 w-52" /> : (
              <div className={`text-6xl font-black font-mono tracking-tight ${houseProfit >= 0 ? "text-yellow-400" : "text-red-400"}`}>
                {houseProfit >= 0 ? "+" : ""}{houseProfit.toLocaleString()}
                <span className="text-2xl text-yellow-400/40 ml-2">pts</span>
              </div>
            )}
            <p className="text-white/30 text-sm mt-2 font-mono">Total Bets − Total Payouts</p>
          </div>
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-2xl font-black font-mono text-emerald-400">{stats?.totalCashIn.toLocaleString() ?? "—"}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/35 font-mono mt-0.5">Cash In</div>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-black font-mono text-rose-400">{stats?.totalCashOut.toLocaleString() ?? "—"}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/35 font-mono mt-0.5">Cash Out</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard title="Players" value={stats?.totalPlayers} icon={Users} color="#60A5FA" bg="rgba(96,165,250,0.12)" glow="#60A5FA" />
        <StatCard title="Active Now" value={stats?.activePlayers} icon={Activity} color="#34D399" bg="rgba(52,211,153,0.12)" glow="#34D399" sub="with session" />
        <StatCard title="In Circulation" value={stats?.totalCreditsInCirculation} icon={Wallet} color="#FBBF24" bg="rgba(251,191,36,0.12)" glow="#FBBF24" isCurrency />
        <StatCard title="Total Cash In" value={stats?.totalCashIn} icon={ArrowDownToLine} color="#34D399" bg="rgba(52,211,153,0.12)" glow="#34D399" isCurrency />
        <StatCard title="Total Cash Out" value={stats?.totalCashOut} icon={ArrowUpFromLine} color="#F87171" bg="rgba(248,113,113,0.12)" glow="#F87171" isCurrency />
        <StatCard title="Game Payouts" value={stats?.totalGameWins} icon={TrendingUp} color="#A78BFA" bg="rgba(167,139,250,0.12)" glow="#A78BFA" isCurrency />
      </div>

      {/* ── Multiplayer Arena metrics ── */}
      <div
        className="relative rounded-2xl border border-violet-500/25 p-5 mb-6 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(0,0,0,0) 60%)", boxShadow: "0 0 40px rgba(139,92,246,0.05) inset" }}
      >
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)", transform: "translate(30%,-30%)" }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Swords className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-violet-400/80 font-mono">Multiplayer Arena</h2>
            <span className="ml-auto text-[10px] text-white/25 font-mono">Boss Battle stats</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Boss Battles", value: stats?.multiplayerSessions, icon: Shield, color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
              { label: "Arena Players", value: stats?.multiplayerPlayers, icon: UsersRound, color: "#818CF8", bg: "rgba(129,140,248,0.12)" },
              { label: "Total Bets", value: stats?.multiplayerBets, icon: Target, color: "#F472B6", bg: "rgba(244,114,182,0.12)", currency: true },
              { label: "Total Payouts", value: stats?.multiplayerPayouts, icon: TrendingUp, color: "#34D399", bg: "rgba(52,211,153,0.12)", currency: true },
            ].map(({ label, value, icon: Ic, color, bg, currency }) => (
              <div key={label} className="rounded-xl p-4 border border-white/6 flex flex-col gap-2" style={{ background: bg }}>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: `${color}99` }}>{label}</p>
                  <Ic className="w-3.5 h-3.5 opacity-60" style={{ color }} />
                </div>
                {value === undefined ? <Skeleton className="h-7 w-20" /> : (
                  <div className="text-2xl font-black font-mono" style={{ color }}>
                    {currency ? value.toLocaleString() : value}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Multiplayer house edge bar */}
          {stats && stats.multiplayerBets > 0 && (
            <div className="mt-4 pt-4 border-t border-white/6">
              <div className="flex justify-between text-xs font-mono mb-1.5">
                <span className="text-emerald-400">{stats.multiplayerPayouts.toLocaleString()} payouts</span>
                <span className="text-white/30 text-[10px] uppercase tracking-widest">Arena margin</span>
                <span className="text-rose-400">{stats.multiplayerBets.toLocaleString()} bets</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-white/8">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100,(stats.multiplayerPayouts / stats.multiplayerBets) * 100).toFixed(1)}%`, background: "linear-gradient(90deg,#34D399,#A78BFA)" }} />
              </div>
              <div className="flex justify-between text-[10px] text-white/30 mt-1 font-mono">
                <span>{((stats.multiplayerPayouts / stats.multiplayerBets) * 100).toFixed(1)}% payout rate</span>
                <span>{(100 - (stats.multiplayerPayouts / stats.multiplayerBets) * 100).toFixed(1)}% house edge</span>
              </div>
            </div>
          )}
          {stats && stats.multiplayerBets === 0 && (
            <p className="text-white/20 text-xs font-mono mt-3 text-center">No multiplayer sessions recorded yet</p>
          )}
        </div>
      </div>

      {/* Win/loss ratio + bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Win rate bar */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-4 font-mono">Game Economics</h2>
            {statsLoading ? (
              <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
            ) : (
              <div className="space-y-5">
                <MiniBar label="All Games" a={stats?.totalGameWins ?? 0} b={stats?.totalGameLosses ?? 0} colA="#34D399" colB="#F87171" />
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { label: "Total Bets", val: stats?.totalGameLosses, col: "#F87171", icon: Gamepad2 },
                    { label: "Total Payouts", val: stats?.totalGameWins, col: "#34D399", icon: TrendingUp },
                    { label: "Margin", val: stats?.totalGameLosses && stats?.totalGameWins ? `${(((stats.totalGameLosses - stats.totalGameWins) / stats.totalGameLosses) * 100).toFixed(1)}%` : "—", col: "#FBBF24", icon: TrendingDown },
                  ].map(({ label, val, col, icon: Ic }) => (
                    <div key={label} className="text-center p-3 rounded-lg bg-white/4 border border-white/6">
                      <Ic className="w-4 h-4 mx-auto mb-1 opacity-60" style={{ color: col }} />
                      <div className="text-xl font-black font-mono" style={{ color: col }}>{typeof val === "number" ? val.toLocaleString() : val ?? "—"}</div>
                      <div className="text-[10px] text-white/35 uppercase tracking-wider mt-0.5 font-mono">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent transactions */}
          <div className="rounded-xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-4 font-mono">Recent Activity</h2>
            {txLoading ? (
              <div className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : (
              <div className="space-y-1">
                {transactions?.slice(0, 7).map(tx => {
                  const isWin = tx.type === "game_win" || tx.type === "credit_in";
                  const typeColors: Record<string, string> = {
                    game_win: "#34D399", game_loss: "#60A5FA", credit_in: "#34D399", credit_out: "#F87171"
                  };
                  const typeLabels: Record<string, string> = {
                    game_win: "Win", game_loss: "Bet", credit_in: "Cash In", credit_out: "Cash Out"
                  };
                  const col = typeColors[tx.type] ?? "#9CA3AF";
                  return (
                    <div key={tx.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/4 transition-colors">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col, boxShadow: `0 0 6px ${col}` }} />
                      <span className="text-white/70 font-medium text-sm flex-1 truncate">{tx.playerName}</span>
                      <span className="text-[11px] text-white/30 font-mono flex-shrink-0">
                        {tx.game ? `${tx.game.replace("-", " ")} (${tx.tier})` : tx.note ?? "—"}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0" style={{ background: `${col}18`, color: col }}>
                        {typeLabels[tx.type] ?? tx.type}
                      </span>
                      <span className={`font-mono font-black text-sm flex-shrink-0 w-20 text-right`} style={{ color: isWin ? "#34D399" : "#F87171" }}>
                        {isWin ? "+" : "-"}{tx.amount.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Top players leaderboard */}
        <div className="rounded-xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.02)" }}>
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-4 font-mono flex items-center gap-2">
            <Crown className="w-3.5 h-3.5 text-yellow-400" /> Top Balances
          </h2>
          <div className="space-y-2">
            {topPlayers.length === 0 ? (
              <p className="text-white/25 text-sm text-center py-4 font-mono">No players yet</p>
            ) : topPlayers.map((p, i) => {
              const rankCols = ["#FFD60A", "#C0C0C0", "#CD7F32", "#60A5FA", "#9CA3AF"];
              const rankEmoji = ["🥇","🥈","🥉","4","5"];
              const col = rankCols[i] ?? "#9CA3AF";
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-white/4"
                  style={{ border: i === 0 ? `1px solid ${col}22` : "1px solid transparent" }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                    style={{ background: `${col}18`, color: col }}>
                    {i < 3 ? rankEmoji[i] : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-white/30 font-mono">{p.gamesPlayed} games</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black font-mono text-sm" style={{ color: col }}>{p.balance.toLocaleString()}</div>
                    <div className="text-[9px] text-white/25 font-mono">pts</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fish vs Dragon split */}
          <div className="mt-5 pt-4 border-t border-white/8 space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/35 font-mono">Game Modes</h3>
            {[
              { label: "Fish Hunter", icon: "🐟", col: "#00B4D8" },
              { label: "Dragon King", icon: "🐉", col: "#C77DFF" },
              { label: "Multiplayer", icon: "⚔️", col: "#A78BFA", sub: `${stats?.multiplayerSessions ?? 0} battles` },
            ].map(({ label, icon, col, sub }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-base">{icon}</span>
                <div className="flex-1">
                  <div className="text-xs font-bold" style={{ color: col }}>{label}</div>
                  {sub && <div className="text-[10px] text-white/25 font-mono">{sub}</div>}
                </div>
                <Zap className="w-3 h-3" style={{ color: col }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
