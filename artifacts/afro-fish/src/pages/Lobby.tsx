import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetPlayerMe, getGetPlayerMeQueryKey,
  useGetLeaderboard, getGetLeaderboardQueryKey,
  useGetJackpot, getGetJackpotQueryKey,
  useClaimDailyBonus,
} from "@workspace/api-client-react";
import { usePlayerAuth } from "@/hooks/use-auth";
import { Loader2, LogOut, Coins, Trophy, Zap, Crown, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

/* ── Bubble canvas background ───────────────────────────────── */
function BubbleBg() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const resize = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; };
    resize(); window.addEventListener("resize", resize);

    const bubbles = Array.from({ length: 55 }, () => ({
      x: Math.random() * cv.width,
      y: cv.height + Math.random() * cv.height,
      r: 2 + Math.random() * 8,
      vy: 0.3 + Math.random() * 0.7,
      vx: (Math.random() - 0.5) * 0.4,
      a: 0.1 + Math.random() * 0.25,
      wobble: Math.random() * Math.PI * 2,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const b of bubbles) {
        b.y -= b.vy;
        b.wobble += 0.02;
        b.x += b.vx + Math.sin(b.wobble) * 0.3;
        if (b.y + b.r < 0) { b.y = cv.height + b.r; b.x = Math.random() * cv.width; }
        ctx.save();
        ctx.globalAlpha = b.a;
        ctx.strokeStyle = "#00E5FF";
        ctx.lineWidth = 1.2;
        ctx.shadowColor = "#00E5FF";
        ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = b.a * 0.3;
        ctx.fillStyle = "#00E5FF";
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

/* ── Tier button ────────────────────────────────────────────── */
const TIER_CFG = {
  bronze: {
    label: "Bronze",
    medal: "🥉",
    bg: "linear-gradient(135deg,#7c3400 0%,#b84a00 50%,#7c3400 100%)",
    border: "#d4622a",
    glow: "rgba(200,80,20,0.6)",
    text: "#ffd0a8",
  },
  silver: {
    label: "Silver",
    medal: "🥈",
    bg: "linear-gradient(135deg,#2e3a4a 0%,#4a5d72 50%,#2e3a4a 100%)",
    border: "#7a9ab8",
    glow: "rgba(100,150,200,0.5)",
    text: "#c8dce8",
  },
  gold: {
    label: "Gold",
    medal: "🥇",
    bg: "linear-gradient(135deg,#5a3a00 0%,#c8860a 50%,#5a3a00 100%)",
    border: "#f0c040",
    glow: "rgba(240,192,0,0.7)",
    text: "#fff1a0",
  },
};

function TierButton({ tier, sub, onClick }: { tier: keyof typeof TIER_CFG; sub: string; onClick: () => void }) {
  const cfg = TIER_CFG[tier];
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: cfg.bg,
        border: `1.5px solid ${cfg.border}`,
        boxShadow: hov ? `0 0 22px ${cfg.glow}, 0 0 6px ${cfg.glow}` : `0 0 6px ${cfg.glow}44`,
        color: cfg.text,
        transform: hov ? "scale(1.025)" : "scale(1)",
        transition: "all 0.18s ease",
      }}
      className="w-full h-14 rounded-xl flex items-center justify-between px-5 cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{cfg.medal}</span>
        <span className="font-bold uppercase tracking-widest text-sm">{cfg.label} Room</span>
      </div>
      <span className="font-mono text-xs opacity-90 font-bold">{sub}</span>
    </button>
  );
}

/* ── Game card ──────────────────────────────────────────────── */
function GameCard({
  icon, title, subtitle, accentColor, glowColor, borderColor, bgGrad, delay,
  children,
}: {
  icon: string; title: string; subtitle: string;
  accentColor: string; glowColor: string; borderColor: string; bgGrad: string;
  delay: number; children: React.ReactNode;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: `linear-gradient(160deg, ${bgGrad})`,
        border: `1.5px solid ${hov ? borderColor : borderColor + "55"}`,
        boxShadow: hov
          ? `0 0 50px ${glowColor}, 0 0 18px ${glowColor}88, inset 0 0 30px ${glowColor}11`
          : `0 0 18px ${glowColor}33`,
        transform: hov ? "translateY(-4px) scale(1.012)" : "translateY(0) scale(1)",
        transition: "all 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        animationDelay: `${delay}ms`,
      }}
      className="relative rounded-2xl overflow-hidden backdrop-blur-md lobby-card-enter flex flex-col"
    >
      {/* Top gradient strip */}
      <div style={{ background: `linear-gradient(to bottom, ${glowColor}22, transparent)` }} className="absolute top-0 inset-x-0 h-32 pointer-events-none" />

      {/* Rotating corner accent */}
      <div style={{ background: glowColor, opacity: hov ? 0.8 : 0.4, transition: "opacity 0.3s" }}
        className="absolute -top-6 -right-6 w-16 h-16 rounded-full blur-xl pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 p-6 flex flex-col flex-1">
        {/* Icon + title */}
        <div className="text-center mb-5">
          <div
            style={{ boxShadow: `0 0 30px ${glowColor}66, 0 0 10px ${glowColor}44` }}
            className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-3 bg-black/30"
          >
            <span className="text-5xl drop-shadow-lg">{icon}</span>
          </div>
          <h3 style={{ color: accentColor, textShadow: `0 0 20px ${glowColor}` }}
            className="text-xl font-black uppercase tracking-widest mb-1">{title}</h3>
          <p className="text-xs text-white/50 tracking-wide">{subtitle}</p>
        </div>

        {/* Divider */}
        <div style={{ background: `linear-gradient(to right, transparent, ${borderColor}66, transparent)` }}
          className="h-px mb-4" />

        {/* Tier buttons */}
        <div className="space-y-2.5 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Main Lobby ─────────────────────────────────────────────── */
export default function Lobby() {
  const { sessionToken, logout } = usePlayerAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const dailyClaimed = useRef(false);
  const [tick, setTick] = useState(0);

  const { data: player, isLoading: playerLoading, error: playerError } = useGetPlayerMe(
    { sessionToken: sessionToken! },
    { query: { enabled: !!sessionToken, queryKey: getGetPlayerMeQueryKey({ sessionToken: sessionToken! }), retry: false } }
  );
  useEffect(() => {
    const status = (playerError as { status?: number } | null)?.status;
    if (status === 401) logout();
  }, [playerError, logout]);

  const { data: leaderboard, isLoading: leaderboardLoading } = useGetLeaderboard(
    { limit: 10 },
    { query: { queryKey: getGetLeaderboardQueryKey({ limit: 10 }) } }
  );

  const { data: jackpotData } = useGetJackpot(
    { query: { queryKey: getGetJackpotQueryKey(), refetchInterval: 8000 } }
  );

  const claimDailyMutation = useClaimDailyBonus();

  // Jackpot ticker animation
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!sessionToken || dailyClaimed.current) return;
    dailyClaimed.current = true;
    claimDailyMutation.mutate(
      { data: { sessionToken } },
      {
        onSuccess: (data) => {
          if (data.eligible && data.bonus > 0) {
            toast({ title: "🎁 Daily Login Bonus!", description: `+${data.bonus} credits added to your balance` });
            qc.invalidateQueries({ queryKey: getGetPlayerMeQueryKey({ sessionToken: sessionToken! }) });
          }
        },
      }
    );
  }, [sessionToken]);

  if (!sessionToken) { setLocation("/"); return null; }

  const jackpotPool = jackpotData?.pool ?? 0;
  const nav = (game: string, tier: string) => setLocation(`/game/${game}?tier=${tier}`);

  return (
    <div className="min-h-screen bg-[#060d18] relative overflow-hidden flex flex-col select-none">
      <style>{`
        @keyframes lobby-bubble-pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
        @keyframes lobby-card-in { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes lobby-jackpot-shimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes lobby-spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes lobby-ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes lobby-glow-pulse { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
        .lobby-card-enter { animation: lobby-card-in 0.5s cubic-bezier(0.34,1.2,0.64,1) both; }
        .lobby-jackpot-text {
          background: linear-gradient(90deg,#ffd700,#ffec6e,#fffae0,#ffd700,#ffec6e,#ffd700);
          background-size: 300% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          animation: lobby-jackpot-shimmer 2.5s linear infinite;
        }
        .lobby-glow-pulse { animation: lobby-glow-pulse 2.2s ease-in-out infinite; }
      `}</style>

      {/* ── Layered deep ocean background ── */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div style={{ background: "radial-gradient(ellipse 80% 60% at 30% 0%, #0a2a44 0%, #060d18 60%)" }} className="absolute inset-0" />
        <div style={{ background: "radial-gradient(ellipse 60% 50% at 75% 100%, #0d1e38 0%, transparent 70%)" }} className="absolute inset-0" />
        <div style={{ background: "radial-gradient(ellipse 40% 30% at 50% 40%, #002233 0%, transparent 70%)" }} className="absolute inset-0 opacity-60" />
        {/* Scanline overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "repeating-linear-gradient(0deg,rgba(255,255,255,.15) 0px,rgba(255,255,255,.15) 1px,transparent 1px,transparent 3px)" }} />
        <BubbleBg />
      </div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="relative z-20 border-b border-white/[0.07]" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(6,13,24,0.4))", backdropFilter: "blur(20px)" }}>
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div style={{ background: "linear-gradient(135deg,#00b4d8,#0077b6)", boxShadow: "0 0 20px rgba(0,180,216,0.5)" }}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-base sm:text-xl shrink-0">
              🎣
            </div>
            <div className="min-w-0">
              <span style={{ background: "linear-gradient(90deg,#00e5ff,#7df9ff,#00e5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                className="font-black text-lg sm:text-2xl tracking-[0.12em] sm:tracking-[0.18em] uppercase">AFRO FISH</span>
              <span className="text-white/30 text-lg sm:text-2xl font-thin">/S</span>
            </div>
          </div>

          {/* Player chip */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2 sm:gap-4 bg-white/[0.05] border border-white/[0.1] rounded-full px-3 sm:px-5 py-1.5 sm:py-2.5 backdrop-blur-md max-w-[55vw] sm:max-w-none">
              <span className="text-white/50 text-[11px] sm:text-sm font-mono tracking-widest uppercase truncate max-w-[70px] sm:max-w-none">
                {playerLoading ? <span className="inline-block w-16 h-3 bg-white/10 rounded animate-pulse" /> : player?.name}
              </span>
              <div className="w-px h-4 bg-white/20 shrink-0" />
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400" />
                <span style={{ textShadow: "0 0 12px rgba(255,215,0,0.6)" }} className="font-mono text-sm sm:text-lg font-black text-yellow-400">
                  {playerLoading ? <span className="inline-block w-12 sm:w-16 h-4 sm:h-5 bg-white/10 rounded animate-pulse" /> : player?.balance.toLocaleString()}
                </span>
              </div>
            </div>
            <button onClick={logout}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/[0.05] hover:bg-red-900/40 border border-white/10 hover:border-red-500/40 flex items-center justify-center text-white/40 hover:text-red-400 transition-all duration-200 shrink-0">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Grand Jackpot Banner ───────────────────────────────── */}
      {jackpotPool > 0 && (
        <div className="relative z-20 overflow-hidden" style={{ background: "linear-gradient(90deg, #0a0600, #1a0e00, #2a1900, #1a0e00, #0a0600)", borderBottom: "1px solid rgba(240,192,0,0.2)" }}>
          {/* Glow blobs */}
          <div className="absolute left-1/4 top-0 w-32 h-full bg-yellow-500/10 blur-2xl pointer-events-none lobby-glow-pulse" />
          <div className="absolute right-1/4 top-0 w-32 h-full bg-yellow-500/10 blur-2xl pointer-events-none lobby-glow-pulse" style={{ animationDelay: "1.1s" }} />
          <div className="py-2 sm:py-2.5 px-3 sm:px-6 flex items-center justify-center gap-2 sm:gap-5 flex-wrap">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 shrink-0" style={{ filter: "drop-shadow(0 0 6px #ffd700)" }} />
            <span className="text-yellow-500/70 text-[10px] sm:text-xs font-mono uppercase tracking-[0.15em] sm:tracking-[0.25em]">Grand Jackpot</span>
            <span className="lobby-jackpot-text font-black font-mono text-lg sm:text-2xl tracking-wider">
              {jackpotPool.toLocaleString()} pts
            </span>
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 shrink-0" style={{ filter: "drop-shadow(0 0 6px #ffd700)" }} />
            <span className="text-yellow-500/30 text-xs font-mono hidden lg:inline">Accumulates with every shot fired</span>
          </div>
        </div>
      )}

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 max-w-[1400px] mx-auto w-full px-3 sm:px-6 py-4 sm:py-8 flex flex-col gap-4 sm:gap-8">

        {/* Section header */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-white/30 text-[10px] sm:text-xs font-mono uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-1">Choose your arena</p>
            <h2 style={{ textShadow: "0 0 30px rgba(0,229,255,0.3)" }}
              className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white">Select Game</h2>
          </div>
          <div className="flex items-center gap-2 text-white/30 text-xs font-mono shrink-0">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
        </div>

        {/* ── Game cards + leaderboard ── */}
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 flex-1" style={{ minHeight: 0 }}>

          {/* Game cards — 1 col mobile, 3 across desktop */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">

            {/* Fish Hunter */}
            <GameCard
              icon="🐟" title="Fish Hunter" subtitle="Hunt the seas for treasure"
              accentColor="#00e5ff" glowColor="#00b4d8" borderColor="#00e5ff"
              bgGrad="#020d1a 0%,#041830 60%,#021220 100%"
              delay={0}
            >
              <TierButton tier="bronze" sub="1–7 pts/fish" onClick={() => nav("fish-hunter","bronze")} />
              <TierButton tier="silver" sub="10–70 pts/fish" onClick={() => nav("fish-hunter","silver")} />
              <TierButton tier="gold" sub="100–700 pts/fish" onClick={() => nav("fish-hunter","gold")} />
            </GameCard>

            {/* Boss Battle — center, slightly elevated */}
            <div style={{ marginTop: "-8px", marginBottom: "-8px" }}>
              <GameCard
                icon="⚡" title="Boss Battle" subtitle="4 players · 1 screen · slay the Leviathan"
                accentColor="#c77dff" glowColor="#7b2ff7" borderColor="#c77dff"
                bgGrad="#0d0420 0%,#1a0640 60%,#0d0420 100%"
                delay={80}
              >
                {/* HOT badge */}
                <div className="absolute top-4 right-4 z-20 bg-purple-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-[0_0_10px_rgba(160,0,255,0.5)]">
                  MULTIPLAYER
                </div>
                <TierButton tier="bronze" sub="Boss Prize 2K pts" onClick={() => setLocation("/game/multiplayer?tier=bronze")} />
                <TierButton tier="silver" sub="Boss Prize 20K pts" onClick={() => setLocation("/game/multiplayer?tier=silver")} />
                <TierButton tier="gold" sub="Boss Prize 200K pts" onClick={() => setLocation("/game/multiplayer?tier=gold")} />
              </GameCard>
            </div>

            {/* Dragon King */}
            <GameCard
              icon="🐉" title="Dragon King" subtitle="Slay the legendary beasts"
              accentColor="#ff9500" glowColor="#cc5500" borderColor="#ff7700"
              bgGrad="#120800 0%,#200e00 60%,#120800 100%"
              delay={160}
            >
              <TierButton tier="bronze" sub="1–10 pts/dragon" onClick={() => nav("dragon-king","bronze")} />
              <TierButton tier="silver" sub="10–100 pts/dragon" onClick={() => nav("dragon-king","silver")} />
              <TierButton tier="gold" sub="100–1000 pts/dragon" onClick={() => nav("dragon-king","gold")} />
            </GameCard>
          </div>

          {/* ── Leaderboard ── */}
          <div className="w-full lg:w-72 flex flex-col" style={{ animation: "lobby-card-in 0.5s 0.25s cubic-bezier(0.34,1.2,0.64,1) both" }}>
            <div className="flex-1 rounded-2xl border border-white/[0.08] overflow-hidden flex flex-col"
              style={{ background: "linear-gradient(160deg,#060d18,#0a1428)", boxShadow: "0 0 30px rgba(255,215,0,0.05)" }}>

              {/* LB header */}
              <div className="px-5 py-4 border-b border-white/[0.06]" style={{ background: "linear-gradient(to right,rgba(255,215,0,0.05),transparent)" }}>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-400" style={{ filter: "drop-shadow(0 0 6px #ffd700)" }} />
                  <span className="font-black uppercase tracking-[0.2em] text-sm text-white/90">Top Hunters</span>
                </div>
              </div>

              {/* LB body */}
              <div className="flex-1 overflow-auto">
                {leaderboardLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : leaderboard?.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/30 text-sm">No legends yet</div>
                ) : (
                  <div className="p-2 space-y-1">
                    {leaderboard?.map((entry, idx) => {
                      const isPodium = entry.rank <= 3;
                      const podiumColors = ["#ffd700", "#c0c0c0", "#cd7f32"];
                      const podiumBgs = ["rgba(255,215,0,0.08)", "rgba(192,192,192,0.06)", "rgba(205,127,50,0.06)"];
                      const podiumIcons = ["🥇", "🥈", "🥉"];
                      return (
                        <div key={entry.rank}
                          style={{
                            background: isPodium ? podiumBgs[idx] : "rgba(255,255,255,0.02)",
                            border: isPodium ? `1px solid ${podiumColors[idx]}22` : "1px solid transparent",
                            borderRadius: "10px",
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
                        >
                          <div className="w-6 text-center shrink-0">
                            {isPodium
                              ? <span className="text-base leading-none">{podiumIcons[idx]}</span>
                              : <span className="text-xs font-mono text-white/30">{entry.rank}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span style={{ color: isPodium ? podiumColors[idx] : "rgba(255,255,255,0.8)" }}
                              className="font-bold text-sm truncate block tracking-wide">
                              {entry.playerName}
                            </span>
                          </div>
                          <div style={{ color: isPodium ? podiumColors[idx] : "rgba(255,255,255,0.5)", textShadow: isPodium ? `0 0 8px ${podiumColors[idx]}` : "none" }}
                            className="font-mono font-black text-sm shrink-0">
                            {entry.totalWon.toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* LB footer note */}
              <div className="px-5 py-3 border-t border-white/[0.05] text-center">
                <span className="text-white/20 text-[10px] font-mono uppercase tracking-widest">Ranked by total winnings</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom tier legend ── */}
        <div className="flex items-center justify-center gap-4 sm:gap-8 pb-2">
          {(["bronze","silver","gold"] as const).map(t => (
            <div key={t} className="flex items-center gap-2 text-xs font-mono text-white/30 uppercase tracking-widest">
              <span>{TIER_CFG[t].medal}</span>
              <span>{t}</span>
            </div>
          ))}
          <div className="w-px h-4 bg-white/10" />
          <span className="text-white/20 text-[10px] font-mono">Cash in · Play · Cash out</span>
        </div>
      </main>
    </div>
  );
}
