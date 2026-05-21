import { useEffect, useRef, useState, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { usePlayerAuth } from "@/hooks/use-auth";
import { useGetPlayerMe, getGetPlayerMeQueryKey, useGameShoot, useClaimChestBonus, useClaimMilestoneBonus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { soundEngine } from "@/lib/sound-engine";

const BASE = import.meta.env.BASE_URL ?? "/";

const FISH = [
  { mult: 1,  name: "Clownfish",  sprite: `${BASE}sprites/fish_clownfish.png`,  glow: "#FF8C00", size: 72,  spd: 9.0  },
  { mult: 2,  name: "Grouper",    sprite: `${BASE}sprites/fish_grouper.png`,    glow: "#E53935", size: 96,  spd: 7.0  },
  { mult: 3,  name: "Pufferfish", sprite: `${BASE}sprites/fish_pufferfish.png`, glow: "#FFD600", size: 115, spd: 5.5  },
  { mult: 5,  name: "Shark",      sprite: `${BASE}sprites/fish_shark.png`,      glow: "#90A4AE", size: 150, spd: 3.8  },
  { mult: 7,  name: "Megalodon",  sprite: `${BASE}sprites/fish_megalodon.png`,  glow: "#B71C1C", size: 195, spd: 2.4  },
  { mult: 15, name: "Kraken",     sprite: `${BASE}sprites/fish_megalodon.png`,  glow: "#CC00FF", size: 240, spd: 1.4  },
];
const SHOT_COOLDOWN = [4, 6, 9, 13, 18, 24];

const WEAPONS = [
  { mult: 1, name: "Pistol",  col: "#00E5FF", bg: "#003344", emoji: "🔫", speed: 72, radius: 5,  trap: false },
  { mult: 2, name: "Rifle",   col: "#76FF03", bg: "#1A3300", emoji: "🎯", speed: 66, radius: 6,  trap: false },
  { mult: 3, name: "Cannon",  col: "#FFD600", bg: "#332600", emoji: "💣", speed: 55, radius: 10, trap: false },
  { mult: 5, name: "Railgun", col: "#FF6D00", bg: "#331500", emoji: "⚡", speed: 90, radius: 7,  trap: false },
  { mult: 7, name: "Torpedo", col: "#FF1744", bg: "#330008", emoji: "🌊", speed: 50, radius: 16, trap: false },
  { mult: 4, name: "NetTrap", col: "#FFB300", bg: "#3A2400", emoji: "🕸️", speed: 40, radius: 14, trap: true  },
];

const KILL_LS_KEY_FH = "afrofish_fh_kills_v1";
function loadKillsFH(): Record<string, number> { try { return JSON.parse(localStorage.getItem(KILL_LS_KEY_FH) || "{}"); } catch { return {}; } }
function saveKillsFH(m: Record<string, number>) { try { localStorage.setItem(KILL_LS_KEY_FH, JSON.stringify(m)); } catch {} }
function rankForFH(weaponName: string, kills: number): { name: string; tier: string; color: string } | null {
  if (kills >= 2500) return { name: weaponName, tier: "LEGEND", color: "#FF00E5" };
  if (kills >= 1000) return { name: weaponName, tier: "MASTER", color: "#FFD600" };
  if (kills >= 500)  return { name: weaponName, tier: "EXPERT", color: "#FF6D00" };
  if (kills >= 100)  return { name: weaponName, tier: "ROOKIE", color: "#00E5FF" };
  return null;
}

const TIER: Record<string, number> = { bronze: 1, silver: 10, gold: 100 };

interface FishObj   { id: number; x: number; y: number; vx: number; vy: number; t: number; phase: number; lucky?: boolean; boss?: boolean; bossHp?: number; bossMaxHp?: number; flash?: number; dying?: number; schoolId?: number; }
interface DamageNum { x: number; y: number; vx: number; vy: number; life: number; text: string; color: string; size: number; }
interface PowerUp   { id: number; kind: "slowmo"|"multishot"|"bomb"; x: number; y: number; vx: number; vy: number; life: number; phase: number; }
interface BgFish    { x: number; y: number; vx: number; size: number; phase: number; alpha: number; }
interface HitResult { hit: boolean; pointsWon: number; cost: number; fishGlow: string; fishMult: number; fishSize: number; isLucky: boolean; }
interface Bullet    { id: number; x: number; y: number; tx: number; ty: number; trail: {x:number;y:number}[]; done: boolean; col: string; targetId: number; speed: number; radius: number; hitResult: HitResult | null; wpIdx: number; bonus?: boolean; bornAt: number; }
interface Boom      { x: number; y: number; r: number; life: number; color: string; ring: boolean; }
interface Coin      { x: number; y: number; vx: number; vy: number; life: number; }
interface Ripple    { x: number; y: number; r: number; life: number; }
interface Bubble    { x: number; y: number; r: number; vy: number; phase: number; }
interface Flash      { x: number; y: number; r: number; life: number; col: string; }
interface Chest      { x: number; y: number; vx: number; life: number; }
interface LuckyCoin  { id: number; x: number; y: number; y0: number; vx: number; life: number; phase: number; }

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

function drawBonusChest(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.save();
  const pulse = 1 + Math.sin(t * 0.12) * 0.08;
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.ellipse(0, 30, 30, 7, 0, 0, Math.PI*2); ctx.fill();
  // Body
  const bg = ctx.createLinearGradient(0, 0, 0, 32);
  bg.addColorStop(0, "#8B6914"); bg.addColorStop(1, "#4A3408");
  ctx.fillStyle = bg; ctx.strokeStyle = "#FFD700"; ctx.lineWidth = 2;
  ctx.shadowColor = "#FFD700"; ctx.shadowBlur = 22;
  ctx.beginPath(); ctx.roundRect(-26, 2, 52, 30, 4); ctx.fill(); ctx.stroke();
  // Lid
  const lid = ctx.createLinearGradient(0, -26, 0, 2);
  lid.addColorStop(0, "#C49A1E"); lid.addColorStop(1, "#8B6914");
  ctx.fillStyle = lid;
  ctx.beginPath(); ctx.roundRect(-26, -26, 52, 28, [8, 8, 0, 0]); ctx.fill(); ctx.stroke();
  // Band
  ctx.shadowBlur = 0; ctx.fillStyle = "#FFD700";
  ctx.beginPath(); ctx.roundRect(-26, -4, 52, 8, 2); ctx.fill();
  // Lock
  ctx.shadowColor = "#FFF"; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(0, -1, 7, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#8B6914"; ctx.beginPath(); ctx.arc(0, -1, 4, 0, Math.PI*2); ctx.fill();
  // Sparkles
  ctx.shadowBlur = 0;
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI*2*i/5) + t*0.06;
    const r = 40 + Math.sin(t*0.09+i)*5;
    ctx.save(); ctx.translate(Math.cos(a)*r, Math.sin(a)*r);
    ctx.fillStyle = "#FFD700"; ctx.font = "12px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("✦", 0, 0); ctx.restore();
  }
  // Click hint
  ctx.font = "bold 12px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillStyle = "#FFD700"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
  ctx.fillText("CLICK!", 0, -38); ctx.shadowBlur = 0;
  ctx.restore();
}

let hiQ = true; // adaptive rendering quality — auto-disabled on slow devices
let _fpsA = 60, _lastMs = 0;

function drawBgFish(ctx: CanvasRenderingContext2D, fish: BgFish[], W: number, H: number) {
  // Deep silhouettes drifting in the background — slow, subtle, atmospheric.
  for (const f of fish) {
    f.x += f.vx; f.phase += 0.012;
    if (f.x < -120) f.x = W + 80;
    if (f.x > W + 120) f.x = -80;
    const yy = f.y + Math.sin(f.phase) * 8;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.fillStyle = "#001520";
    ctx.translate(f.x, yy);
    if (f.vx < 0) ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, f.size, f.size * 0.32, 0, 0, Math.PI * 2);
    ctx.moveTo(-f.size, 0); ctx.lineTo(-f.size * 1.4, -f.size * 0.28); ctx.lineTo(-f.size * 1.4, f.size * 0.28); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawBG(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, bubbles: Bubble[], bgImg: HTMLImageElement | null) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#00233a"); bg.addColorStop(0.4, "#00496F"); bg.addColorStop(0.8, "#0077B6"); bg.addColorStop(1, "#005B8E");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    ctx.save(); ctx.globalAlpha = 0.88; ctx.drawImage(bgImg, 0, 0, W, H); ctx.restore();
    const vig = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,10,30,0.45)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }
  if (hiQ) {
    ctx.save(); ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 7; i++) {
      const rx = W*(0.05+i*0.14)+Math.sin(t*0.005+i*1.3)*22;
      const op = 0.06+Math.sin(t*0.007+i*0.8)*0.03;
      const rw = 20+Math.sin(t*0.008+i)*12;
      const rg = ctx.createLinearGradient(rx,0,rx+rw,H*0.65);
      rg.addColorStop(0,`rgba(160,230,255,${op+0.04})`); rg.addColorStop(1,"rgba(60,150,255,0)");
      ctx.fillStyle=rg; ctx.beginPath(); ctx.moveTo(rx-rw,0); ctx.lineTo(rx+rw*1.8,H*0.68); ctx.lineTo(rx,H*0.68); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over"; ctx.restore();
  }
  for (const b of bubbles) {
    ctx.save(); ctx.globalAlpha=0.38; ctx.strokeStyle="rgba(180,245,255,1)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle="rgba(200,240,255,0.12)"; ctx.fill();
    ctx.globalAlpha=0.7; ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(b.x-b.r*0.35,b.y-b.r*0.35,b.r*0.28,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  const sandY=H*0.87;
  const sand=ctx.createLinearGradient(0,sandY,0,H);
  sand.addColorStop(0,"rgba(100,70,20,0.75)"); sand.addColorStop(1,"rgba(50,30,8,0.9)");
  ctx.fillStyle=sand; ctx.beginPath(); ctx.moveTo(0,sandY);
  for (let sx=0;sx<=W;sx+=30) ctx.lineTo(sx,sandY+Math.sin(sx*0.03+t*0.003)*4);
  ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
  for (let wi=0;wi<14;wi++){
    const wx=(W/13)*wi+12; const wh=22+(wi*13%36); const wp=t*0.013+wi*0.7;
    ctx.strokeStyle=`hsl(${115+wi%25},68%,${32+wi%14}%)`; ctx.lineWidth=3; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(wx,sandY);
    for (let seg=0;seg<5;seg++){const ox=Math.sin(wp+seg*0.9)*9;ctx.quadraticCurveTo(wx+ox*1.4,sandY-seg*(wh/5)-wh/10,wx+ox,sandY-(wh/5)*(seg+1));}
    ctx.stroke();
  }
}

function drawCoinBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, mult: number) {
  const r = mult >= 10 ? 26 : mult >= 5 ? 22 : 19;
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,0.7)"; ctx.shadowBlur=8;
  ctx.fillStyle="#7A4800"; ctx.beginPath(); ctx.arc(cx+2,cy+2.5,r,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle="#C07800"; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#FFD700"; ctx.beginPath(); ctx.arc(cx-r*0.08,cy-r*0.08,r*0.86,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="#8B5E00"; ctx.lineWidth=2.2; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle="#FFE680"; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(cx,cy,r*0.76,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle="rgba(255,255,200,0.65)"; ctx.beginPath(); ctx.ellipse(cx-r*0.26,cy-r*0.3,r*0.34,r*0.19,-Math.PI/4,0,Math.PI*2); ctx.fill();
  const fs=Math.round(r*(mult>=10?0.56:0.66));
  ctx.font=`bold ${fs}px 'Arial Black',Arial,sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillStyle="#1A0600"; ctx.fillText(`${mult}×`,cx,cy+1);
  ctx.restore();
}

function drawCannon(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, col: string, t: number, shooting: boolean) {
  ctx.save(); ctx.translate(cx,cy);
  // Shadow ellipse
  ctx.fillStyle="rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(0,14,52,10,0,0,Math.PI*2); ctx.fill();
  // Outer rotating ring + dots
  ctx.save(); ctx.rotate(-t*0.022);
  ctx.strokeStyle=col+"44"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,52,0,Math.PI*2); ctx.stroke();
  for(let i=0;i<8;i++){const a=(Math.PI*2*i)/8;ctx.fillStyle=col+"99";ctx.shadowColor=col;ctx.shadowBlur=4;ctx.beginPath();ctx.arc(Math.cos(a)*52,Math.sin(a)*52,4.5,0,Math.PI*2);ctx.fill();}
  ctx.shadowBlur=0; ctx.restore();
  // Base disc
  const bd=ctx.createRadialGradient(-8,-8,4,0,0,44);
  bd.addColorStop(0,"#3a3a4a");bd.addColorStop(0.5,"#222230");bd.addColorStop(1,"#10101a");
  ctx.fillStyle=bd; ctx.beginPath(); ctx.arc(0,0,44,0,Math.PI*2); ctx.fill();
  ctx.shadowColor=col; ctx.shadowBlur=22+Math.sin(t*0.07)*8; ctx.strokeStyle=col; ctx.lineWidth=3; ctx.stroke(); ctx.shadowBlur=0;
  // Inner rotating ring
  ctx.save(); ctx.rotate(t*0.035);
  ctx.strokeStyle=col+"66"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,28,0,Math.PI*2); ctx.stroke(); ctx.restore();
  // Center jewel
  const jg=ctx.createRadialGradient(0,0,0,0,0,10);jg.addColorStop(0,"#fff");jg.addColorStop(0.5,col);jg.addColorStop(1,col+"00");
  ctx.fillStyle=jg;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();
  // Aim indicator line (before rotation so we can draw in world space)
  ctx.save(); ctx.rotate(angle);
  const BASE_R=44,BARREL=78,TIP=BASE_R+BARREL+10;
  // Aim dash extending from muzzle
  ctx.setLineDash([6,8]);ctx.strokeStyle=col+"55";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(TIP,0);ctx.lineTo(TIP+90,0);ctx.stroke();ctx.setLineDash([]);
  // Barrel body
  ctx.shadowColor=col; ctx.shadowBlur=30; ctx.fillStyle=col;
  ctx.beginPath(); ctx.roundRect(BASE_R,-12,BARREL,24,[0,0,6,6]); ctx.fill();
  ctx.shadowBlur=0; ctx.fillStyle="#0e0e1a";
  ctx.beginPath(); ctx.roundRect(BASE_R+3,-7,BARREL-6,14,[0,0,4,4]); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.26)"; ctx.beginPath(); ctx.roundRect(BASE_R+8,-4,BARREL-20,7,3); ctx.fill();
  // Barrel rings — flush with barrel bounds (-12..12)
  [0.3,0.6,0.85].forEach(f=>{const rx=BASE_R+BARREL*f;ctx.fillStyle=col;ctx.shadowColor=col;ctx.shadowBlur=8;ctx.beginPath();ctx.roundRect(rx-4,-12,8,24,3);ctx.fill();ctx.shadowBlur=0;});
  // Muzzle cap
  ctx.shadowColor=col; ctx.shadowBlur=30; ctx.fillStyle="#222230"; ctx.beginPath(); ctx.arc(TIP,0,13,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=col; ctx.lineWidth=3; ctx.stroke(); ctx.shadowBlur=0;
  ctx.fillStyle="#000"; ctx.beginPath(); ctx.arc(TIP,0,7,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=col+"88"; ctx.beginPath(); ctx.arc(TIP,0,4,0,Math.PI*2); ctx.fill();
  // Muzzle flash with directional sparks
  if(shooting){
    ctx.shadowColor="#fff";ctx.shadowBlur=70;
    ctx.fillStyle="#fff";ctx.globalAlpha=0.95;ctx.beginPath();ctx.arc(TIP,0,24,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=col;ctx.globalAlpha=0.8;ctx.beginPath();ctx.arc(TIP,0,16,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=0.9;ctx.strokeStyle="#fff";ctx.lineWidth=2.5;
    for(let i=0;i<10;i++){const ra=(Math.PI*2*i)/10;const len=20+Math.sin(i*137.5)*12;ctx.beginPath();ctx.moveTo(TIP+Math.cos(ra)*15,Math.sin(ra)*15);ctx.lineTo(TIP+Math.cos(ra)*(15+len),Math.sin(ra)*(15+len));ctx.stroke();}
    ctx.globalAlpha=1;ctx.shadowBlur=0;
  }
  ctx.restore(); ctx.restore();
}

export default function FishHunterGame() {
  const search   = useSearch();
  const tier     = (new URLSearchParams(search).get("tier") || "bronze") as string;
  const tierMult = TIER[tier] ?? 1;
  const [, setLocation] = useLocation();
  const { sessionToken, logout } = usePlayerAuth();
  const qc = useQueryClient();
  const shootMutation    = useGameShoot();
  const claimChestMutation    = useClaimChestBonus();
  const claimMilestoneMutation = useClaimMilestoneBonus();

  const { data: player, error: playerError } = useGetPlayerMe(
    { sessionToken: sessionToken! },
    { query: { enabled: !!sessionToken, queryKey: getGetPlayerMeQueryKey({ sessionToken: sessionToken! }), retry: false } }
  );
  useEffect(() => {
    const status = (playerError as { status?: number } | null)?.status;
    if (status === 401) logout();
  }, [playerError, logout]);

  const [balance,       setBalance]       = useState<number | null>(null);
  const [weapon,        setWeapon]        = useState(0);
  const [autoFire,      setAutoFire]      = useState(false);
  const autoFireRef = useRef(false);
  useEffect(() => { autoFireRef.current = autoFire; }, [autoFire]);
  const [feedback,      setFeedback]      = useState<{ text: string; win: boolean } | null>(null);
  const [ready,         setReady]         = useState(false);
  const [streak,        setStreak]        = useState(0);
  const [fever,         setFever]         = useState(false);
  const [miniJackpot,   setMiniJackpot]   = useState(0);
  const [grandJackpot,  setGrandJackpot]  = useState(0);
  const [killTrophy,    setKillTrophy]    = useState(0);
  const [milestoneBonus,setMilestoneBonus]= useState(0);
  const [bigWin,        setBigWin]        = useState<{ label: string; color: string; sub: string } | null>(null);
  const [freeShotMeter, setFreeShotMeter] = useState(0);
  const [bossWarning,   setBossWarning]   = useState(false);
  const [showSummary,   setShowSummary]   = useState(false);
  const [waveBanner,    setWaveBanner]    = useState<number | null>(null);
  const [rankBadge,     setRankBadge]     = useState<{ name: string; tier: string; color: string; kills: number } | null>(null);
  const [multishotMs,   setMultishotMs]   = useState(0);
  const [bossHpBar,     setBossHpBar]     = useState<{ hp: number; max: number } | null>(null);

  useEffect(() => { if (player?.balance !== undefined) setBalance(player.balance); }, [player?.balance]);
  useEffect(() => { if (!sessionToken) setLocation("/"); }, [sessionToken, setLocation]);

  const cvs        = useRef<HTMLCanvasElement>(null);
  const mouseRef   = useRef({ x: 400, y: 300 });
  const spriteImgs = useRef<HTMLImageElement[]>([]);
  const bgImgRef   = useRef<HTMLImageElement | null>(null);
  const weaponRef  = useRef(0);
  const balRef     = useRef<number | null>(null);
  const sessionRef = useRef(sessionToken);
  const ambientRef = useRef(false);
  const shootFnRef = useRef<(fishId: number, opts?: { skipBurst?: boolean }) => void>(() => {});
  const fireBonusFnRef = useRef<(targetId: number, srcWpIdx: number) => void>(() => {});
  const claimChestRef    = useRef<() => void>(() => {});
  const claimMilestoneRef = useRef<() => void>(() => {});

  const stRef = useRef({
    fish:    [] as FishObj[],
    bullets: [] as Bullet[],
    booms:   [] as Boom[],
    coins:   [] as Coin[],
    ripples: [] as Ripple[],
    bubbles: [] as Bubble[],
    flashes: [] as Flash[],
    chest:   null as Chest | null,
    nextId: 0, t: 0, raf: 0,
    cannonAngle: -Math.PI / 2,
    shotCooldown: 0, mouseDown: false, muzzleFlash: 0,
    streak: 0, feverFrames: 0, nextFeverAt: 1800,
    nextLuckyAt: 600, nextChestAt: 900, nextCoinAt: 1100, sessionShots: 0,
    luckyCoinList: [] as LuckyCoin[], freeShotHits: 0, freeShotReady: false,
    // ── Juice & variety state ──
    shake: 0, slowmo: 0, multishot: 0,
    damageNums: [] as DamageNum[],
    powerUps: [] as PowerUp[],
    bgFish: [] as BgFish[],
    nextBossAt: 5400, bossActive: false, bossSpawnPending: false,
    nextSchoolAt: 1700, nextPowerUpAt: 2400,
    waveNum: 1, nextWaveAt: 3600,
    killsByWeapon: loadKillsFH() as Record<string, number>,
    stats: { kills: 0, misses: 0, biggestWin: 0, longestStreak: 0, totalEarned: 0, totalSpent: 0, bossKills: 0 },
  });

  useEffect(() => { weaponRef.current = weapon; },        [weapon]);
  useEffect(() => { balRef.current = balance; },          [balance]);
  useEffect(() => { sessionRef.current = sessionToken; }, [sessionToken]);

  useEffect(() => {
    claimChestRef.current = () => {
      if (!sessionRef.current) return;
      claimChestMutation.mutate(
        { data: { sessionToken: sessionRef.current } },
        {
          onSuccess: (data) => {
            setBalance(data.newBalance); balRef.current = data.newBalance;
            setFeedback({ text: `🎁 CHEST! +${data.bonus}`, win: true });
            soundEngine.playJackpot();
            setTimeout(() => setFeedback(null), 2000);
            qc.invalidateQueries({ queryKey: getGetPlayerMeQueryKey({ sessionToken: sessionRef.current! }) });
          },
        }
      );
    };
    claimMilestoneRef.current = () => {
      if (!sessionRef.current) return;
      claimMilestoneMutation.mutate(
        { data: { sessionToken: sessionRef.current } },
        {
          onSuccess: (data) => {
            if (data.bonus > 0) {
              setBalance(data.newBalance); balRef.current = data.newBalance;
              setMilestoneBonus(data.bonus);
              soundEngine.playJackpot();
              setTimeout(() => setMilestoneBonus(0), 3000);
              qc.invalidateQueries({ queryKey: getGetPlayerMeQueryKey({ sessionToken: sessionRef.current! }) });
            }
          },
        }
      );
    };
  });

  useEffect(() => {
    shootFnRef.current = (fishId: number, opts?: { skipBurst?: boolean }) => {
      const st = stRef.current;
      if (!sessionRef.current) return;
      const fish = st.fish.find(f => f.id === fishId);
      if (!fish) return;
      const wIdx = weaponRef.current;
      const cost = WEAPONS[wIdx].mult * tierMult;
      const isFreeShot = st.freeShotReady;
      if (!isFreeShot && (balRef.current ?? 0) < cost) return;
      if (isFreeShot) {
        st.freeShotReady = false; st.freeShotHits = 0; setFreeShotMeter(0);
      } else {
        balRef.current = (balRef.current ?? 0) - cost;
        setBalance(balRef.current);
      }
      st.shotCooldown = SHOT_COOLDOWN[wIdx];
      st.muzzleFlash  = 18;
      soundEngine.playShot(wIdx);

      const canvas  = cvs.current!;
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H - 52;
      // Spawn bullet from the actual barrel tip (visual cannon direction), not toward the fish
      const ang = st.cannonAngle;
      const wp  = WEAPONS[wIdx];
      const col = wp.col;
      const muzzleX = cx + Math.cos(ang)*(44+78+10);
      const muzzleY = cy + Math.sin(ang)*(44+78+10);
      const bulletId = st.nextId;
      st.bullets.push({ id: st.nextId++, x: muzzleX, y: muzzleY, tx: fish.x, ty: fish.y, trail: [], done: false, col, targetId: fish.id, speed: wp.speed, radius: wp.radius, hitResult: null, wpIdx: wIdx, bornAt: Date.now() });

      const ft        = FISH[fish.t];
      const feverMult = st.feverFrames > 0 ? 2 : 1;
      const isLucky   = !!fish.lucky;
      const fishValue = isLucky ? 25 : ft.mult * feverMult;
      const fishName  = isLucky ? "⭐ Lucky Fish" : ft.name;

      shootMutation.mutate(
        { data: { sessionToken: sessionRef.current!, game: "fish-hunter", tier: tier as "bronze"|"silver"|"gold", weaponMultiplier: WEAPONS[wIdx].mult, fishName, fishValue, hasSpecialAura: isLucky ? true : undefined } },
        {
          onSuccess: (data) => {
            setBalance(data.newBalance); balRef.current = data.newBalance;

            // Session milestone
            st.sessionShots++;
            if (st.sessionShots > 0 && st.sessionShots % 100 === 0) claimMilestoneRef.current();

            // Free shot meter — every 7 hits earns one free shot
            if (data.hit) {
              st.freeShotHits++;
              if (st.freeShotHits >= 7) { st.freeShotReady = true; }
              setFreeShotMeter(st.freeShotHits >= 7 ? 7 : st.freeShotHits);
            }

            // Win magnitude celebration
            if (data.hit && data.pointsWon > 0) {
              const betAmt = WEAPONS[weaponRef.current].mult * tierMult;
              const ratio = data.pointsWon / Math.max(betAmt, 1);
              if (ratio >= 50) {
                setBigWin({ label: "💎 JACKPOT!", color: "#FFD700", sub: `+${data.pointsWon.toLocaleString()} pts` });
                setTimeout(() => setBigWin(null), 3500);
              } else if (ratio >= 20) {
                setBigWin({ label: "🔥 SUPER WIN!", color: "#FF6B00", sub: `+${data.pointsWon.toLocaleString()} pts` });
                setTimeout(() => setBigWin(null), 2800);
              } else if (ratio >= 8) {
                setBigWin({ label: "⚡ MEGA WIN!", color: "#C026D3", sub: `+${data.pointsWon.toLocaleString()} pts` });
                setTimeout(() => setBigWin(null), 2200);
              } else if (ratio >= 4) {
                setBigWin({ label: "✨ BIG WIN!", color: "#00C853", sub: `+${data.pointsWon.toLocaleString()} pts` });
                setTimeout(() => setBigWin(null), 1800);
              }
            }

            // Attach result to the in-flight bullet — all visual effects (boom, coins, fish death,
            // sound, feedback) fire only when the bullet physically reaches the target.
            const b = stRef.current.bullets.find(bl => bl.id === bulletId);
            if (b) {
              b.hitResult = { hit: data.hit, pointsWon: data.pointsWon, cost, fishGlow: isLucky ? "#FFD700" : ft.glow, fishMult: ft.mult, fishSize: ft.size, isLucky };
            } else {
              // Bullet already arrived before API returned (rare) — apply effects immediately
              if (data.hit) {
                st.streak++; setStreak(st.streak);
                setFeedback({ text: `+${data.pointsWon}`, win: true });
                stRef.current.fish = stRef.current.fish.filter(f => f.id !== fishId);
              } else { st.streak = 0; setStreak(0); setFeedback({ text: `-${cost}`, win: false }); }
              setTimeout(() => setFeedback(null), 900);
            }

            // Mini Jackpot
            if (data.miniJackpot > 0) {
              soundEngine.playJackpot();
              setMiniJackpot(data.miniJackpot);
              setTimeout(() => setMiniJackpot(0), 2500);
            }
            // Grand Jackpot
            if (data.grandJackpot > 0) {
              soundEngine.playJackpot();
              setGrandJackpot(data.grandJackpot);
              setTimeout(() => setGrandJackpot(0), 5000);
            }
            // Kill Trophy
            if (data.killTrophy > 0) {
              setKillTrophy(data.killTrophy);
              setTimeout(() => setKillTrophy(0), 4000);
            }

            qc.invalidateQueries({ queryKey: getGetPlayerMeQueryKey({ sessionToken: sessionRef.current! }) });
          },
          onError: (err) => {
            soundEngine.playMiss();
            const status = (err as { status?: number } | null)?.status;
            // Session expired or invalid — kick back to login so they can re-auth.
            if (status === 401) { logout(); return; }
            // Other errors (network/server): refund the local cost and resolve the
            // in-flight bullet as a miss so it doesn't stay stuck on screen.
            if (!isFreeShot) {
              balRef.current = (balRef.current ?? 0) + cost;
              setBalance(balRef.current);
            } else {
              // Restore the free shot so a server hiccup doesn't burn the player's earned perk.
              stRef.current.freeShotReady = true;
            }
            const bl = stRef.current.bullets.find(x => x.id === bulletId);
            if (bl) bl.hitResult = { hit: false, pointsWon: 0, cost: 0, fishGlow: ft.glow, fishMult: ft.mult, fishSize: ft.size, isLucky: false };
          },
        }
      );

      // ── Multi-fire burst: trap weapon OR multishot powerup (free bonus shots) ──
      if (!opts?.skipBurst) {
        const wp = WEAPONS[wIdx];
        const isTrap = wp.trap === true;
        const isMulti = st.multishot > 0;
        if (isTrap || isMulti) {
          const primary = st.fish.find(f => f.id === fishId);
          if (primary) {
            const reach = isTrap ? 320 : 240;
            const maxN = isTrap ? 4 : 2;
            const neighbors = st.fish
              .filter(f => f.id !== fishId && f.dying === undefined && !f.boss && Math.hypot(f.x - primary.x, f.y - primary.y) < reach)
              .sort((a, b) => Math.hypot(a.x - primary.x, a.y - primary.y) - Math.hypot(b.x - primary.x, b.y - primary.y))
              .slice(0, maxN);
            for (const n of neighbors) fireBonusFnRef.current(n.id, wIdx);
          }
        }
      }
    };
  });

  // ── Free bonus shot: visual-only projectile, no balance/server cost ──
  useEffect(() => {
    fireBonusFnRef.current = (targetId: number, srcWpIdx: number) => {
      const st = stRef.current;
      const target = st.fish.find(f => f.id === targetId);
      if (!target || target.dying !== undefined || target.boss) return;
      const canvas = cvs.current;
      if (!canvas) return;
      const wp = WEAPONS[srcWpIdx];
      const ft = FISH[target.t];
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H - 52;
      const ang = st.cannonAngle;
      const muzzleX = cx + Math.cos(ang)*(44+78+10);
      const muzzleY = cy + Math.sin(ang)*(44+78+10);
      st.bullets.push({
        id: st.nextId++, x: muzzleX, y: muzzleY, tx: target.x, ty: target.y,
        trail: [], done: false, col: wp.col, targetId, speed: wp.speed, radius: wp.radius,
        hitResult: { hit: true, pointsWon: 0, cost: 0, fishGlow: ft.glow, fishMult: ft.mult, fishSize: ft.size, isLucky: false },
        wpIdx: srcWpIdx, bonus: true, bornAt: Date.now(),
      });
    };
  });

  // Sprite loading
  useEffect(() => {
    const fishSrcs = FISH.map(f => f.sprite);
    const bgSrc    = `${BASE}sprites/bg_underwater.png`;
    Promise.all([
      Promise.all(fishSrcs.map(loadImg)),
      loadImg(bgSrc),
    ]).then(([imgs, bg]) => {
      spriteImgs.current = imgs;
      bgImgRef.current   = bg;
      setReady(true);
    });
  }, []);

  const spawnFish = useCallback((W: number, H: number, onScreen: boolean) => {
    const t   = Math.floor(Math.random() * FISH.length);
    const ft  = FISH[t];
    const spd = ft.spd * (0.82 + Math.random() * 0.36);
    const sandY = H * 0.87;
    const sz = ft.size;
    const y  = sz * 0.6 + Math.random() * (sandY - sz * 1.2);
    const goLeft = Math.random() > 0.5;
    const x  = onScreen ? sz + Math.random() * Math.max(10, W - sz*2) : (goLeft ? W+sz*1.6 : -sz*1.6);
    stRef.current.fish.push({ id: stRef.current.nextId++, x, y, vx: goLeft ? -spd : spd, vy: (Math.random()-0.5)*0.3, t, phase: Math.random()*Math.PI*2 });
  }, []);

  const spawnSchool = useCallback((W: number, H: number) => {
    // Spawn 8 clownfish in a V-formation, all sharing a schoolId
    const sid = stRef.current.nextId * 1000 + 1; // unique school id
    const t = 0; // clownfish
    const ft = FISH[t];
    const spd = ft.spd * 0.9;
    const goLeft = Math.random() > 0.5;
    const headX = goLeft ? W + ft.size*1.5 : -ft.size*1.5;
    const headY = H * 0.25 + Math.random() * H * 0.45;
    for (let i = 0; i < 8; i++) {
      const offX = (goLeft ? 1 : -1) * (i * 70);
      const offY = (i % 2 === 0 ? -1 : 1) * Math.ceil(i/2) * 32;
      stRef.current.fish.push({
        id: stRef.current.nextId++,
        x: headX + offX, y: headY + offY,
        vx: goLeft ? -spd : spd, vy: 0,
        t, phase: Math.random()*Math.PI*2, schoolId: sid,
      });
    }
  }, []);

  const spawnPowerUp = useCallback((W: number, H: number) => {
    const kinds: PowerUp["kind"][] = ["slowmo", "multishot", "bomb"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const goLeft = Math.random() > 0.5;
    stRef.current.powerUps.push({
      id: stRef.current.nextId++,
      kind, x: goLeft ? W + 40 : -40, y: H * 0.18 + Math.random() * H * 0.55,
      vx: goLeft ? -1.6 : 1.6, vy: 0, life: 720, phase: Math.random() * Math.PI * 2,
    });
  }, []);

  const spawnLucky = useCallback((W: number, H: number) => {
    const t  = FISH.length - 1; // Megalodon as lucky
    const ft = FISH[t];
    const spd = ft.spd * 2.4;
    const sandY = H * 0.87;
    const sz = ft.size;
    const y  = sz * 0.6 + Math.random() * (sandY - sz * 1.2);
    const goLeft = Math.random() > 0.5;
    const x = goLeft ? W + sz * 1.6 : -sz * 1.6;
    stRef.current.fish.push({ id: stRef.current.nextId++, x, y, vx: goLeft ? -spd : spd, vy: (Math.random()-0.5)*0.3, t, phase: Math.random()*Math.PI*2, lucky: true });
    soundEngine.playLucky();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = cvs.current!;
    const ctx    = canvas.getContext("2d")!;
    const st     = stRef.current;

    // Cap internal render resolution to 1920×1080 — on 4K TVs this cuts pixel
    // count by 4× while the browser GPU upscales CSS-size canvas perfectly.
    const MAX_W = 1920, MAX_H = 1080;
    const resize = () => {
      const cssW = canvas.offsetWidth, cssH = canvas.offsetHeight;
      const s = Math.min(1, MAX_W / cssW, MAX_H / cssH);
      canvas.width = Math.round(cssW * s); canvas.height = Math.round(cssH * s);
    };
    resize(); window.addEventListener("resize", resize);

    for (let i = 0; i < 18; i++) spawnFish(canvas.width, canvas.height, i < 14);
    for (let i = 0; i < 22; i++) {
      st.bubbles.push({ x: Math.random()*canvas.width, y: canvas.height*(0.08+Math.random()*0.78), r: 2+Math.random()*5, vy: 0.3+Math.random()*0.55, phase: Math.random()*Math.PI*2 });
    }
    // ── Background life: deep silhouette fish drifting slowly ──
    st.bgFish = [];
    for (let i = 0; i < 6; i++) {
      const goLeft = Math.random() > 0.5;
      st.bgFish.push({
        x: Math.random() * canvas.width,
        y: canvas.height * (0.18 + Math.random() * 0.6),
        vx: (goLeft ? -1 : 1) * (0.25 + Math.random() * 0.45),
        size: 18 + Math.random() * 28,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.18 + Math.random() * 0.22,
      });
    }

    let spawnTick = 0;
    const loop = () => {
      st.raf = requestAnimationFrame(loop);
      st.t++; spawnTick++;
      const W = canvas.width, H = canvas.height;
      // ── Adaptive quality: auto-disable shadows when fps drops below 42 ──
      const _nt = performance.now();
      if (_lastMs > 0) { _fpsA = _fpsA * 0.94 + (1000 / Math.max(_nt - _lastMs, 1)) * 0.06; }
      _lastMs = _nt;
      if (_fpsA < 42 && hiQ) { hiQ = false; try { Object.defineProperty(ctx, 'shadowBlur', { get() { return 0; }, set(_v) {}, configurable: true }); } catch {} }
      else if (_fpsA > 52 && !hiQ) { hiQ = true; try { delete (ctx as any).shadowBlur; } catch {} }

      // ── Slow-mo + screen shake (juice) ──
      if (st.slowmo > 0) st.slowmo--;
      const tScale = st.slowmo > 0 ? 0.32 : 1;
      if (st.shake > 0.1) st.shake *= 0.88; else st.shake = 0;
      const _sx = st.shake > 0.1 ? (Math.random()-0.5)*st.shake : 0;
      const _sy = st.shake > 0.1 ? (Math.random()-0.5)*st.shake : 0;
      if (_sx || _sy) ctx.translate(_sx, _sy);

      // ── Wave escalation: announce every 60s, increase spawn rate ──
      if (st.t >= st.nextWaveAt) {
        st.waveNum++;
        setWaveBanner(st.waveNum);
        soundEngine.playFeverStart();
        setTimeout(() => setWaveBanner(null), 2400);
        st.nextWaveAt = st.t + 3600;
      }
      const waveSpawnThreshold = Math.max(55, 110 - (st.waveNum - 1) * 8);

      if (spawnTick >= waveSpawnThreshold && st.fish.filter(f => !f.lucky && !f.boss).length < 28) { spawnFish(W, H, false); spawnTick = 0; }

      // ── Boss wave: every ~90s, giant Megalodon with warning banner ──
      if (!st.bossActive && st.t >= st.nextBossAt) {
        st.bossActive = true;
        st.bossSpawnPending = true;
        setBossWarning(true);
        soundEngine.playFeverStart();
        setTimeout(() => setBossWarning(false), 2800);
        setTimeout(() => {
          const W2 = canvas.width, H2 = canvas.height;
          const goLeft = Math.random() > 0.5;
          const tt = FISH.length - 1;
          const ft = FISH[tt];
          const yy = H2 * 0.35 + Math.random() * H2 * 0.25;
          stRef.current.fish.push({ id: stRef.current.nextId++, x: goLeft ? W2 + ft.size*1.8 : -ft.size*1.8, y: yy, vx: goLeft ? -ft.spd*1.4 : ft.spd*1.4, vy: 0, t: tt, phase: Math.random()*Math.PI*2, boss: true, bossHp: 6, bossMaxHp: 6 });
          stRef.current.bossSpawnPending = false;
          setBossHpBar({ hp: 6, max: 6 });
          soundEngine.playJackpot();
        }, 2500);
        st.nextBossAt = st.t + 4800 + Math.floor(Math.random() * 1800);
      }
      if (st.bossActive && !st.bossSpawnPending && !st.fish.some(f => f.boss)) { st.bossActive = false; setBossHpBar(null); }

      // ── School / formation spawn ──
      if (st.t >= st.nextSchoolAt) {
        if (Math.random() < 0.7) spawnSchool(W, H);
        st.nextSchoolAt = st.t + 1500 + Math.floor(Math.random() * 1100);
      }

      // ── Power-up drop spawn ──
      if (st.t >= st.nextPowerUpAt && st.powerUps.length < 2) {
        spawnPowerUp(W, H);
        st.nextPowerUpAt = st.t + 2200 + Math.floor(Math.random() * 1600);
      }

      // ── Multishot timer ──
      if (st.multishot > 0) { st.multishot--; if (st.multishot === 0) setMultishotMs(0); else if (st.multishot % 12 === 0) setMultishotMs(st.multishot); }

      // Lucky creature spawn timer
      if (st.t >= st.nextLuckyAt && !st.fish.some(f => f.lucky)) {
        if (Math.random() < 0.55) spawnLucky(W, H);
        st.nextLuckyAt = st.t + 900 + Math.floor(Math.random() * 500);
      }

      // Bonus chest spawn timer
      if (!st.chest && st.t >= st.nextChestAt) {
        const goLeft = Math.random() > 0.5;
        st.chest = { x: goLeft ? W + 60 : -60, y: H * 0.15 + Math.random() * H * 0.6, vx: goLeft ? -1.4 : 1.4, life: 600 };
        st.nextChestAt = st.t + 1400 + Math.floor(Math.random() * 700);
      }

      // Lucky coin shower spawn
      if (st.t >= st.nextCoinAt) {
        const goLeft = Math.random() > 0.5;
        const count = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          const yy = H * 0.12 + Math.random() * H * 0.68;
          st.luckyCoinList.push({ id: st.nextId++, x: goLeft ? W + 30 + i * 55 : -30 - i * 55, y: yy, y0: yy, vx: goLeft ? -2.1 : 2.1, life: 480, phase: Math.random() * Math.PI * 2 });
        }
        st.nextCoinAt = st.t + 900 + Math.floor(Math.random() * 700);
      }

      const mx = mouseRef.current.x, my = mouseRef.current.y;
      const cannonX = W / 2, cannonY = H - 52;

      // ── Auto-fire target selection ──
      // When auto-fire is on AND the player isn't manually firing,
      // scan the entire upper field for the most valuable nearby fish.
      // Used for BOTH cannon aim tracking and the actual shot,
      // so the cannon visually hunts targets between shots.
      let autoTarget: FishObj | null = null;
      if (autoFireRef.current && !st.mouseDown) {
        let bs = -Infinity;
        for (const fish of st.fish) {
          if (fish.dying !== undefined) continue;
          const dx = fish.x - cannonX, dy = fish.y - cannonY;
          if (dy > -10) continue; // target must be above the cannon
          const dist = Math.hypot(dx, dy) || 1;
          const score = (FISH[fish.t].mult * 1.8) / (dist * 0.004 + 1);
          if (score > bs) { bs = score; autoTarget = fish; }
        }
      }

      // Aim point: the auto target if we have one, otherwise the mouse cursor
      const aimX = autoTarget ? autoTarget.x : mx;
      const aimY = autoTarget ? autoTarget.y : my;

      // Clamp target to upper arc only (cannon can't point downward)
      const rawAngle = Math.atan2(aimY - cannonY, aimX - cannonX);
      const targetAngle = Math.max(-Math.PI + 0.12, Math.min(-0.12, rawAngle));
      let diff = targetAngle - st.cannonAngle;
      while (diff >  Math.PI) diff -= 2*Math.PI;
      while (diff < -Math.PI) diff += 2*Math.PI;
      // Slow rotation while a bullet is in-flight (keeps barrel visually aligned with the shot)
      st.cannonAngle += diff * (st.shotCooldown > 0 ? 0.14 : 0.50);
      // Hard-clamp after smoothing so barrel never dips below horizontal
      st.cannonAngle = Math.max(-Math.PI + 0.12, Math.min(-0.12, st.cannonAngle));

      if (st.shotCooldown > 0) st.shotCooldown--;
      if (st.muzzleFlash  > 0) st.muzzleFlash--;

      if (st.shotCooldown === 0) {
        if (autoTarget) {
          // Auto-fire path: shoot the pre-selected best target directly.
          st.cannonAngle = Math.atan2(autoTarget.y - cannonY, autoTarget.x - cannonX);
          shootFnRef.current(autoTarget.id);
        } else if (st.mouseDown) {
          // Manual fire path: value-weighted targeting within current aim cone.
          const cosA = Math.cos(st.cannonAngle), sinA = Math.sin(st.cannonAngle);
          let best: FishObj | null = null, bestScore = -Infinity;
          for (const fish of st.fish) {
            if (fish.dying !== undefined) continue;
            const dx = fish.x - cannonX, dy = fish.y - cannonY;
            const dot = dx * cosA + dy * sinA;
            if (dot <= 10) continue;
            const perp = Math.abs(dx * sinA - dy * cosA);
            if (perp > 220) continue; // within aim cone
            const dist = Math.hypot(dx, dy) || 1;
            const score = (FISH[fish.t].mult * 1.8) / (perp + 1) / (dist * 0.004 + 1);
            if (score > bestScore) { bestScore = score; best = fish; }
          }
          if (best) {
            st.cannonAngle = Math.atan2(best.y - cannonY, best.x - cannonX);
            shootFnRef.current(best.id);
          }
        }
      }

      // Fever mode
      if (st.feverFrames > 0) {
        st.feverFrames--;
      } else if (st.t >= st.nextFeverAt) {
        st.feverFrames = 540;
        st.nextFeverAt = st.t + 1100 + 540;
        setFever(true);
        soundEngine.playFeverStart();
        setTimeout(() => setFever(false), 8000);
      }

      st.bubbles.forEach(b => { b.y -= b.vy; b.x += Math.sin(b.phase+st.t*0.03)*0.35; b.phase += 0.03; if (b.y < -15) { b.y = H*0.88; b.x = Math.random()*W; } });

      drawBG(ctx, W, H, st.t, st.bubbles, bgImgRef.current);
      drawBgFish(ctx, st.bgFish, W, H);

      // Fever overlay
      if (st.feverFrames > 0) {
        ctx.save();
        ctx.globalAlpha = 0.06 + Math.sin(st.t * 0.14) * 0.04;
        ctx.fillStyle = "#FFD600"; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.18 + Math.sin(st.t * 0.18) * 0.1;
        ctx.strokeStyle = "#FFD600"; ctx.lineWidth = 12;
        ctx.strokeRect(6, 6, W-12, H-12);
        ctx.restore();
      }

      // Fish
      let hoveredId: number | null = null;
      for (const fish of st.fish) {
        if (fish.dying !== undefined) continue;
        if (Math.hypot(fish.x-mx, fish.y-my) < FISH[fish.t].size * 0.9) { hoveredId = fish.id; break; }
      }

      st.fish = st.fish.filter(fish => {
        const ft   = FISH[fish.t];
        // Death animation: fade out over 5 frames after a successful hit
        if (fish.dying !== undefined) {
          fish.dying--;
          if (fish.dying < 0) return false;
        }
        fish.x    += fish.vx * tScale; fish.y += fish.vy * tScale; fish.phase += 0.04;
        if (fish.y < ft.size*0.5 || fish.y > H*0.86-ft.size*0.5) fish.vy *= -1;
        if (Math.abs(fish.x) > W + ft.size*2.5) return false;

        const img   = spriteImgs.current[fish.t];
        const flip  = fish.vx < 0;
        const hover = hoveredId === fish.id;
        const bossMul = fish.boss ? 1.85 : 1;
        const sw    = ft.size * 1.6 * bossMul;
        let   sh    = sw;
        if (img && img.naturalWidth > 0) sh = sw * (img.naturalHeight / img.naturalWidth);

        ctx.save(); ctx.translate(fish.x, fish.y);
        if (flip) ctx.scale(-1, 1);
        ctx.rotate(Math.sin(fish.phase) * 0.045);

        const gr  = hover ? ft.size*1.2 : ft.size*0.9;
        const glowCol = fish.lucky ? "#FFD700" : ft.glow;
        const gw  = ctx.createRadialGradient(0,0,0,0,0,gr);
        gw.addColorStop(0, glowCol+"55"); gw.addColorStop(0.6, glowCol+"18"); gw.addColorStop(1, glowCol+"00");
        ctx.fillStyle=gw; ctx.beginPath(); ctx.ellipse(0,0,gr,gr*0.65,0,0,Math.PI*2); ctx.fill();

        if (hover) {
          ctx.shadowColor=glowCol; ctx.shadowBlur=28;
          ctx.strokeStyle="#fff"; ctx.lineWidth=2.5; ctx.setLineDash([6,4]);
          ctx.beginPath(); ctx.ellipse(0,0,sw*0.54,sh*0.46,0,0,Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
        }

        if (img && img.complete && img.naturalWidth > 0) {
          ctx.shadowColor=glowCol; ctx.shadowBlur=hover?22:8;
          // Death fade-out
          if (fish.dying !== undefined) ctx.globalAlpha = Math.max(0, fish.dying / 5);
          ctx.drawImage(img, -sw/2, -sh/2, sw, sh);
          // White hit flash overlay — bright punch when bullet connects
          if (fish.flash && fish.flash > 0) {
            fish.flash--;
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = (fish.flash / 6) * 0.9;
            ctx.drawImage(img, -sw/2, -sh/2, sw, sh);
            ctx.globalCompositeOperation = "source-over";
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.shadowColor=glowCol; ctx.shadowBlur=18;
          ctx.fillStyle=glowCol;
          ctx.beginPath(); ctx.ellipse(0,0,sw*0.42,sh*0.28,0,0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-sw*0.42,0);ctx.lineTo(-sw*0.65,-sh*0.3);ctx.lineTo(-sw*0.65,sh*0.3);ctx.closePath();ctx.fill();
          ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(sw*0.18,-sh*0.06,sh*0.08,0,Math.PI*2); ctx.fill();
          ctx.fillStyle="#000"; ctx.beginPath(); ctx.arc(sw*0.2,-sh*0.06,sh*0.04,0,Math.PI*2); ctx.fill();
        }
        ctx.shadowBlur=0;
        ctx.restore();

        // Boss aura ring + HP bar
        if (fish.boss && fish.dying === undefined) {
          const pulseA = 0.55 + Math.sin(st.t*0.18)*0.3;
          ctx.save();
          ctx.shadowColor="#FF1744"; ctx.shadowBlur=32;
          ctx.strokeStyle=`rgba(255,23,68,${pulseA})`; ctx.lineWidth=5;
          ctx.beginPath(); ctx.arc(fish.x, fish.y, sw*0.62, 0, Math.PI*2); ctx.stroke();
          ctx.strokeStyle=`rgba(255,140,0,${pulseA*0.6})`; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(fish.x, fish.y, sw*0.74, 0, Math.PI*2); ctx.stroke();
          ctx.font="bold 16px 'Arial Black',Arial,sans-serif"; ctx.textAlign="center"; ctx.textBaseline="bottom";
          ctx.fillStyle="#FF1744"; ctx.shadowColor="#000"; ctx.shadowBlur=4;
          ctx.fillText("👑 MEGA BOSS", fish.x, fish.y - sh*0.52 - 56);
          // HP bar
          if (fish.bossHp !== undefined && fish.bossMaxHp) {
            const bw = sw * 0.95, bh = 12;
            const bx = fish.x - bw/2, byBar = fish.y - sh*0.52 - 38;
            ctx.shadowBlur=0;
            ctx.fillStyle="rgba(0,0,0,0.7)"; ctx.fillRect(bx-2, byBar-2, bw+4, bh+4);
            const pct = fish.bossHp / fish.bossMaxHp;
            const grad = ctx.createLinearGradient(bx, byBar, bx+bw, byBar);
            grad.addColorStop(0, "#FF1744"); grad.addColorStop(0.5, "#FF6D00"); grad.addColorStop(1, "#FFD600");
            ctx.fillStyle = grad; ctx.fillRect(bx, byBar, bw*pct, bh);
            ctx.strokeStyle="#fff"; ctx.lineWidth=1.5; ctx.strokeRect(bx, byBar, bw, bh);
            ctx.font="bold 11px monospace"; ctx.textAlign="center";
            ctx.fillStyle="#fff"; ctx.fillText(`${fish.bossHp} / ${fish.bossMaxHp}`, fish.x, byBar + bh - 1);
          }
          ctx.restore();
        }

        // High-value enemy telegraph — pulsing aura for mult >= 5 (non-boss, non-lucky)
        if (!fish.boss && !fish.lucky && fish.dying === undefined && ft.mult >= 5) {
          const pulseA = 0.32 + Math.sin(st.t*0.13 + fish.phase)*0.22;
          ctx.save();
          ctx.shadowColor=ft.glow; ctx.shadowBlur=18;
          ctx.strokeStyle=`rgba(255,140,0,${pulseA})`; ctx.lineWidth=3;
          ctx.beginPath(); ctx.arc(fish.x, fish.y, sw*0.58, 0, Math.PI*2); ctx.stroke();
          ctx.strokeStyle=`rgba(255,220,80,${pulseA*0.55})`; ctx.lineWidth=1.5;
          ctx.setLineDash([8,5]);
          ctx.beginPath(); ctx.arc(fish.x, fish.y, sw*0.7, 0, Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Badge and lucky ring in canvas space
        if (fish.lucky) {
          drawCoinBadge(ctx, fish.x, fish.y - sh*0.52 - 24, 25);
          const pulseA = 0.45 + Math.sin(st.t*0.15)*0.35;
          ctx.save();
          ctx.shadowColor="#FFD700"; ctx.shadowBlur=24;
          ctx.strokeStyle=`rgba(255,215,0,${pulseA})`; ctx.lineWidth=4;
          ctx.beginPath(); ctx.arc(fish.x, fish.y, sw*0.6, 0, Math.PI*2); ctx.stroke();
          ctx.strokeStyle=`rgba(255,255,255,${pulseA*0.5})`; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(fish.x, fish.y, sw*0.7, 0, Math.PI*2); ctx.stroke();
          ctx.shadowBlur=0;
          ctx.font="bold 13px 'Arial Black',Arial,sans-serif"; ctx.textAlign="center"; ctx.textBaseline="bottom";
          ctx.fillStyle="#FFD700"; ctx.shadowColor="#000"; ctx.shadowBlur=4;
          ctx.fillText("⭐ LUCKY", fish.x, fish.y - sh*0.52 - 52);
          ctx.shadowBlur=0;
          ctx.restore();
        } else {
          drawCoinBadge(ctx, fish.x, fish.y - sh*0.52 - 24, ft.mult);
        }
        return true;
      });

      // Bonus chest
      if (st.chest) {
        st.chest.x += st.chest.vx;
        st.chest.life--;
        drawBonusChest(ctx, st.chest.x, st.chest.y, st.t);
        if (Math.abs(st.chest.x) > W + 120 || st.chest.life <= 0) st.chest = null;
      }

      // Lucky coins
      st.luckyCoinList = st.luckyCoinList.filter(c => {
        c.x += c.vx; c.life--; c.phase += 0.06;
        c.y = c.y0 + Math.sin(c.phase) * 14;
        if (c.life <= 0 || Math.abs(c.x) > W + 80) return false;
        const alpha = Math.min(1, c.life / 40);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = "#FFD700"; ctx.shadowBlur = 18;
        // Coin body
        const cg = ctx.createRadialGradient(c.x - 4, c.y - 4, 0, c.x, c.y, 18);
        cg.addColorStop(0, "#FFF7A0"); cg.addColorStop(0.5, "#FFD700"); cg.addColorStop(1, "#B8860B");
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(c.x, c.y, 18, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#8B6914"; ctx.lineWidth = 1.5; ctx.stroke();
        // Shine
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.beginPath(); ctx.ellipse(c.x - 5, c.y - 5, 6, 3.5, -Math.PI / 4, 0, Math.PI * 2); ctx.fill();
        // $ symbol
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#5A3800"; ctx.font = "bold 13px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("$", c.x, c.y + 1);
        // Click hint ring
        ctx.globalAlpha = alpha * (0.5 + Math.sin(c.phase * 2) * 0.3);
        ctx.strokeStyle = "#FFD700"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, 26, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        return true;
      });

      // ── Power-up drops: update + render ──
      st.powerUps = st.powerUps.filter(p => {
        p.x += p.vx; p.life--; p.phase += 0.05;
        const yy = p.y + Math.sin(p.phase) * 6;
        if (p.life <= 0 || Math.abs(p.x) > W + 60) return false;
        const alpha = Math.min(1, p.life / 60);
        const col = p.kind === "slowmo" ? "#00E5FF" : p.kind === "multishot" ? "#FFB300" : "#FF1744";
        const emoji = p.kind === "slowmo" ? "⏱️" : p.kind === "multishot" ? "✨" : "💥";
        const lbl = p.kind === "slowmo" ? "SLOW-MO" : p.kind === "multishot" ? "MULTISHOT" : "BOMB";
        ctx.save(); ctx.globalAlpha = alpha;
        // Outer halo
        const ring = 30 + Math.sin(p.phase*2)*4;
        ctx.shadowColor = col; ctx.shadowBlur = 26;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.beginPath(); ctx.arc(p.x, yy, ring, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, yy, ring, 0, Math.PI*2); ctx.stroke();
        // Inner emoji
        ctx.shadowBlur = 0; ctx.font = "26px 'Arial Black',Arial,sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff"; ctx.fillText(emoji, p.x, yy + 1);
        // Label
        ctx.font = "bold 10px monospace"; ctx.fillStyle = col; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
        ctx.fillText(lbl, p.x, yy + ring + 12);
        ctx.restore();
        return true;
      });

      // Bullets — fly straight from muzzle; effects fire when bullet physically reaches the target
      st.bullets = st.bullets.filter(b => {
        if (b.done) return false;
        // Orphan cleanup: bullet waiting on a server response that never came (network/401).
        if (!b.hitResult && Date.now() - b.bornAt > 4000) return false;
        const liveTarget = st.fish.find(f => f.id === b.targetId);
        // Hit radius scales with the fish's visual size so bullets feel satisfying.
        // Also guards against overshoot: a bullet moving 72px/frame would skip a 11px threshold.
        const hitRadius = liveTarget ? FISH[liveTarget.t].size * 0.55 + b.radius : 45 + b.radius;
        // Silently steer destination toward fish's live position while bullet is still in flight.
        // Compute dist with OLD tx/ty first — do NOT update while bullet is hovering at the
        // target waiting for the API response, otherwise the hover breaks and bullets orbit the fish.
        const _preDist = Math.hypot(b.tx-b.x, b.ty-b.y);
        if (liveTarget && _preDist > hitRadius + 8) { b.tx = liveTarget.x; b.ty = liveTarget.y; }
        const dx=b.tx-b.x, dy=b.ty-b.y, dist=Math.hypot(dx,dy);
        // Trigger hit if bullet is within hitRadius OR would overshoot the target this frame
        if (dist < hitRadius || dist <= b.speed * tScale) {
          b.x = b.tx; b.y = b.ty; // snap to fish centre
          if (b.hitResult === null) {
            // API still in-flight — hover bullet at impact point and wait
            b.x = b.tx; b.y = b.ty;
            // Animated targeting lock — replaces plain circle
            if(st.fish.some(f=>f.id===b.targetId)){
              const lr=b.radius*3.8;
              ctx.save();
              // Outer rotating dashed ring
              ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(st.t*0.09);
              ctx.globalAlpha=0.9+Math.sin(st.t*0.25)*0.08;
              ctx.strokeStyle=b.col; ctx.shadowColor=b.col; ctx.shadowBlur=22;
              ctx.lineWidth=2.5; ctx.setLineDash([11,8]);
              ctx.beginPath(); ctx.arc(0,0,lr,0,Math.PI*2); ctx.stroke();
              ctx.setLineDash([]); ctx.restore();
              // Counter-rotating inner ring
              ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(-st.t*0.07);
              ctx.globalAlpha=0.45; ctx.strokeStyle="#fff"; ctx.lineWidth=1.5;
              ctx.setLineDash([5,11]); ctx.beginPath(); ctx.arc(0,0,lr*0.6,0,Math.PI*2); ctx.stroke();
              ctx.setLineDash([]); ctx.restore();
              // Corner bracket ticks
              ctx.strokeStyle="#fff"; ctx.globalAlpha=0.95; ctx.lineWidth=2.5;
              ctx.shadowColor=b.col; ctx.shadowBlur=10;
              const bl=lr*0.38;
              [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy])=>{
                ctx.beginPath();
                ctx.moveTo(b.x+sx*lr, b.y+sy*(lr-bl));
                ctx.lineTo(b.x+sx*lr, b.y+sy*lr);
                ctx.lineTo(b.x+sx*(lr-bl), b.y+sy*lr);
                ctx.stroke();
              });
              // Pulsing centre dot
              ctx.globalAlpha=0.6+Math.sin(st.t*0.45)*0.4;
              ctx.fillStyle=b.col; ctx.shadowBlur=14;
              ctx.beginPath(); ctx.arc(b.x,b.y,4,0,Math.PI*2); ctx.fill();
              ctx.restore();
            }
            return true;
          }
          // API result ready — trigger all effects at target's current position
          b.done = true;
          const res = b.hitResult;
          // b.tx/b.ty are already live (updated each frame above) — explosion is exactly where bullet lands
          const bx = b.tx, by = b.ty;
          // ── Bonus-shot fast path: visual kill, no economy, no server, no streak ──
          if (b.bonus) {
            soundEngine.playImpact();
            const targetF = st.fish.find(f => f.id === b.targetId);
            for (let i = 0; i < 8; i++) st.booms.push({ x: bx+(Math.random()-0.5)*60, y: by+(Math.random()-0.5)*60, r: 6+Math.random()*22, life: 1, color: res.fishGlow, ring: i < 3 });
            if (targetF) {
              targetF.flash = 6;
              targetF.dying = 5;
              st.stats.kills++;
              const wpName = WEAPONS[b.wpIdx].name;
              st.killsByWeapon[wpName] = (st.killsByWeapon[wpName] || 0) + 1;
              const kc = st.killsByWeapon[wpName];
              saveKillsFH(st.killsByWeapon);
              if (kc === 100 || kc === 500 || kc === 1000 || kc === 2500) {
                const r = rankForFH(wpName, kc);
                if (r) { setRankBadge({ ...r, kills: kc }); soundEngine.playJackpot(); setTimeout(() => setRankBadge(null), 3500); }
              }
              if (targetF.schoolId !== undefined) {
                const siblings = st.fish.filter(f => f.id !== targetF.id && f.schoolId === targetF.schoolId && f.dying === undefined && !f.boss).slice(0, 2);
                for (const sib of siblings) fireBonusFnRef.current(sib.id, b.wpIdx);
              }
            } else {
              st.fish = st.fish.filter(f => f.id !== b.targetId);
            }
            return false;
          }
          if (res.hit) {
            soundEngine.playImpact();
            soundEngine.playHit(res.fishMult);
            st.streak++; setStreak(st.streak);
            if (st.streak % 5 === 0) soundEngine.playJackpot();
            else if (st.streak === 3) soundEngine.playStreak3();
            if (res.pointsWon >= 50) soundEngine.playJackpot();
            const bonusLabel = st.streak >= 5 ? ` 🔥×${st.streak}` : st.streak >= 3 ? " ⚡STREAK!" : "";
            const luckyLabel = res.isLucky ? " ⭐LUCKY!" : "";
            setFeedback({ text: `+${res.pointsWon}${bonusLabel}${luckyLabel}`, win: true });
            for (let i = 0; i < 16; i++) st.booms.push({ x: bx+(Math.random()-0.5)*res.fishSize*0.5, y: by+(Math.random()-0.5)*res.fishSize*0.5, r: 8+Math.random()*38, life: 1, color: res.fishGlow, ring: i<6 });
            const coinCount = res.isLucky ? 30 : (st.streak >= 3 ? 20 : 12);
            for (let i = 0; i < coinCount; i++) { const a = Math.PI*2*i/coinCount; st.coins.push({ x: bx, y: by, vx: Math.cos(a)*(1.5+Math.random()*3.5), vy: Math.sin(a)*(1.5+Math.random()*3)-2.5, life: 1 }); }

            // ── JUICE: screen shake, slow-mo, floating damage number ──
            const ratio = res.pointsWon / Math.max(res.cost, 1);
            const targetFish = st.fish.find(f => f.id === b.targetId);
            const isBoss = !!targetFish?.boss;
            const shakeAmt = isBoss ? 28 : res.isLucky ? 22 : ratio >= 20 ? 24 : ratio >= 8 ? 16 : ratio >= 4 ? 9 : 4;
            st.shake = Math.max(st.shake, shakeAmt);
            if (ratio >= 8 || res.isLucky || isBoss) st.slowmo = Math.max(st.slowmo, isBoss ? 32 : ratio >= 20 ? 26 : 18);
            const big = ratio >= 8 || res.isLucky || isBoss;
            st.damageNums.push({ x: bx, y: by - res.fishSize*0.4, vx: (Math.random()-0.5)*1.6, vy: -2.8-(big?1.6:0), life: 1, text: `+${res.pointsWon}`, color: big ? "#FFD700" : "#FFEE58", size: big ? 56 : 38 });
            // ── Track session stats ──
            st.stats.kills++;
            st.stats.totalEarned += res.pointsWon;
            st.stats.totalSpent  += res.cost;
            if (res.pointsWon > st.stats.biggestWin) st.stats.biggestWin = res.pointsWon;
            if (st.streak > st.stats.longestStreak) st.stats.longestStreak = st.streak;
            // ── Hit flash + boss multi-hit logic ──
            if (targetFish) {
              targetFish.flash = 6;
              if (targetFish.boss && targetFish.bossHp !== undefined && targetFish.bossHp > 1) {
                // Boss survives this hit — decrement HP, no death yet
                targetFish.bossHp--;
                setBossHpBar({ hp: targetFish.bossHp, max: targetFish.bossMaxHp || 6 });
              } else {
                // Final blow (or normal fish)
                targetFish.dying = 5;
                if (isBoss) {
                  st.stats.bossKills++;
                  setBossHpBar(null);
                  // BONUS damage numbers for boss kill
                  for (let i = 0; i < 4; i++) st.damageNums.push({ x: bx+(Math.random()-0.5)*140, y: by-30-i*22, vx: (Math.random()-0.5)*2, vy: -3.2-i*0.4, life: 1, text: "+BOSS", color: "#FFD700", size: 40 });
                  st.shake = Math.max(st.shake, 36);
                  st.slowmo = Math.max(st.slowmo, 40);
                }
                // ── Per-weapon kill counter + rank milestones (uses weapon at fire time) ──
                const wpName = WEAPONS[b.wpIdx].name;
                st.killsByWeapon[wpName] = (st.killsByWeapon[wpName] || 0) + 1;
                const kc = st.killsByWeapon[wpName];
                saveKillsFH(st.killsByWeapon);
                if (kc === 100 || kc === 500 || kc === 1000 || kc === 2500) {
                  const r = rankForFH(wpName, kc);
                  if (r) { setRankBadge({ ...r, kills: kc }); soundEngine.playJackpot(); setTimeout(() => setRankBadge(null), 3500); }
                }
                // ── School chain: free bonus shots at up to 2 siblings ──
                if (targetFish.schoolId !== undefined) {
                  const siblings = st.fish.filter(f => f.id !== targetFish.id && f.schoolId === targetFish.schoolId && f.dying === undefined && !f.boss).slice(0, 2);
                  for (const sib of siblings) fireBonusFnRef.current(sib.id, b.wpIdx);
                }
              }
            } else {
              st.fish = st.fish.filter(f => f.id !== b.targetId);
            }
          } else {
            soundEngine.playMiss();
            st.streak = 0; setStreak(0);
            setFeedback({ text: `-${res.cost}`, win: false });
            st.ripples.push({ x: bx, y: by, r: 0, life: 1 });
            st.damageNums.push({ x: bx, y: by - 40, vx: 0, vy: -2.2, life: 0.9, text: `-${res.cost}`, color: "#FF5252", size: 32 });
            st.stats.misses++;
            st.stats.totalSpent += res.cost;
          }
          setTimeout(() => setFeedback(null), 900);
          return false;
        }
        b.x+=(dx/dist)*b.speed*tScale; b.y+=(dy/dist)*b.speed*tScale;
        b.trail.push({x:b.x,y:b.y}); if(b.trail.length>22) b.trail.shift();
        // Glowing orb trail — filled spheres fading tail→head, no choppy line segments
        for(let i=(hiQ?0:1);i<b.trail.length;i+=(hiQ?1:2)){const a=(i+1)/b.trail.length;ctx.save();ctx.globalAlpha=a*0.62;ctx.shadowColor=b.col;ctx.shadowBlur=8+14*a;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.trail[i].x,b.trail[i].y,b.radius*(0.28+a*0.68),0,Math.PI*2);ctx.fill();ctx.restore();}
        // Bright plasma head: outer halo + white-hot core
        ctx.save();ctx.globalAlpha=0.48;ctx.shadowColor=b.col;ctx.shadowBlur=44;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*2.4,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.save();ctx.shadowColor=b.col;ctx.shadowBlur=22;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.x,b.y,b.radius+2,0,Math.PI*2);ctx.fill();ctx.shadowColor="#fff";ctx.shadowBlur=10;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(b.x,b.y,b.radius*0.55,0,Math.PI*2);ctx.fill();ctx.restore();
        // Weapon-specific visual effects keyed on radius bucket
        if(b.radius<=9&&b.trail.length>0){
          // Pistol/Rifle/Railgun: clean directional tracer lines
          const _tr=b.trail[b.trail.length-1];
          const _d=Math.hypot(b.x-_tr.x,b.y-_tr.y)||1;
          const _fx=(b.x-_tr.x)/_d,_fy=(b.y-_tr.y)/_d;
          ctx.save();ctx.strokeStyle=b.col;ctx.lineWidth=1.8;ctx.globalAlpha=0.52;ctx.shadowColor=b.col;ctx.shadowBlur=7;
          ctx.beginPath();ctx.moveTo(b.x-_fy*2.5,b.y+_fx*2.5);ctx.lineTo(b.x-_fy*2.5-_fx*13,b.y+_fx*2.5-_fy*13);ctx.stroke();
          ctx.beginPath();ctx.moveTo(b.x+_fy*2.5,b.y-_fx*2.5);ctx.lineTo(b.x+_fy*2.5-_fx*13,b.y-_fx*2.5-_fy*13);ctx.stroke();
          ctx.restore();
        } else if(b.radius<=13){
          ctx.save();ctx.globalAlpha=0.12;ctx.strokeStyle=b.col;ctx.lineWidth=4;ctx.shadowColor=b.col;ctx.shadowBlur=14;
          ctx.beginPath();ctx.arc(b.x,b.y,b.radius*3.0,0,Math.PI*2);ctx.stroke();
          ctx.globalAlpha=0.06;ctx.lineWidth=7;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*4.2,0,Math.PI*2);ctx.stroke();
          ctx.restore();
        } else {
          if(b.trail.length>5){const bp=b.trail[Math.max(0,b.trail.length-6)];ctx.save();ctx.globalAlpha=0.42;ctx.strokeStyle=b.col;ctx.lineWidth=1.5;ctx.shadowColor=b.col;ctx.shadowBlur=8;[b.radius*0.30,b.radius*0.46,b.radius*0.36].forEach((br,_i)=>{ctx.beginPath();ctx.arc(bp.x+Math.cos((_i+1)*2.1)*10,bp.y+(_i-1)*8,br,0,Math.PI*2);ctx.stroke();});ctx.restore();}
        }
        return true;
      });

      // Explosions
      st.booms = st.booms.filter(bm => {
        bm.life-=0.045; if(bm.life<=0) return false;
        ctx.save();ctx.globalAlpha=bm.life;
        if(bm.ring){ctx.strokeStyle=bm.color;ctx.lineWidth=5*bm.life;ctx.shadowColor=bm.color;ctx.shadowBlur=14;ctx.beginPath();ctx.arc(bm.x,bm.y,bm.r*(2-bm.life),0,Math.PI*2);ctx.stroke();}
        else{ctx.fillStyle=bm.color;ctx.shadowColor=bm.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(bm.x,bm.y,bm.r*bm.life,0,Math.PI*2);ctx.fill();}
        ctx.restore();return true;
      });

      // Coins
      st.coins = st.coins.filter(c => {
        c.life-=0.028;if(c.life<=0)return false;c.x+=c.vx;c.y+=c.vy;c.vy+=0.12;
        ctx.save();ctx.globalAlpha=c.life;ctx.shadowColor="#FFD600";ctx.shadowBlur=8;ctx.fillStyle="#FFD600";ctx.strokeStyle="#B8860B";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(c.x,c.y,9,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle="#fff";ctx.font="bold 7px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("$",c.x,c.y);ctx.restore();return true;
      });

      // Ripples
      st.ripples = st.ripples.filter(r => {
        r.life-=0.04;if(r.life<=0)return false;r.r+=5;
        ctx.save();ctx.globalAlpha=r.life*0.6;ctx.strokeStyle="#fff";ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,Math.PI*2);ctx.stroke();ctx.restore();return true;
      });

      // Floating damage numbers with physics
      st.damageNums = st.damageNums.filter(dn => {
        dn.x += dn.vx * tScale; dn.y += dn.vy * tScale; dn.vy += 0.12 * tScale;
        dn.life -= 0.013 * tScale;
        if (dn.life <= 0) return false;
        ctx.save();
        ctx.globalAlpha = Math.min(1, dn.life * 1.4);
        const fs = Math.round(dn.size * (0.7 + dn.life * 0.4));
        ctx.font = `900 ${fs}px 'Arial Black', monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 5; ctx.strokeStyle = "#000";
        ctx.shadowColor = dn.color; ctx.shadowBlur = 18;
        ctx.strokeText(dn.text, dn.x, dn.y);
        ctx.fillStyle = dn.color;
        ctx.fillText(dn.text, dn.x, dn.y);
        ctx.restore();
        return true;
      });

      // Mouse crosshair — shows exact aim point
      const wcol = WEAPONS[weaponRef.current].col;
      ctx.save();
      ctx.translate(mx, my);
      ctx.shadowColor=wcol; ctx.shadowBlur=12;
      ctx.strokeStyle=wcol; ctx.lineWidth=1.5; ctx.globalAlpha=0.75;
      const CH=10;
      ctx.beginPath();ctx.moveTo(-CH,0);ctx.lineTo(-4,0);ctx.moveTo(4,0);ctx.lineTo(CH,0);
      ctx.moveTo(0,-CH);ctx.lineTo(0,-4);ctx.moveTo(0,4);ctx.lineTo(0,CH);ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=1;ctx.shadowBlur=0;
      ctx.restore();
      // ── Auto-fire targeting reticle + cannon scan ring ──
      if (st.mouseDown) {
        const cosA=Math.cos(st.cannonAngle),sinA=Math.sin(st.cannonAngle);
        let aimF:FishObj|null=null,aimScore=-Infinity;
        for(const fish of st.fish){
          const dx=fish.x-cannonX,dy=fish.y-cannonY;
          if(dx*cosA+dy*sinA<=10)continue;
          const perp=Math.abs(dx*sinA-dy*cosA);if(perp>130)continue;
          const dist=Math.hypot(dx,dy)||1;
          const sc=(FISH[fish.t].mult*1.8)/(perp+1)/(dist*0.004+1);
          if(sc>aimScore){aimScore=sc;aimF=fish;}
        }
        if(aimF){
          const rf=30+Math.sin(st.t*0.2)*4;
          ctx.save();ctx.globalAlpha=0.65+Math.sin(st.t*0.28)*0.2;
          ctx.strokeStyle="#FF4422";ctx.lineWidth=2;ctx.shadowColor="#FF4422";ctx.shadowBlur=14;
          ctx.beginPath();ctx.arc(aimF.x,aimF.y,rf,0,Math.PI*2);ctx.stroke();
          ctx.lineWidth=1.5;const cl=10;
          ctx.beginPath();ctx.moveTo(aimF.x-(rf+4),aimF.y);ctx.lineTo(aimF.x-(rf+cl+4),aimF.y);ctx.stroke();
          ctx.beginPath();ctx.moveTo(aimF.x+(rf+4),aimF.y);ctx.lineTo(aimF.x+(rf+cl+4),aimF.y);ctx.stroke();
          ctx.beginPath();ctx.moveTo(aimF.x,aimF.y-(rf+4));ctx.lineTo(aimF.x,aimF.y-(rf+cl+4));ctx.stroke();
          ctx.beginPath();ctx.moveTo(aimF.x,aimF.y+(rf+4));ctx.lineTo(aimF.x,aimF.y+(rf+cl+4));ctx.stroke();
          ctx.restore();
        }
        // Dashed scan arc on cannon base (top half only)
        ctx.save();ctx.globalAlpha=0.28+Math.sin(st.t*0.22)*0.10;
        ctx.strokeStyle="#FF4422";ctx.lineWidth=1.8;ctx.shadowColor="#FF3311";ctx.shadowBlur=16;
        ctx.setLineDash([7,5]);ctx.lineDashOffset=-(st.t*0.8);
        ctx.beginPath();ctx.arc(cannonX,cannonY,58+Math.sin(st.t*0.18)*3,-Math.PI,0);ctx.stroke();
        ctx.setLineDash([]);ctx.restore();
      }
      drawCannon(ctx, cannonX, cannonY, st.cannonAngle, wcol, st.t, st.muzzleFlash > 0);

      // Undo screen shake translation
      if (_sx || _sy) ctx.translate(-_sx, -_sy);
    };
    loop();

    canvas.style.touchAction = "none";

    const onMove = (e: PointerEvent) => {
      const r=canvas.getBoundingClientRect();
      const sx=canvas.width/r.width, sy=canvas.height/r.height;
      mouseRef.current={x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy};
    };
    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      if (!ambientRef.current) { soundEngine.startUnderwaterAmbient(); ambientRef.current=true; }
      const r   = canvas.getBoundingClientRect();
      const sx=canvas.width/r.width, sy=canvas.height/r.height;
      const mx2 = (e.clientX-r.left)*sx, my2 = (e.clientY-r.top)*sy;
      mouseRef.current = { x: mx2, y: my2 };

      // Lucky coin click check
      const hitCoin = st.luckyCoinList.find(c => Math.hypot(c.x - mx2, c.y - my2) < 26);
      if (hitCoin) {
        st.luckyCoinList = st.luckyCoinList.filter(c => c.id !== hitCoin.id);
        claimChestRef.current();
        return;
      }
      // Chest click check
      if (st.chest && Math.hypot(st.chest.x - mx2, st.chest.y - my2) < 55) {
        st.chest = null;
        claimChestRef.current();
        return;
      }
      // Power-up pickup
      const hitPu = st.powerUps.find(p => Math.hypot(p.x - mx2, p.y - my2) < 40);
      if (hitPu) {
        st.powerUps = st.powerUps.filter(p => p.id !== hitPu.id);
        if (hitPu.kind === "slowmo") {
          st.slowmo = Math.max(st.slowmo, 720);
          soundEngine.playJackpot();
          setFeedback({ text: "⏱️ SLOW-MO!", win: true });
        } else if (hitPu.kind === "multishot") {
          st.multishot = 480; setMultishotMs(480);
          soundEngine.playFeverStart();
          setFeedback({ text: "✨ MULTISHOT 8s!", win: true });
        } else if (hitPu.kind === "bomb") {
          soundEngine.playJackpot();
          setFeedback({ text: "💥 BOMB!", win: true });
          const targets = st.fish.filter(f => f.dying === undefined && !f.boss).slice(0, 10);
          const curWpIdx = weaponRef.current;
          targets.forEach((f, i) => setTimeout(() => {
            const cur = stRef.current.fish.find(ff => ff.id === f.id);
            if (cur && cur.dying === undefined) fireBonusFnRef.current(f.id, curWpIdx);
          }, i * 120));
        }
        setTimeout(() => setFeedback(null), 1200);
        return;
      }

      st.mouseDown = true;
      // On click: find fish nearest to the click position (within 450px)
      let best: FishObj | null = null, bestD = 450;
      for (const fish of st.fish) {
        if (fish.dying !== undefined) continue;
        const d = Math.hypot(fish.x-mx2, fish.y-my2);
        if (d < bestD) { bestD=d; best=fish; }
      }
      if (best && st.shotCooldown === 0) {
        // Snap cannon instantly toward clicked fish so bullet trajectory matches cannon visuals
        st.cannonAngle = Math.atan2(best.y - (canvas.height - 52), best.x - canvas.width / 2);
        shootFnRef.current(best.id);
      }
    };
    const onPointerUp = () => { st.mouseDown = false; };

    canvas.addEventListener("pointermove",  onMove);
    canvas.addEventListener("pointerdown",  onPointerDown);
    canvas.addEventListener("pointerup",    onPointerUp);
    canvas.addEventListener("pointercancel",onPointerUp);
    return () => {
      cancelAnimationFrame(st.raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove",   onMove);
      canvas.removeEventListener("pointerdown",   onPointerDown);
      canvas.removeEventListener("pointerup",     onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      soundEngine.stopAmbient();
      Object.assign(st, { fish:[], bullets:[], booms:[], coins:[], ripples:[], bubbles:[], flashes:[], chest:null, powerUps:[], bgFish:[] });
    };
  }, [ready, spawnFish, spawnLucky, spawnSchool, spawnPowerUp]);

  const w    = WEAPONS[weapon];
  const cost = w.mult * tierMult;
  const tierCol: Record<string,string> = { bronze:"text-orange-400", silver:"text-slate-300", gold:"text-yellow-400" };

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden select-none" style={{ background:"#001520" }}>
      {/* HUD */}
      <div className="z-10 bg-black/70 backdrop-blur-sm border-b border-cyan-400/20 px-2 sm:px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => {
            soundEngine.playClick();
            if (stRef.current.stats.kills > 0 || stRef.current.stats.misses > 0) setShowSummary(true);
            else setLocation("/lobby");
          }} className="text-cyan-300 hover:text-white h-8 px-2 sm:px-3">
            <ArrowLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Lobby</span>
          </Button>
          <span className="text-lg sm:text-xl">🐟</span>
          <span className="hidden md:inline text-white font-bold uppercase tracking-widest text-sm">Fish Hunter</span>
          <span className={`font-mono text-[10px] sm:text-xs capitalize font-bold ${tierCol[tier]}`}>[{tier}]</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Free shot meter */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-black/50 border border-purple-500/40 rounded-full px-2 sm:px-3 py-1 sm:py-1.5">
            <span className="hidden sm:inline text-[10px] font-mono font-bold text-purple-400 uppercase tracking-widest">FREE</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-purple-500/60 transition-all duration-150"
                  style={{ background: i < freeShotMeter ? (freeShotMeter >= 7 ? "#FFD700" : "#A855F7") : "rgba(168,85,247,0.12)" ,
                    boxShadow: i < freeShotMeter && freeShotMeter >= 7 ? "0 0 6px #FFD700" : i < freeShotMeter ? "0 0 4px #A855F7" : "none" }} />
              ))}
            </div>
            {freeShotMeter >= 7 && <span className="text-[9px] sm:text-[10px] font-mono font-black text-yellow-400 animate-pulse">READY!</span>}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 bg-black/50 border border-yellow-400/40 rounded-full px-2.5 sm:px-4 py-1 sm:py-1.5">
            <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400" />
            <span className="font-mono font-bold text-yellow-400 text-sm sm:text-xl">{(balance ?? player?.balance ?? 0).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden cursor-crosshair">
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#001520] z-10">
            <div className="text-6xl mb-4">🌊</div>
            <div className="text-cyan-300 font-mono text-lg animate-pulse">Loading ocean…</div>
          </div>
        )}
        <canvas ref={cvs} className="w-full h-full block" />

        {/* Big Win overlay */}
        {bigWin && (
          <div className="absolute inset-0 pointer-events-none z-50 flex flex-col items-center justify-center">
            <div className="animate-bounce text-center">
              <div className="text-6xl font-black tracking-widest px-10 py-5 rounded-3xl border-4"
                style={{ background:"rgba(0,0,0,0.88)", color: bigWin.color,
                  borderColor: bigWin.color,
                  textShadow:`0 0 40px ${bigWin.color}, 0 0 80px ${bigWin.color}88`,
                  boxShadow:`0 0 60px ${bigWin.color}44` }}>
                {bigWin.label}
              </div>
              <div className="text-2xl font-black font-mono mt-3" style={{ color: bigWin.color, textShadow:`0 0 20px ${bigWin.color}` }}>
                {bigWin.sub}
              </div>
            </div>
          </div>
        )}

        {/* Fever Mode */}
        {fever && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-bounce">
            <div className="text-3xl font-black tracking-widest px-6 py-2 rounded-full border-2 border-yellow-400"
              style={{ background:"rgba(0,0,0,0.75)", color:"#FFD600", textShadow:"0 0 30px #FFD600, 0 0 60px #FF8800" }}>
              🔥 FEVER TIME! 2× PAYOUT 🔥
            </div>
          </div>
        )}

        {/* Streak counter — animated combo meter */}
        {streak >= 2 && (() => {
          const tier = streak >= 15 ? { c:"#FF00E5", g:"#FF00E5", lbl:"GODLIKE" } : streak >= 10 ? { c:"#FF1744", g:"#FF1744", lbl:"INSANE" } : streak >= 5 ? { c:"#FF6D00", g:"#FFD600", lbl:"ON FIRE" } : { c:"#FFD600", g:"#FF8800", lbl:"STREAK" };
          const next = streak >= 15 ? 20 : streak >= 10 ? 15 : streak >= 5 ? 10 : 5;
          const prev = streak >= 15 ? 15 : streak >= 10 ? 10 : streak >= 5 ? 5 : 2;
          const pct  = Math.min(1, (streak - prev) / (next - prev));
          return (
            <div className="absolute top-4 right-4 pointer-events-none z-20" style={{ animation: streak >= 5 ? "pulse 0.8s ease-in-out infinite" : undefined }}>
              <div className="text-right">
                <div className="text-[10px] font-mono uppercase tracking-widest font-bold" style={{ color: tier.c, textShadow:`0 0 8px ${tier.c}` }}>{tier.lbl}</div>
                <div className="text-5xl font-black font-mono leading-none" style={{ color: tier.c, textShadow:`0 0 24px ${tier.g}, 0 0 48px ${tier.c}88`, transform: streak >= 10 ? `scale(${1 + Math.sin(Date.now()*0.012)*0.06})` : undefined }}>×{streak}</div>
                <div className="h-1.5 w-32 mt-1 bg-black/60 rounded-full overflow-hidden border border-white/15">
                  <div className="h-full transition-all duration-150" style={{ width: `${pct*100}%`, background: tier.c, boxShadow:`0 0 12px ${tier.c}` }} />
                </div>
                <div className="text-[9px] font-mono text-white/40 mt-0.5">→ {next}</div>
              </div>
            </div>
          );
        })()}

        {/* Feedback */}
        {feedback && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className={`text-7xl font-black drop-shadow-2xl ${feedback.win ? "text-yellow-300" : "text-red-400"}`}
              style={{ textShadow: feedback.win ? "0 0 40px #FFD60099" : "0 0 20px #FF000066", WebkitTextStroke:"2px rgba(0,0,0,0.5)" }}>
              {feedback.text}
            </div>
          </div>
        )}

        {/* Mini Jackpot */}
        {miniJackpot > 0 && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none z-30 animate-bounce">
            <div className="text-2xl font-black tracking-widest px-8 py-3 rounded-2xl border-2 border-orange-400 shadow-2xl"
              style={{ background:"rgba(0,0,0,0.85)", color:"#FF8C00", textShadow:"0 0 25px #FF8C00" }}>
              💰 MINI JACKPOT! +{miniJackpot}
            </div>
          </div>
        )}

        {/* Grand Jackpot */}
        {grandJackpot > 0 && (
          <div className="absolute inset-0 pointer-events-none z-40 flex flex-col items-center justify-center">
            <div className="animate-bounce text-center">
              <div className="text-6xl mb-3">🎰</div>
              <div className="text-5xl font-black tracking-widest px-10 py-5 rounded-3xl border-4 border-yellow-400"
                style={{ background:"rgba(0,0,0,0.9)", color:"#FFD600", textShadow:"0 0 40px #FFD600, 0 0 80px #FF8800", boxShadow:"0 0 60px rgba(255,214,10,0.5)" }}>
                🏆 GRAND JACKPOT! +{grandJackpot}
              </div>
              <div className="text-6xl mt-3">🎰</div>
            </div>
          </div>
        )}

        {/* Kill Trophy */}
        {killTrophy > 0 && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-30">
            <div className="text-2xl font-black tracking-widest px-8 py-3 rounded-2xl border-2 border-yellow-400 shadow-2xl"
              style={{ background:"rgba(0,0,0,0.85)", color:"#FFD700", textShadow:"0 0 20px #FFD700" }}>
              🏅 KILL TROPHY! {killTrophy} kills! +{killTrophy} pts
            </div>
          </div>
        )}

        {/* Session Milestone */}
        {milestoneBonus > 0 && (
          <div className="absolute top-20 right-6 pointer-events-none z-30">
            <div className="text-xl font-black tracking-widest px-6 py-3 rounded-xl border-2 border-cyan-400"
              style={{ background:"rgba(0,0,0,0.85)", color:"#00E5FF", textShadow:"0 0 20px #00E5FF" }}>
              🎯 MILESTONE! +{milestoneBonus} pts
            </div>
          </div>
        )}

        {/* Wave banner — every 60s */}
        {waveBanner !== null && (
          <div className="absolute inset-x-0 top-1/4 pointer-events-none z-40 flex flex-col items-center" style={{ animation:"bounce 1s ease-in-out infinite" }}>
            <div className="text-7xl font-black tracking-widest px-12 py-6 rounded-3xl border-4 border-cyan-400"
              style={{ background:"rgba(0,20,40,0.92)", color:"#00E5FF", textShadow:"0 0 30px #00E5FF, 0 0 60px #00C9FF", boxShadow:"0 0 60px rgba(0,229,255,0.5)" }}>
              🌊 WAVE {waveBanner} 🌊
            </div>
            <div className="text-cyan-200/80 font-mono mt-3 text-sm tracking-widest">⚓ DENSER WATERS ⚓</div>
          </div>
        )}

        {/* Rank badge unlocked toast */}
        {rankBadge && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
            <div className="text-center px-8 py-5 rounded-2xl border-4 animate-bounce"
              style={{ background:"rgba(0,0,0,0.92)", borderColor: rankBadge.color, boxShadow: `0 0 60px ${rankBadge.color}88` }}>
              <div className="text-6xl mb-2">🏆</div>
              <div className="text-xl font-black tracking-widest mb-1" style={{ color: rankBadge.color }}>RANK UNLOCKED</div>
              <div className="text-3xl font-black" style={{ color: rankBadge.color, textShadow: `0 0 20px ${rankBadge.color}` }}>{rankBadge.tier} {rankBadge.name}</div>
              <div className="text-xs font-mono text-white/60 mt-2">{rankBadge.kills.toLocaleString()} KILLS</div>
            </div>
          </div>
        )}

        {/* Multishot indicator */}
        {multishotMs > 0 && (
          <div className="absolute top-16 left-4 pointer-events-none z-30">
            <div className="px-3 py-1.5 rounded-full border-2 border-orange-400 bg-black/80 flex items-center gap-2"
              style={{ boxShadow:"0 0 18px rgba(255,179,0,0.5)" }}>
              <span className="text-lg">✨</span>
              <span className="text-xs font-black font-mono text-orange-300 tracking-widest">MULTISHOT {Math.ceil(multishotMs/60)}s</span>
            </div>
          </div>
        )}

        {/* Boss HP bar (HUD) */}
        {bossHpBar && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none z-30">
            <div className="px-5 py-2 rounded-xl border-2 border-red-500 bg-black/85" style={{ boxShadow:"0 0 24px rgba(255,23,68,0.5)" }}>
              <div className="text-[10px] font-mono font-bold text-red-300 uppercase tracking-widest mb-1 text-center">👑 BOSS HP</div>
              <div className="w-64 h-3 rounded-full overflow-hidden bg-black/60 border border-red-500/40">
                <div className="h-full transition-all duration-200" style={{ width: `${(bossHpBar.hp / bossHpBar.max) * 100}%`, background:"linear-gradient(90deg, #FF1744, #FF6D00, #FFD600)", boxShadow:"0 0 12px #FF1744" }} />
              </div>
              <div className="text-center text-xs font-mono font-bold text-white mt-1">{bossHpBar.hp} / {bossHpBar.max}</div>
            </div>
          </div>
        )}

        {/* Boss warning */}
        {bossWarning && (
          <div className="absolute inset-x-0 top-1/3 pointer-events-none z-40 flex flex-col items-center" style={{ animation:"pulse 0.5s ease-in-out infinite" }}>
            <div className="text-7xl mb-2">⚠️</div>
            <div className="text-5xl font-black tracking-[0.3em] px-10 py-4 rounded-2xl border-4 border-red-500"
              style={{ background:"rgba(20,0,0,0.92)", color:"#FF1744", textShadow:"0 0 30px #FF1744, 0 0 60px #FF000088", boxShadow:"0 0 60px rgba(255,23,68,0.6)" }}>
              MEGA BOSS INCOMING
            </div>
            <div className="text-cyan-200/70 font-mono mt-2 text-sm tracking-widest">⚓ MASSIVE PAYOUT ⚓</div>
          </div>
        )}

        {/* End-of-session summary */}
        {showSummary && (() => {
          const s = stRef.current.stats;
          const net = s.totalEarned - s.totalSpent;
          const acc = s.kills + s.misses > 0 ? Math.round((s.kills / (s.kills + s.misses)) * 100) : 0;
          return (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
              <div className="w-full max-w-md rounded-3xl border-2 border-cyan-400/60 overflow-hidden shadow-2xl"
                style={{ background:"linear-gradient(135deg, #001828, #002a44)", boxShadow:"0 0 80px rgba(0,229,255,0.4)" }}>
                <div className="px-6 pt-6 pb-4 text-center border-b border-cyan-400/20">
                  <div className="text-6xl mb-2">🎣</div>
                  <h2 className="text-3xl font-black text-cyan-300 tracking-widest">SESSION COMPLETE</h2>
                  <p className="text-cyan-200/60 text-xs font-mono mt-1">FISH HUNTER · {tier.toUpperCase()}</p>
                </div>
                <div className="px-6 py-5 grid grid-cols-2 gap-3">
                  <div className="bg-black/40 rounded-xl p-3 border border-cyan-500/20"><div className="text-[10px] font-mono text-cyan-300/60 uppercase tracking-widest">Fish Slain</div><div className="text-3xl font-black font-mono" style={{ color:"#00E5FF" }}>{s.kills}</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-red-500/20"><div className="text-[10px] font-mono text-red-300/60 uppercase tracking-widest">Misses</div><div className="text-3xl font-black font-mono" style={{ color:"#FF5252" }}>{s.misses}</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-yellow-500/20"><div className="text-[10px] font-mono text-yellow-300/60 uppercase tracking-widest">Biggest Win</div><div className="text-2xl font-black font-mono" style={{ color:"#FFD700" }}>+{s.biggestWin.toLocaleString()}</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-orange-500/20"><div className="text-[10px] font-mono text-orange-300/60 uppercase tracking-widest">Best Streak</div><div className="text-2xl font-black font-mono" style={{ color:"#FF6D00" }}>×{s.longestStreak}</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-green-500/20"><div className="text-[10px] font-mono text-green-300/60 uppercase tracking-widest">Accuracy</div><div className="text-2xl font-black font-mono" style={{ color:"#00C853" }}>{acc}%</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-purple-500/20"><div className="text-[10px] font-mono text-purple-300/60 uppercase tracking-widest">Bosses Slain</div><div className="text-2xl font-black font-mono" style={{ color:"#C77DFF" }}>{s.bossKills}</div></div>
                </div>
                <div className="px-6 pb-3"><div className="bg-black/60 rounded-xl p-4 border-2" style={{ borderColor: net >= 0 ? "#00C85388" : "#FF525288" }}>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-white/50 text-center">Net Result</div>
                  <div className="text-4xl font-black font-mono text-center mt-1" style={{ color: net >= 0 ? "#00C853" : "#FF5252", textShadow: net >= 0 ? "0 0 20px #00C85388" : "0 0 20px #FF525288" }}>{net >= 0 ? "+" : ""}{net.toLocaleString()}</div>
                </div></div>
                <div className="px-6 pb-6 flex gap-2">
                  <Button onClick={() => { soundEngine.playClick(); setShowSummary(false); }} variant="outline" className="flex-1 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">Keep Playing</Button>
                  <Button onClick={() => { soundEngine.playClick(); setLocation("/lobby"); }} className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-black tracking-wider">EXIT TO LOBBY</Button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Weapon bar */}
      <div className="z-10 bg-black/80 backdrop-blur-sm border-t border-cyan-400/15 px-2 sm:px-5 py-2 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar">
          <span className="hidden sm:inline text-muted-foreground text-[10px] font-mono uppercase tracking-widest mr-1">Weapon</span>
          <button
            onClick={() => { setAutoFire(v => !v); soundEngine.playWeaponSelect(); }}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border transition-all mr-1"
            style={{ color: autoFire ? "#000" : "#FFD700", borderColor: autoFire ? "#FFD700" : "#ffffff22", background: autoFire ? "#FFD700" : "rgba(0,0,0,0.55)", boxShadow: autoFire ? "0 0 18px #FFD70099" : "none", transform: autoFire ? "scale(1.08)" : "scale(1)" }}>
            <span className="text-base leading-none">⚡</span>
            <span className="text-[10px] font-bold">{autoFire ? "AUTO ON" : "AUTO"}</span>
          </button>
          {WEAPONS.map((wp, i) => (
            <button key={i} onClick={() => { setWeapon(i); soundEngine.playWeaponSelect(); }}
              className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border transition-all"
              style={{ color:wp.col, borderColor:weapon===i?wp.col:"#ffffff11", background:weapon===i?wp.bg:"rgba(0,0,0,0.55)", boxShadow:weapon===i?`0 0 18px ${wp.col}55`:"none", transform:weapon===i?"scale(1.12)":"scale(1)" }}>
              <span className="text-base leading-none">{wp.emoji}</span>
              <span className="text-[10px] font-bold">{wp.name}</span>
              <span className="text-white/35 text-[9px]">{wp.mult}×</span>
            </button>
          ))}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">Bet</div>
          <div className="text-base sm:text-2xl font-bold font-mono whitespace-nowrap" style={{ color:w.col }}>{cost.toLocaleString()}<span className="text-[10px] sm:text-base"> pts</span></div>
        </div>
      </div>
    </div>
  );
}
