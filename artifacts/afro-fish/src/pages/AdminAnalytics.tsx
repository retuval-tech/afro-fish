import { useState, useEffect, useMemo } from "react";
import { useGetAdminAnalytics, getGetAdminAnalyticsQueryKey } from "@workspace/api-client-react";
import { useAdminAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  BarChart2, LogIn, Gamepad2, Clock, TrendingUp, Swords, Flame,
  Users, UserPlus, DollarSign, Gift, RefreshCw, Activity,
} from "lucide-react";
import { format, parseISO } from "date-fns";

type WindowDays = 1 | 7 | 30 | 90;

const WINDOWS: { label: string; days: WindowDays; desc: string }[] = [
  { label: "24H", days: 1,  desc: "Last 24 hours" },
  { label: "7D",  days: 7,  desc: "Last 7 days" },
  { label: "30D", days: 30, desc: "Last 30 days" },
  { label: "90D", days: 90, desc: "Last 90 days" },
];

const GAME_META: Record<string, { label: string; icon: string; color: string; glow: string }> = {
  "fish-hunter": { label: "Fish Hunter", icon: "🐟", color: "#00B4D8", glow: "rgba(0,180,216,0.12)" },
  "dragon-king": { label: "Dragon King", icon: "🐉", color: "#C77DFF", glow: "rgba(199,125,255,0.12)" },
  "multiplayer": { label: "Multiplayer",  icon: "⚔️", color: "#A78BFA", glow: "rgba(167,139,250,0.12)" },
};

const TIER_META: Record<string, { color: string; bg: string }> = {
  bronze: { color: "#CD7F32", bg: "rgba(205,127,50,0.13)" },
  silver: { color: "#C0C0C0", bg: "rgba(192,192,192,0.10)" },
  gold:   { color: "#FFD700", bg: "rgba(255,215,0,0.10)" },
};

function fmt12h(hour: number) {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

function pts(v: number) { return v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v/1_000).toFixed(1)}K` : v.toLocaleString(); }

function KpiCard({ label, value, icon: Icon, color, sub, loading }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string; loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-28 rounded-2xl" />;
  return (
    <div className="rounded-2xl border border-white/8 p-5 flex flex-col gap-2.5"
      style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest font-mono truncate pr-2" style={{ color: `${color}88` }}>{label}</p>
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      </div>
      <div className="text-2xl font-black font-mono leading-tight" style={{ color }}>{value}</div>
      {sub && <p className="text-[10px] text-white/22 font-mono leading-snug">{sub}</p>}
    </div>
  );
}

const TP = {
  contentStyle: { background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, fontSize: 11, fontFamily: "monospace" },
  labelStyle: { color: "#ffffff66" },
  itemStyle: { color: "#fff" },
};

export default function AdminAnalytics() {
  const { adminKey } = useAdminAuth();
  const [win, setWin] = useState<WindowDays>(30);
  const [tick, setTick] = useState(0);

  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useGetAdminAnalytics(
    { adminKey: adminKey!, days: win },
    {
      query: {
        enabled: !!adminKey,
        queryKey: getGetAdminAnalyticsQueryKey({ adminKey: adminKey!, days: win }),
        refetchInterval: 30_000,
      },
    }
  );

  // Live countdown to next refresh
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const secsSince = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : null;
  const lastUpdatedLabel = secsSince === null ? "—"
    : secsSince < 5   ? "just now"
    : secsSince < 60  ? `${secsSince}s ago`
    : `${Math.floor(secsSince / 60)}m ago`;
  void tick; // trigger rerender for countdown

  const winLabel = WINDOWS.find(w => w.days === win)?.desc ?? "";

  const dailyLabeled = useMemo(() =>
    (data?.dailyTraffic ?? []).map(d => ({
      ...d,
      label: win === 1
        ? format(parseISO(d.date), "MMM d")
        : win <= 7
        ? format(parseISO(d.date), "EEE d")
        : format(parseISO(d.date), "MMM d"),
    })), [data, win]);

  const xInterval = win === 1 ? 0 : win === 7 ? 0 : win === 30 ? 4 : 8;

  const peakLabel = data ? fmt12h(data.peakHour) : "—";
  const totalGamePlays = data?.gameBreakdown.reduce((s, g) => s + g.plays, 0) ?? 0;
  const netColor = (data?.netRevenue ?? 0) >= 0 ? "#34D399" : "#F87171";

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-0.5 flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-cyan-400" /> Analytics
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${isFetching ? "bg-yellow-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
            <span className="text-white/30 text-xs font-mono">
              {isFetching ? "Refreshing…" : `Updated ${lastUpdatedLabel}`} · auto-refresh every 30s
            </span>
            <button
              onClick={() => refetch()}
              className="text-white/20 hover:text-white/60 transition-colors ml-1"
              title="Refresh now"
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Time window tabs */}
        <div className="flex gap-1 bg-white/5 border border-white/8 rounded-xl p-1">
          {WINDOWS.map(w => (
            <button
              key={w.days}
              onClick={() => setWin(w.days)}
              className="px-3 py-1.5 rounded-lg text-xs font-black font-mono uppercase tracking-widest transition-all duration-150"
              style={{
                background: win === w.days ? "rgba(34,211,238,0.15)" : "transparent",
                color: win === w.days ? "#22D3EE" : "rgba(255,255,255,0.3)",
                border: win === w.days ? "1px solid rgba(34,211,238,0.3)" : "1px solid transparent",
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip — row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        <KpiCard loading={isLoading} label={`Logins`}         value={(data?.totalLogins30d ?? 0).toLocaleString()}    icon={LogIn}    color="#22D3EE" sub={winLabel} />
        <KpiCard loading={isLoading} label="Active Players"   value={(data?.activePlayers ?? 0).toLocaleString()}     icon={Users}    color="#34D399" sub="played in window" />
        <KpiCard loading={isLoading} label="New Players"      value={(data?.newPlayersWindow ?? 0).toLocaleString()}  icon={UserPlus} color="#A78BFA" sub="registered in window" />
        <KpiCard loading={isLoading} label="Net Revenue"      value={pts(data?.netRevenue ?? 0)}                      icon={TrendingUp} color={netColor} sub="cash in − cash out" />
        <KpiCard loading={isLoading} label="Game Plays"       value={(data?.totalPlays30d ?? 0).toLocaleString()}     icon={Gamepad2} color="#F59E0B" sub="bets placed" />
        <KpiCard loading={isLoading} label="Bonuses Paid"     value={pts(data?.totalBonusPaid ?? 0)}                  icon={Gift}     color="#FB923C" sub="chests + jackpots" />
      </div>

      {/* KPI strip — row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
        <KpiCard loading={isLoading} label="Avg Daily Logins" value={data?.avgDailyLogins?.toFixed(1) ?? "0"}         icon={Activity} color="#22D3EE" sub="per day" />
        <KpiCard loading={isLoading} label="Cash In"          value={pts(data?.totalCashIn ?? 0)}                     icon={DollarSign} color="#34D399" sub="loaded by admin" />
        <KpiCard loading={isLoading} label="Cash Out"         value={pts(data?.totalCashOut ?? 0)}                    icon={DollarSign} color="#F87171" sub="paid to players" />
        <KpiCard loading={isLoading} label="Peak Hour"        value={peakLabel}                                       icon={Clock}    color="#FBBF24" sub="busiest login hour" />
      </div>

      {/* Traffic chart — daily or hourly for 24H */}
      <div className="rounded-2xl border border-white/8 p-6 mb-5" style={{ background: "rgba(255,255,255,0.015)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-2">
            <LogIn className="w-3.5 h-3.5 text-cyan-400" />
            {win === 1 ? "Hourly Traffic — last 24 hours" : `Daily Traffic — ${winLabel}`}
          </h2>
        </div>
        {isLoading ? <Skeleton className="h-52 w-full" /> : win === 1 ? (
          /* 24H → hourly bars */
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.hourlyActivity ?? []} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="hour" tickFormatter={fmt12h} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "monospace" }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...TP} labelFormatter={(h: number) => `${fmt12h(h)} – ${fmt12h((h+1)%24)}`} formatter={(v: number) => [v, "Logins"]} />
              <Bar dataKey="count" name="Logins" fill="#22D3EE" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          /* multi-day → area chart */
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyLabeled} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22D3EE" stopOpacity={0.35}/><stop offset="95%" stopColor="#22D3EE" stopOpacity={0}/></linearGradient>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#A78BFA" stopOpacity={0.35}/><stop offset="95%" stopColor="#A78BFA" stopOpacity={0}/></linearGradient>
                <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34D399" stopOpacity={0.3}/><stop offset="95%" stopColor="#34D399" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} interval={xInterval} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...TP} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace", paddingTop: 12 }} />
              <Area type="monotone" dataKey="logins"    name="Logins"      stroke="#22D3EE" strokeWidth={2}   fill="url(#gL)" dot={false} />
              <Area type="monotone" dataKey="gamePlays" name="Game Plays"  stroke="#A78BFA" strokeWidth={2}   fill="url(#gP)" dot={false} />
              <Area type="monotone" dataKey="newPlayers" name="New Players" stroke="#34D399" strokeWidth={1.5} fill="url(#gN)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Revenue flow chart */}
      <div className="rounded-2xl border border-white/8 p-6 mb-5" style={{ background: "rgba(255,255,255,0.015)" }}>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 font-mono mb-5 flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Revenue Flow — {winLabel}
        </h2>
        {isLoading ? <Skeleton className="h-52 w-full" /> : win === 1 ? (
          /* 24H revenue — simple summary card since 1-day daily bucket isn't granular */
          <div className="grid grid-cols-3 gap-4 py-6">
            {[
              { label: "Cash In", value: pts(data?.totalCashIn ?? 0), color: "#34D399" },
              { label: "Cash Out", value: pts(data?.totalCashOut ?? 0), color: "#F87171" },
              { label: "Net", value: pts(data?.netRevenue ?? 0), color: netColor },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: `${color}88` }}>{label}</div>
                <div className="text-3xl font-black font-mono" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyLabeled} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gIn"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34D399" stopOpacity={0.35}/><stop offset="95%" stopColor="#34D399" stopOpacity={0}/></linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F87171" stopOpacity={0.3}/><stop offset="95%" stopColor="#F87171" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} interval={xInterval} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} />
              <Tooltip {...TP} formatter={(v: number) => v.toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace", paddingTop: 12 }} />
              <Area type="monotone" dataKey="cashIn"  name="Cash In"  stroke="#34D399" strokeWidth={2} fill="url(#gIn)"  dot={false} />
              <Area type="monotone" dataKey="cashOut" name="Cash Out" stroke="#F87171" strokeWidth={2} fill="url(#gOut)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Hourly heatmap + Game breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Hourly activity */}
        <div className="rounded-2xl border border-white/8 p-6" style={{ background: "rgba(255,255,255,0.015)" }}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 font-mono mb-5 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" /> Hourly Pattern — {winLabel}
          </h2>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.hourlyActivity ?? []} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={fmt12h} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "monospace" }} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...TP} labelFormatter={(h: number) => `${fmt12h(h)} – ${fmt12h((h+1)%24)}`} formatter={(v: number) => [v, "Logins"]} />
                <Bar dataKey="count" name="Logins" radius={[3,3,0,0]} fill="#F59E0B" fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {data && (
            <p className="text-[10px] text-amber-400/50 font-mono mt-2 text-center">
              Peak: <span className="text-amber-400 font-bold">{peakLabel}</span>
            </p>
          )}
        </div>

        {/* Game breakdown */}
        <div className="rounded-2xl border border-white/8 p-6" style={{ background: "rgba(255,255,255,0.015)" }}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 font-mono mb-5 flex items-center gap-2">
            <Gamepad2 className="w-3.5 h-3.5 text-violet-400" /> Game Breakdown — {winLabel}
          </h2>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <div className="space-y-4">
              {(data?.gameBreakdown ?? []).map(g => {
                const meta = GAME_META[g.game] ?? { label: g.game, icon: "🎮", color: "#fff", glow: "rgba(255,255,255,0.1)" };
                const pct = totalGamePlays > 0 ? (g.plays / totalGamePlays) * 100 : 0;
                return (
                  <div key={g.game} className="rounded-xl p-3.5 border border-white/6" style={{ background: meta.glow }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{meta.icon}</span>
                        <span className="font-bold text-sm" style={{ color: meta.color }}>{meta.label}</span>
                      </div>
                      <span className="text-[10px] font-mono text-white/35">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/8 mb-2.5">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      {[{ label: "Plays", val: g.plays.toLocaleString() }, { label: "Bets", val: pts(g.bets) }, { label: "Win%", val: `${g.winRate}%` }].map(({ label, val }) => (
                        <div key={label}>
                          <div className="text-xs font-black font-mono" style={{ color: meta.color }}>{val}</div>
                          <div className="text-[8px] text-white/20 uppercase tracking-widest font-mono">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tier distribution */}
      <div className="rounded-2xl border border-white/8 p-6 mb-5" style={{ background: "rgba(255,255,255,0.015)" }}>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 font-mono mb-5 flex items-center gap-2">
          <Flame className="w-3.5 h-3.5 text-orange-400" /> Tier Distribution — {winLabel}
        </h2>
        {isLoading ? <Skeleton className="h-36 w-full" /> : (
          <div className="grid grid-cols-3 gap-4">
            {(data?.tierBreakdown ?? []).map(t => {
              const meta = TIER_META[t.tier] ?? { color: "#fff", bg: "rgba(255,255,255,0.08)" };
              const totalP = (data?.tierBreakdown ?? []).reduce((s, x) => s + x.plays, 0);
              const pct = totalP > 0 ? ((t.plays / totalP) * 100).toFixed(1) : "0.0";
              return (
                <div key={t.tier} className="rounded-xl border border-white/8 p-4 text-center" style={{ background: meta.bg }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest font-mono mb-2" style={{ color: `${meta.color}99` }}>{t.tier}</div>
                  <div className="text-2xl font-black font-mono mb-0.5" style={{ color: meta.color }}>{t.plays.toLocaleString()}</div>
                  <div className="text-[9px] text-white/20 font-mono mb-2">plays · {pct}%</div>
                  <div className="h-1 rounded-full bg-white/8 mb-1.5">
                    <div className="h-full rounded-full mx-auto" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                  <div className="text-[9px] font-mono text-white/25">{pts(t.bets)} pts bet</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bets vs Payouts bar chart — hidden for 24H */}
      {win !== 1 && (
        <div className="rounded-2xl border border-white/8 p-6" style={{ background: "rgba(255,255,255,0.015)" }}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 font-mono mb-5 flex items-center gap-2">
            <Swords className="w-3.5 h-3.5 text-cyan-400" /> Daily Cash Flow — {winLabel}
          </h2>
          {isLoading ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyLabeled} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} interval={xInterval} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} tickFormatter={pts} />
                <Tooltip {...TP} formatter={(v: number) => v.toLocaleString()} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace", paddingTop: 12 }} />
                <Bar dataKey="cashIn"  name="Cash In"  fill="#34D399" fillOpacity={0.8} radius={[3,3,0,0]} />
                <Bar dataKey="cashOut" name="Cash Out" fill="#F87171" fillOpacity={0.8} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
