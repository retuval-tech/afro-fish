import { useEffect, useRef, useState, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { usePlayerAuth } from "@/hooks/use-auth";
import { useGetPlayerMe, getGetPlayerMeQueryKey, useGameShoot, useClaimChestBonus, useClaimMilestoneBonus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { soundEngine } from "@/lib/sound-engine";

const BASE = import.meta.env.BASE_URL ?? "/";

const DRAGONS = [
  { mult: 1,  name: "Whelp",        sprite: `${BASE}sprites/dragon_whelp.png`,  glow: "#00B4D8", size: 82,  spd: 8.5  },
  { mult: 2,  name: "Fire Drake",   sprite: `${BASE}sprites/dragon_fire.png`,   glow: "#FF6D00", size: 112, spd: 6.8  },
  { mult: 3,  name: "Forest Wyrm",  sprite: `${BASE}sprites/dragon_forest.png`, glow: "#38B000", size: 135, spd: 5.2  },
  { mult: 5,  name: "Shadow Drake", sprite: `${BASE}sprites/dragon_shadow.png`, glow: "#9D4EDD", size: 165, spd: 3.6  },
  { mult: 10, name: "Dragon King",  sprite: `${BASE}sprites/dragon_king.png`,   glow: "#FFD60A", size: 208, spd: 2.2  },
];
const SHOT_COOLDOWN = [4, 6, 9, 13, 18, 24];

const WEAPONS = [
  { mult: 1,  name: "Dart",   col: "#00B4D8", bg: "#001A22", emoji: "🗡️", speed: 72, radius: 5,  trap: false },
  { mult: 2,  name: "Bolt",   col: "#FF6D00", bg: "#221000", emoji: "⚔️", speed: 66, radius: 7,  trap: false },
  { mult: 3,  name: "Flare",  col: "#38B000", bg: "#0D1A00", emoji: "🔥", speed: 55, radius: 11, trap: false },
  { mult: 5,  name: "Rune",   col: "#C77DFF", bg: "#1A0033", emoji: "🌸", speed: 80, radius: 8,  trap: false },
  { mult: 10, name: "Divine", col: "#FFD60A", bg: "#332500", emoji: "💛", speed: 50, radius: 18, trap: false },
  { mult: 4,  name: "SpellNet", col: "#FF00E5", bg: "#330033", emoji: "🕸️", speed: 42, radius: 14, trap: true  },
];

const KILL_LS_KEY_DK = "afrofish_dk_kills_v1";
function loadKillsDK(): Record<string, number> { try { return JSON.parse(localStorage.getItem(KILL_LS_KEY_DK) || "{}"); } catch { return {}; } }
function saveKillsDK(m: Record<string, number>) { try { localStorage.setItem(KILL_LS_KEY_DK, JSON.stringify(m)); } catch {} }
function rankForDK(weaponName: string, kills: number): { name: string; tier: string; color: string } | null {
  if (kills >= 2500) return { name: weaponName, tier: "DRAGONLORD", color: "#FF00E5" };
  if (kills >= 1000) return { name: weaponName, tier: "ARCHMAGE",  color: "#FFD600" };
  if (kills >= 500)  return { name: weaponName, tier: "ADEPT",     color: "#FF6D00" };
  if (kills >= 100)  return { name: weaponName, tier: "NOVICE",    color: "#C77DFF" };
  return null;
}

const TIER: Record<string, number> = { bronze: 1, silver: 10, gold: 100 };
const EMBER_COLS = ["#FF6D00","#FF3D00","#FFD600","#FF9100","#FF1744","#FF6B35"];

interface DragonObj { id: number; x: number; y: number; vx: number; vy: number; t: number; phase: number; wingPhase: number; lucky?: boolean; boss?: boolean; bossHp?: number; bossMaxHp?: number; flash?: number; dying?: number; schoolId?: number; }
interface DamageNum { x: number; y: number; vx: number; vy: number; life: number; text: string; color: string; size: number; }
interface PowerUp   { id: number; kind: "slowmo"|"multishot"|"bomb"; x: number; y: number; vx: number; vy: number; life: number; phase: number; }
interface LavaBubble { x: number; y: number; r: number; vy: number; life: number; }
interface HitResult { hit: boolean; pointsWon: number; cost: number; dragonGlow: string; dragonMult: number; dragonSize: number; isLucky: boolean; }
interface Bullet    { id: number; x: number; y: number; tx: number; ty: number; trail: {x:number;y:number}[]; done: boolean; col: string; targetId: number; speed: number; radius: number; hitResult: HitResult | null; wpIdx: number; bonus?: boolean; bornAt: number; }
interface Boom      { x: number; y: number; r: number; life: number; color: string; ring: boolean; }
interface Ember     { x: number; y: number; vx: number; vy: number; life: number; col: string; }
interface Score     { x: number; y: number; text: string; life: number; color: string; }
interface Chest     { x: number; y: number; vx: number; life: number; }

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
  ctx.translate(x, y); ctx.scale(pulse, pulse);
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(0,30,30,7,0,0,Math.PI*2); ctx.fill();
  const bg = ctx.createLinearGradient(0,0,0,32);
  bg.addColorStop(0,"#8B6914"); bg.addColorStop(1,"#4A3408");
  ctx.fillStyle=bg; ctx.strokeStyle="#FFD700"; ctx.lineWidth=2;
  ctx.shadowColor="#FFD700"; ctx.shadowBlur=22;
  ctx.beginPath(); ctx.roundRect(-26,2,52,30,4); ctx.fill(); ctx.stroke();
  const lid=ctx.createLinearGradient(0,-26,0,2);
  lid.addColorStop(0,"#C49A1E"); lid.addColorStop(1,"#8B6914");
  ctx.fillStyle=lid; ctx.beginPath(); ctx.roundRect(-26,-26,52,28,[8,8,0,0]); ctx.fill(); ctx.stroke();
  ctx.shadowBlur=0; ctx.fillStyle="#FFD700"; ctx.beginPath(); ctx.roundRect(-26,-4,52,8,2); ctx.fill();
  ctx.shadowColor="#FFF"; ctx.shadowBlur=8; ctx.beginPath(); ctx.arc(0,-1,7,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#8B6914"; ctx.beginPath(); ctx.arc(0,-1,4,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0;
  for(let i=0;i<5;i++){const a=(Math.PI*2*i/5)+t*0.06;const r=40+Math.sin(t*0.09+i)*5;ctx.save();ctx.translate(Math.cos(a)*r,Math.sin(a)*r);ctx.fillStyle="#FFD700";ctx.font="12px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("✦",0,0);ctx.restore();}
  ctx.font="bold 12px monospace"; ctx.textAlign="center"; ctx.textBaseline="bottom";
  ctx.fillStyle="#FFD700"; ctx.shadowColor="#000"; ctx.shadowBlur=4;
  ctx.fillText("CLICK!",0,-38); ctx.shadowBlur=0;
  ctx.restore();
}

function drawCoinBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, mult: number) {
  const r = mult >= 10 ? 28 : mult >= 5 ? 24 : 20;
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,0.7)"; ctx.shadowBlur=8;
  ctx.fillStyle="#7A4800"; ctx.beginPath(); ctx.arc(cx+2,cy+2.5,r,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
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

let hiQ = true; // adaptive rendering quality — auto-disabled on slow devices
let _fpsA = 60, _lastMs = 0;

function drawDkBG(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, embers: Ember[], bgImg: HTMLImageElement | null) {
  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,"#0A0018");bg.addColorStop(0.35,"#1A0030");bg.addColorStop(0.7,"#2D0A00");bg.addColorStop(1,"#1A0500");
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  if(bgImg&&bgImg.complete&&bgImg.naturalWidth>0){ctx.save();ctx.globalAlpha=0.82;ctx.drawImage(bgImg,0,0,W,H);ctx.restore();const v=ctx.createRadialGradient(W/2,H/2,H*0.15,W/2,H/2,H*0.88);v.addColorStop(0,"rgba(0,0,0,0)");v.addColorStop(1,"rgba(0,0,0,0.55)");ctx.fillStyle=v;ctx.fillRect(0,0,W,H);}
  if (hiQ) {
    ctx.save();ctx.globalCompositeOperation="screen";
    for(let i=0;i<4;i++){const rx=W*(0.12+i*0.26);const rg=ctx.createLinearGradient(rx,H,rx,0);rg.addColorStop(0,`rgba(255,60,0,${0.04+i%2*0.02})`);rg.addColorStop(0.4,`rgba(200,20,0,0.02)`);rg.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=rg;ctx.fillRect(rx-30,0,60,H);}
    ctx.globalCompositeOperation="source-over";ctx.restore();
  }
  if (hiQ) {
    for(const e of embers){if(e.life<=0)continue;ctx.save();ctx.globalAlpha=Math.min(e.life,0.9);ctx.shadowColor=e.col;ctx.shadowBlur=6;ctx.fillStyle=e.col;ctx.beginPath();ctx.arc(e.x,e.y,2.2,0,Math.PI*2);ctx.fill();ctx.restore();}
  } else {
    ctx.save();
    for(const e of embers){if(e.life<=0||Math.random()>0.4)continue;ctx.globalAlpha=Math.min(e.life,0.85);ctx.fillStyle=e.col;ctx.beginPath();ctx.arc(e.x,e.y,2.2,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  const groundY=H*0.82;
  const gr2=ctx.createLinearGradient(0,groundY,0,H);
  gr2.addColorStop(0,"rgba(120,30,0,0.8)");gr2.addColorStop(0.4,"rgba(80,15,0,0.9)");gr2.addColorStop(1,"rgba(20,0,0,1)");
  ctx.fillStyle=gr2;ctx.beginPath();ctx.moveTo(0,groundY);
  for(let gx=0;gx<=W;gx+=24)ctx.lineTo(gx,groundY+Math.sin(gx*0.025+t*0.004)*5);
  ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();
  for(let pi=0;pi<9;pi++){const px=W*(0.05+pi*0.115);const ph=30+(pi*17%55);const pp=t*0.009+pi*0.6;ctx.strokeStyle=`hsl(${10+pi%20},80%,${28+pi%16}%)`;ctx.lineWidth=3;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(px,groundY);for(let s=0;s<5;s++){const ox=Math.sin(pp+s*1.1)*7;ctx.quadraticCurveTo(px+ox*1.5,groundY-s*(ph/5)-ph/10,px+ox,groundY-(ph/5)*(s+1));}ctx.stroke();}
}

function drawArcaneCannon(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, col: string, t: number, shooting: boolean) {
  ctx.save();ctx.translate(cx,cy);
  // Shadow
  ctx.fillStyle="rgba(0,0,0,0.45)";ctx.beginPath();ctx.ellipse(0,16,54,11,0,0,Math.PI*2);ctx.fill();
  // Outer rotating ring + orbs
  ctx.save();ctx.rotate(-t*0.025);
  for(let i=0;i<6;i++){const a=(Math.PI*2*i)/6;ctx.shadowColor=col;ctx.shadowBlur=10;ctx.fillStyle=col+"99";ctx.beginPath();ctx.arc(Math.cos(a)*54,Math.sin(a)*54,6,0,Math.PI*2);ctx.fill();}
  ctx.shadowBlur=0;ctx.restore();
  // Base disc
  const bd=ctx.createRadialGradient(-10,-10,4,0,0,46);
  bd.addColorStop(0,"#24003a");bd.addColorStop(0.5,"#15002a");bd.addColorStop(1,"#08001a");
  ctx.fillStyle=bd;ctx.beginPath();ctx.arc(0,0,46,0,Math.PI*2);ctx.fill();
  ctx.shadowColor=col;ctx.shadowBlur=24+Math.sin(t*0.08)*10;ctx.strokeStyle=col;ctx.lineWidth=3.2;ctx.stroke();ctx.shadowBlur=0;
  // Inner rotating ring
  ctx.save();ctx.rotate(t*0.04);
  ctx.strokeStyle=col+"55";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,30,0,Math.PI*2);ctx.stroke();
  ctx.restore();
  // Center arcane jewel
  const pulse=0.6+Math.sin(t*0.09)*0.4;
  const jg=ctx.createRadialGradient(0,0,0,0,0,13*pulse);jg.addColorStop(0,"#fff");jg.addColorStop(0.4,col);jg.addColorStop(1,col+"00");
  ctx.fillStyle=jg;ctx.beginPath();ctx.arc(0,0,13*pulse,0,Math.PI*2);ctx.fill();
  // Barrel (with angle rotation)
  ctx.save();ctx.rotate(angle);
  const BASE_R=46,BARREL=82,TIP=BASE_R+BARREL+12;
  // Aim dash
  ctx.setLineDash([5,9]);ctx.strokeStyle=col+"44";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(TIP,0);ctx.lineTo(TIP+100,0);ctx.stroke();ctx.setLineDash([]);
  // Barrel body
  ctx.shadowColor=col;ctx.shadowBlur=34;ctx.fillStyle=col;
  ctx.beginPath();ctx.roundRect(BASE_R,-12,BARREL,24,[0,0,7,7]);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle="#120018";
  ctx.beginPath();ctx.roundRect(BASE_R+3,-7,BARREL-6,14,[0,0,5,5]);ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.22)";ctx.beginPath();ctx.roundRect(BASE_R+8,-4,BARREL-22,7,3);ctx.fill();
  // Barrel rings — flush with bounds (-12..12)
  [0.3,0.6,0.85].forEach(f=>{const rx=BASE_R+BARREL*f;ctx.shadowColor=col;ctx.shadowBlur=10;ctx.fillStyle=col;ctx.beginPath();ctx.roundRect(rx-5,-12,10,24,3);ctx.fill();ctx.shadowBlur=0;});
  // Muzzle cap
  ctx.shadowColor=col;ctx.shadowBlur=34;ctx.fillStyle="#15002a";ctx.beginPath();ctx.arc(TIP,0,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=3.5;ctx.stroke();
  ctx.shadowBlur=0;ctx.fillStyle="#000";ctx.beginPath();ctx.arc(TIP,0,7,0,Math.PI*2);ctx.fill();
  // Pulsing core
  const pg=ctx.createRadialGradient(TIP,0,0,TIP,0,12*pulse);
  pg.addColorStop(0,"#fff");pg.addColorStop(0.5,col);pg.addColorStop(1,col+"00");
  ctx.fillStyle=pg;ctx.beginPath();ctx.arc(TIP,0,12*pulse,0,Math.PI*2);ctx.fill();
  // Muzzle flash with arcane rays
  if(shooting){
    ctx.shadowColor="#fff";ctx.shadowBlur=80;ctx.globalAlpha=0.95;
    ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(TIP,0,28,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=col;ctx.globalAlpha=0.8;ctx.beginPath();ctx.arc(TIP,0,18,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=0.85;ctx.strokeStyle="#fff";ctx.lineWidth=2.5;
    for(let i=0;i<12;i++){const ra=(Math.PI*2*i)/12;const len=18+Math.sin(i*97.4)*14;ctx.beginPath();ctx.moveTo(TIP+Math.cos(ra)*16,Math.sin(ra)*16);ctx.lineTo(TIP+Math.cos(ra)*(16+len),Math.sin(ra)*(16+len));ctx.stroke();}
    ctx.globalAlpha=1;ctx.shadowBlur=0;
  }
  ctx.restore();ctx.restore();
}

export default function DragonKingGame() {
  const search   = useSearch();
  const tier     = (new URLSearchParams(search).get("tier") || "bronze") as string;
  const tierMult = TIER[tier] ?? 1;
  const [, setLocation] = useLocation();
  const { sessionToken, logout } = usePlayerAuth();
  const qc = useQueryClient();
  const shootMutation        = useGameShoot();
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

  const [balance,        setBalance]        = useState<number | null>(null);
  const [weapon,         setWeapon]         = useState(0);
  const [autoFire,       setAutoFire]       = useState(false);
  const autoFireRef = useRef(false);
  useEffect(() => { autoFireRef.current = autoFire; }, [autoFire]);
  const [feedback,       setFeedback]       = useState<{ text: string; win: boolean } | null>(null);
  const [ready,          setReady]          = useState(false);
  const [streak,         setStreak]         = useState(0);
  const [fever,          setFever]          = useState(false);
  const [miniJackpot,    setMiniJackpot]    = useState(0);
  const [grandJackpot,   setGrandJackpot]   = useState(0);
  const [killTrophy,     setKillTrophy]     = useState(0);
  const [milestoneBonus, setMilestoneBonus] = useState(0);
  const [bossWarning,    setBossWarning]    = useState(false);
  const [showSummary,    setShowSummary]    = useState(false);
  const [waveBanner,     setWaveBanner]     = useState<number | null>(null);
  const [rankBadge,      setRankBadge]      = useState<{ name: string; tier: string; color: string; kills: number } | null>(null);
  const [multishotMs,    setMultishotMs]    = useState(0);
  const [bossHpBar,      setBossHpBar]      = useState<{ hp: number; max: number } | null>(null);

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
  const shootFnRef = useRef<(dragonId: number, opts?: { skipBurst?: boolean }) => void>(() => {});
  const fireBonusFnRef = useRef<(targetId: number, srcWpIdx: number) => void>(() => {});
  const claimChestRef     = useRef<() => void>(() => {});
  const claimMilestoneRef = useRef<() => void>(() => {});

  const stRef = useRef({
    dragons: [] as DragonObj[], bullets: [] as Bullet[], booms: [] as Boom[],
    embers:  [] as Ember[],     scores:  [] as Score[],
    chest: null as Chest | null,
    nextId: 0, t: 0, raf: 0, cannonAngle: -Math.PI/2,
    shotCooldown: 0, mouseDown: false, muzzleFlash: 0,
    streak: 0, feverFrames: 0, nextFeverAt: 1800,
    nextLuckyAt: 2200, nextChestAt: 3500, sessionShots: 0,
    // ── Juice & variety state ──
    shake: 0, slowmo: 0, multishot: 0,
    damageNums: [] as DamageNum[],
    nextBossAt: 5400, bossActive: false, bossSpawnPending: false,
    stats: { kills: 0, misses: 0, biggestWin: 0, longestStreak: 0, totalEarned: 0, totalSpent: 0, bossKills: 0 },
    // ── New: schools, power-ups, waves, background life, kill counters ──
    powerUps: [] as PowerUp[],
    lavaBubbles: [] as LavaBubble[],
    nextSchoolAt: 1800, nextPowerUpAt: 2400, nextLightningAt: 600, lightning: 0,
    waveNum: 1, nextWaveAt: 3600,
    killsByWeapon: loadKillsDK() as Record<string, number>,
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
    shootFnRef.current = (dragonId: number, opts?: { skipBurst?: boolean }) => {
      const st = stRef.current;
      if (!sessionRef.current) return;
      const dragon = st.dragons.find(d => d.id === dragonId);
      if (!dragon) return;
      const wIdx = weaponRef.current;
      const cost = WEAPONS[wIdx].mult * tierMult;
      if ((balRef.current ?? 0) < cost) return;

      balRef.current = (balRef.current ?? 0) - cost;
      setBalance(balRef.current);
      st.shotCooldown = SHOT_COOLDOWN[wIdx];
      st.muzzleFlash  = 18;
      soundEngine.playShot(wIdx);

      const canvas = cvs.current!;
      const W = canvas.width, H = canvas.height;
      const cx=W/2, cy=H-52;
      // Spawn bullet from the actual barrel tip (visual cannon direction), not toward the dragon
      const ang = st.cannonAngle;
      const wp  = WEAPONS[wIdx];
      const col = wp.col;
      const muzzleX = cx + Math.cos(ang)*(46+82+12);
      const muzzleY = cy + Math.sin(ang)*(46+82+12);
      const bulletId = st.nextId;
      st.bullets.push({ id: st.nextId++, x: muzzleX, y: muzzleY, tx: dragon.x, ty: dragon.y, trail: [], done: false, col, targetId: dragon.id, speed: wp.speed, radius: wp.radius, hitResult: null, wpIdx: wIdx, bornAt: Date.now() });

      const dt      = DRAGONS[dragon.t];
      const feverMult = st.feverFrames > 0 ? 2 : 1;
      const isLucky = !!dragon.lucky;
      const fishValue = isLucky ? 25 : dt.mult * feverMult;
      const fishName  = isLucky ? "⭐ Lucky Dragon" : dt.name;

      shootMutation.mutate(
        { data: { sessionToken: sessionRef.current!, game: "dragon-king", tier: tier as "bronze"|"silver"|"gold", weaponMultiplier: WEAPONS[wIdx].mult, fishName, fishValue, hasSpecialAura: isLucky ? true : undefined } },
        {
          onSuccess: (data) => {
            setBalance(data.newBalance); balRef.current = data.newBalance;

            // Session milestone
            st.sessionShots++;
            if (st.sessionShots > 0 && st.sessionShots % 200 === 0) claimMilestoneRef.current();

            // Attach result to the in-flight bullet — all visual effects (boom, embers, dragon death,
            // sound, feedback) fire only when the bullet physically reaches the target.
            const b = stRef.current.bullets.find(bl => bl.id === bulletId);
            if (b) {
              b.hitResult = { hit: data.hit, pointsWon: data.pointsWon, cost, dragonGlow: isLucky ? "#FFD700" : dt.glow, dragonMult: dt.mult, dragonSize: dt.size, isLucky };
            } else {
              // Bullet already arrived before API returned (rare) — apply effects immediately
              if (data.hit) {
                st.streak++; setStreak(st.streak);
                setFeedback({ text: `SLAIN! +${data.pointsWon}`, win: true });
                stRef.current.dragons = stRef.current.dragons.filter(d => d.id !== dragonId);
              } else { st.streak = 0; setStreak(0); setFeedback({ text: `DODGED! -${cost}`, win: false }); }
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
            soundEngine.playMiss(true);
            const status = (err as { status?: number } | null)?.status;
            if (status === 401) { logout(); return; }
            balRef.current = (balRef.current ?? 0) + cost;
            setBalance(balRef.current);
            const bl = stRef.current.bullets.find(x => x.id === bulletId);
            if (bl) bl.hitResult = { hit: false, pointsWon: 0, cost: 0, dragonGlow: dt.glow, dragonMult: dt.mult, dragonSize: dt.size, isLucky: false };
          },
        }
      );

      // ── Multi-fire burst: trap weapon OR multishot powerup (free bonus shots) ──
      if (!opts?.skipBurst) {
        const wp = WEAPONS[wIdx];
        const isTrap = wp.trap === true;
        const isMulti = st.multishot > 0;
        if (isTrap || isMulti) {
          const primary = st.dragons.find(d => d.id === dragonId);
          if (primary) {
            const reach = isTrap ? 320 : 240;
            const maxN = isTrap ? 4 : 2;
            const neighbors = st.dragons
              .filter(d => d.id !== dragonId && d.dying === undefined && !d.boss && Math.hypot(d.x - primary.x, d.y - primary.y) < reach)
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
      const target = st.dragons.find(d => d.id === targetId);
      if (!target || target.dying !== undefined || target.boss) return;
      const canvas = cvs.current;
      if (!canvas) return;
      const wp = WEAPONS[srcWpIdx];
      const dt = DRAGONS[target.t];
      const W = canvas.width, H = canvas.height;
      const cx = W/2, cy = H - 52;
      const ang = st.cannonAngle;
      const muzzleX = cx + Math.cos(ang)*(46+82+12);
      const muzzleY = cy + Math.sin(ang)*(46+82+12);
      st.bullets.push({
        id: st.nextId++, x: muzzleX, y: muzzleY, tx: target.x, ty: target.y,
        trail: [], done: false, col: wp.col, targetId, speed: wp.speed, radius: wp.radius,
        hitResult: { hit: true, pointsWon: 0, cost: 0, dragonGlow: dt.glow, dragonMult: dt.mult, dragonSize: dt.size, isLucky: false },
        wpIdx: srcWpIdx, bonus: true, bornAt: Date.now(),
      });
    };
  });

  useEffect(() => {
    const bgSrc = `${BASE}sprites/bg_dragonking.png`;
    Promise.all([
      Promise.all(DRAGONS.map(d => loadImg(d.sprite))),
      loadImg(bgSrc),
    ]).then(([imgs, bg]) => {
      spriteImgs.current = imgs;
      bgImgRef.current   = bg;
      setReady(true);
    });
  }, []);

  const spawnDragon = useCallback((W: number, H: number, onScreen: boolean) => {
    const t   = Math.floor(Math.random() * DRAGONS.length);
    const dt  = DRAGONS[t];
    const spd = dt.spd * (0.82 + Math.random() * 0.36);
    const sz  = dt.size;
    const y   = sz * 0.6 + Math.random() * (H*0.74 - sz*1.2);
    const goLeft = Math.random() > 0.5;
    const x   = onScreen ? sz + Math.random() * Math.max(10, W-sz*2) : (goLeft ? W+sz*2 : -sz*2);
    stRef.current.dragons.push({ id: stRef.current.nextId++, x, y, vx: goLeft?-spd:spd, vy: (Math.random()-0.5)*0.4, t, phase: Math.random()*Math.PI*2, wingPhase: Math.random()*Math.PI*2 });
  }, []);

  const spawnSchool = useCallback((W: number, H: number) => {
    // V-formation of 8 Whelps sharing a schoolId
    const sid = stRef.current.nextId * 1000 + 1;
    const t = 0;
    const dt = DRAGONS[t];
    const spd = dt.spd * 0.9;
    const goLeft = Math.random() > 0.5;
    const headX = goLeft ? W + dt.size*1.5 : -dt.size*1.5;
    const headY = H * 0.22 + Math.random() * H * 0.45;
    for (let i = 0; i < 8; i++) {
      const offX = (goLeft ? 1 : -1) * (i * 75);
      const offY = (i % 2 === 0 ? -1 : 1) * Math.ceil(i/2) * 34;
      stRef.current.dragons.push({
        id: stRef.current.nextId++,
        x: headX + offX, y: headY + offY,
        vx: goLeft ? -spd : spd, vy: 0,
        t, phase: Math.random()*Math.PI*2, wingPhase: Math.random()*Math.PI*2, schoolId: sid,
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

  const spawnLuckyDragon = useCallback((W: number, H: number) => {
    const t  = DRAGONS.length - 1; // Dragon King as lucky
    const dt = DRAGONS[t];
    const spd = dt.spd * 2.4;
    const sz  = dt.size;
    const y   = sz * 0.6 + Math.random() * (H*0.74 - sz*1.2);
    const goLeft = Math.random() > 0.5;
    const x = goLeft ? W + sz*2 : -sz*2;
    stRef.current.dragons.push({ id: stRef.current.nextId++, x, y, vx: goLeft?-spd:spd, vy: (Math.random()-0.5)*0.4, t, phase: Math.random()*Math.PI*2, wingPhase: Math.random()*Math.PI*2, lucky: true });
    soundEngine.playLucky();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = cvs.current!;
    const ctx    = canvas.getContext("2d")!;
    const st     = stRef.current;

    const MAX_W = 1920, MAX_H = 1080;
    const resize = () => {
      const cssW=canvas.offsetWidth, cssH=canvas.offsetHeight;
      const s=Math.min(1,MAX_W/cssW,MAX_H/cssH);
      canvas.width=Math.round(cssW*s); canvas.height=Math.round(cssH*s);
    };
    resize(); window.addEventListener("resize", resize);

    for (let i=0;i<15;i++) spawnDragon(canvas.width,canvas.height,i<10);
    for (let i=0;i<40;i++) st.embers.push({x:Math.random()*canvas.width,y:canvas.height+Math.random()*30,vx:(Math.random()-0.5)*0.9,vy:-(0.6+Math.random()*1.7),life:Math.random(),col:EMBER_COLS[Math.floor(Math.random()*EMBER_COLS.length)]});

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
      const waveSpawnThreshold = Math.max(70, 145 - (st.waveNum - 1) * 10);
      if (spawnTick >= waveSpawnThreshold && st.dragons.filter(d => !d.lucky && !d.boss).length < 24) { spawnDragon(W,H,false); spawnTick=0; }

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
      // ── Lightning flash trigger ──
      if (st.lightning > 0) st.lightning--;
      else if (st.t >= st.nextLightningAt) { st.lightning = 8; st.nextLightningAt = st.t + 450 + Math.floor(Math.random() * 900); }
      // ── Lava bubbles drift up from bottom ──
      if (Math.random() < 0.12 && st.lavaBubbles.length < 18) {
        st.lavaBubbles.push({ x: Math.random()*W, y: H + 20, r: 4 + Math.random()*10, vy: 0.4 + Math.random()*0.9, life: 1 });
      }
      st.lavaBubbles = st.lavaBubbles.filter(lb => { lb.y -= lb.vy; lb.life -= 0.004; return lb.life > 0 && lb.y > -20; });

      // ── Boss wave: every ~90s, ancient dragon with warning banner ──
      if (!st.bossActive && st.t >= st.nextBossAt) {
        st.bossActive = true;
        st.bossSpawnPending = true;
        setBossWarning(true);
        soundEngine.playFeverStart();
        setTimeout(() => setBossWarning(false), 2800);
        setTimeout(() => {
          const W2 = canvas.width, H2 = canvas.height;
          const goLeft = Math.random() > 0.5;
          const tt = DRAGONS.length - 1;
          const dt = DRAGONS[tt];
          const yy = H2 * 0.30 + Math.random() * H2 * 0.25;
          stRef.current.dragons.push({ id: stRef.current.nextId++, x: goLeft ? W2 + dt.size*1.8 : -dt.size*1.8, y: yy, vx: goLeft ? -dt.spd*1.4 : dt.spd*1.4, vy: 0, t: tt, phase: Math.random()*Math.PI*2, wingPhase: 0, boss: true, bossHp: 6, bossMaxHp: 6 });
          stRef.current.bossSpawnPending = false;
          setBossHpBar({ hp: 6, max: 6 });
          soundEngine.playJackpot();
        }, 2500);
        st.nextBossAt = st.t + 4800 + Math.floor(Math.random() * 1800);
      }
      if (st.bossActive && !st.bossSpawnPending && !st.dragons.some(d => d.boss)) { st.bossActive = false; setBossHpBar(null); }

      // Lucky dragon spawn timer
      if (st.t >= st.nextLuckyAt && !st.dragons.some(d => d.lucky)) {
        if (Math.random() < 0.4) spawnLuckyDragon(W, H);
        st.nextLuckyAt = st.t + 1800 + Math.floor(Math.random() * 900);
      }

      // Bonus chest spawn timer
      if (!st.chest && st.t >= st.nextChestAt) {
        const goLeft = Math.random() > 0.5;
        st.chest = { x: goLeft ? W+60 : -60, y: H*0.15+Math.random()*H*0.6, vx: goLeft ? -1.4 : 1.4, life: 550 };
        st.nextChestAt = st.t + 2800 + Math.floor(Math.random()*1200);
      }

      const mx=mouseRef.current.x, my=mouseRef.current.y;
      const cannonX=W/2, cannonY=H-52;

      // ── Auto-fire target selection ──
      // When auto-fire is on AND the player isn't manually firing,
      // scan the entire upper field for the most valuable nearby dragon.
      // Used for BOTH cannon aim tracking and the actual shot,
      // so the cannon visually hunts targets between shots.
      let autoTarget: DragonObj | null = null;
      if (autoFireRef.current && !st.mouseDown) {
        let bs = -Infinity;
        for (const dr of st.dragons) {
          if (dr.dying !== undefined) continue;
          const dx = dr.x - cannonX, dy = dr.y - cannonY;
          if (dy > -10) continue; // target must be above the cannon
          const dist = Math.hypot(dx, dy) || 1;
          const score = (DRAGONS[dr.t].mult * 1.8) / (dist * 0.004 + 1);
          if (score > bs) { bs = score; autoTarget = dr; }
        }
      }

      // Aim point: the auto target if we have one, otherwise the mouse cursor
      const aimX = autoTarget ? autoTarget.x : mx;
      const aimY = autoTarget ? autoTarget.y : my;

      // Clamp target to upper arc only (cannon can't point downward)
      const rawAngle=Math.atan2(aimY-cannonY,aimX-cannonX);
      const targetAngle=Math.max(-Math.PI+0.12,Math.min(-0.12,rawAngle));
      let diff=targetAngle-st.cannonAngle;
      while(diff>Math.PI)diff-=2*Math.PI; while(diff<-Math.PI)diff+=2*Math.PI;
      // Slow rotation while a bullet is in-flight (keeps barrel visually aligned with the shot)
      st.cannonAngle+=diff*(st.shotCooldown>0?0.06:0.30);
      // Hard-clamp after smoothing so barrel never dips below horizontal
      st.cannonAngle=Math.max(-Math.PI+0.12,Math.min(-0.12,st.cannonAngle));

      if(st.shotCooldown>0)st.shotCooldown--;
      if(st.muzzleFlash>0)st.muzzleFlash--;

      if (st.shotCooldown === 0) {
        if (autoTarget) {
          // Auto-fire path: shoot the pre-selected best target directly.
          st.cannonAngle = Math.atan2(autoTarget.y - cannonY, autoTarget.x - cannonX);
          shootFnRef.current(autoTarget.id);
        } else if (st.mouseDown) {
          // Manual fire path: value-weighted targeting within current aim cone.
          const cosA=Math.cos(st.cannonAngle),sinA=Math.sin(st.cannonAngle);
          let best:DragonObj|null=null,bestScore=-Infinity;
          for(const dr of st.dragons){
            if(dr.dying!==undefined)continue;
            const dx=dr.x-cannonX,dy=dr.y-cannonY;
            const dot=dx*cosA+dy*sinA;
            if(dot<=10)continue;
            const perp=Math.abs(dx*sinA-dy*cosA);
            if(perp>220)continue;
            const dist=Math.hypot(dx,dy)||1;
            const score=(DRAGONS[dr.t].mult*1.8)/(perp+1)/(dist*0.004+1);
            if(score>bestScore){bestScore=score;best=dr;}
          }
          if(best){
            st.cannonAngle=Math.atan2(best.y-cannonY,best.x-cannonX);
            shootFnRef.current(best.id);
          }
        }
      }

      // Fever mode
      if(st.feverFrames>0){st.feverFrames--;}
      else if(st.t>=st.nextFeverAt){st.feverFrames=480;st.nextFeverAt=st.t+1800+480;setFever(true);soundEngine.playFeverStart();setTimeout(()=>setFever(false),8000);}

      st.embers=st.embers.map(e=>{e.x+=e.vx+Math.sin(st.t*0.03+e.x*0.01)*0.15;e.y+=e.vy;e.vy+=0.015;e.life-=0.006;if(e.life<=0||e.y<-20){e.y=H+10;e.x=Math.random()*W;e.vy=-(0.6+Math.random()*1.5);e.life=0.8;}return e;});

      drawDkBG(ctx,W,H,st.t,st.embers,bgImgRef.current);

      // ── Background life: drifting lava bubbles ──
      for (const lb of st.lavaBubbles) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, lb.life) * 0.55;
        ctx.shadowColor = "#FF6D00"; ctx.shadowBlur = 14;
        const g = ctx.createRadialGradient(lb.x, lb.y, 0, lb.x, lb.y, lb.r);
        g.addColorStop(0, "#FFD600"); g.addColorStop(0.5, "#FF6D00"); g.addColorStop(1, "rgba(255,23,68,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lb.x, lb.y, lb.r, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
      // ── Lightning flash overlay ──
      if (st.lightning > 0) {
        ctx.save();
        ctx.globalAlpha = (st.lightning / 8) * 0.35;
        ctx.fillStyle = "#E8DFFF"; ctx.fillRect(0, 0, W, H);
        // jagged bolt
        ctx.strokeStyle = "rgba(220,210,255,0.9)"; ctx.lineWidth = 2.4;
        ctx.shadowColor = "#C77DFF"; ctx.shadowBlur = 22;
        ctx.beginPath();
        let bx = W * (0.2 + Math.random()*0.6), by = 0;
        ctx.moveTo(bx, by);
        for (let s = 0; s < 7; s++) { bx += (Math.random()-0.5) * 90; by += H/7; ctx.lineTo(bx, by); }
        ctx.stroke();
        ctx.restore();
      }

      if(st.feverFrames>0){ctx.save();ctx.globalAlpha=0.07+Math.sin(st.t*0.14)*0.04;ctx.fillStyle="#FF6D00";ctx.fillRect(0,0,W,H);ctx.globalAlpha=0.2+Math.sin(st.t*0.18)*0.1;ctx.strokeStyle="#FFD600";ctx.lineWidth=14;ctx.strokeRect(7,7,W-14,H-14);ctx.restore();}

      let hoveredId:number|null=null;
      for(const d of st.dragons){if(d.dying!==undefined)continue;if(Math.hypot(d.x-mx,d.y-my)<DRAGONS[d.t].size*0.85){hoveredId=d.id;break;}}

      st.dragons=st.dragons.filter(d=>{
        const dt=DRAGONS[d.t];
        if (d.dying !== undefined) {
          d.dying--;
          if (d.dying < 0) return false;
        }
        d.x+=d.vx*tScale;d.y+=d.vy*tScale;d.phase+=0.038;d.wingPhase+=0.11;
        if(d.y<dt.size*0.5||d.y>H*0.77-dt.size*0.5)d.vy*=-1;
        if(Math.abs(d.x)>W+dt.size*2.5)return false;

        const img=spriteImgs.current[d.t];
        const flip=d.vx<0;const hover=hoveredId===d.id;
        const bossMul = d.boss ? 1.85 : 1;
        const sw=dt.size*1.65*bossMul;let sh=sw;
        if(img&&img.naturalWidth>0)sh=sw*(img.naturalHeight/img.naturalWidth);
        const bob=Math.sin(d.wingPhase)*5;

        ctx.save();ctx.translate(d.x,d.y+bob);
        if(flip)ctx.scale(-1,1);ctx.rotate(Math.sin(d.phase)*0.04);

        const gr=hover?dt.size*1.22:dt.size*0.94;
        const glowCol=d.lucky?"#FFD700":dt.glow;
        const gw=ctx.createRadialGradient(0,0,0,0,0,gr);
        gw.addColorStop(0,glowCol+"55");gw.addColorStop(0.6,glowCol+"18");gw.addColorStop(1,glowCol+"00");
        ctx.fillStyle=gw;ctx.beginPath();ctx.ellipse(0,0,gr,gr*0.62,0,0,Math.PI*2);ctx.fill();

        if(hover){ctx.shadowColor=d.lucky?"#FFD700":dt.glow;ctx.shadowBlur=36;ctx.strokeStyle=d.lucky?"#FFD700":"#FFD600";ctx.lineWidth=2.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.ellipse(0,0,sw*0.52,sh*0.46,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}

        if(img&&img.complete&&img.naturalWidth>0){
          ctx.shadowColor=glowCol;ctx.shadowBlur=hover?28:12;
          if (d.dying !== undefined) ctx.globalAlpha = Math.max(0, d.dying / 5);
          ctx.drawImage(img,-sw/2,-sh/2,sw,sh);
          if (d.flash && d.flash > 0) {
            d.flash--;
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = (d.flash / 6) * 0.9;
            ctx.drawImage(img,-sw/2,-sh/2,sw,sh);
            ctx.globalCompositeOperation = "source-over";
          }
          ctx.globalAlpha = 1;
        }
        else{ctx.shadowColor=glowCol;ctx.shadowBlur=20;ctx.fillStyle=glowCol;ctx.beginPath();ctx.ellipse(0,0,sw*0.35,sh*0.22,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(sw*0.2,-sh*0.25);ctx.lineTo(sw*0.45,-sh*0.15);ctx.lineTo(sw*0.3,sh*0.05);ctx.closePath();ctx.fill();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(sw*0.15,-sh*0.05,sh*0.07,0,Math.PI*2);ctx.fill();ctx.fillStyle="#000";ctx.beginPath();ctx.arc(sw*0.17,-sh*0.05,sh*0.04,0,Math.PI*2);ctx.fill();}
        ctx.shadowBlur=0;ctx.restore();

        // Boss aura + HP bar
        if (d.boss && d.dying === undefined) {
          const pulseA = 0.55 + Math.sin(st.t*0.18)*0.3;
          ctx.save();
          ctx.shadowColor="#FF1744"; ctx.shadowBlur=32;
          ctx.strokeStyle=`rgba(255,23,68,${pulseA})`; ctx.lineWidth=5;
          ctx.beginPath(); ctx.arc(d.x, d.y+bob, sw*0.62, 0, Math.PI*2); ctx.stroke();
          ctx.strokeStyle=`rgba(255,140,0,${pulseA*0.6})`; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(d.x, d.y+bob, sw*0.74, 0, Math.PI*2); ctx.stroke();
          ctx.font="bold 16px 'Arial Black',Arial,sans-serif"; ctx.textAlign="center"; ctx.textBaseline="bottom";
          ctx.fillStyle="#FF1744"; ctx.shadowColor="#000"; ctx.shadowBlur=4;
          ctx.fillText("🐲 ANCIENT DRAGON", d.x, d.y+bob - sh*0.52 - 56);
          if (d.bossHp !== undefined && d.bossMaxHp) {
            const bw = sw * 0.95, bh = 12;
            const bx = d.x - bw/2, byBar = d.y + bob - sh*0.52 - 38;
            ctx.shadowBlur=0;
            ctx.fillStyle="rgba(0,0,0,0.7)"; ctx.fillRect(bx-2, byBar-2, bw+4, bh+4);
            const pct = d.bossHp / d.bossMaxHp;
            const grad = ctx.createLinearGradient(bx, byBar, bx+bw, byBar);
            grad.addColorStop(0, "#FF1744"); grad.addColorStop(0.5, "#FF6D00"); grad.addColorStop(1, "#FFD600");
            ctx.fillStyle = grad; ctx.fillRect(bx, byBar, bw*pct, bh);
            ctx.strokeStyle="#fff"; ctx.lineWidth=1.5; ctx.strokeRect(bx, byBar, bw, bh);
            ctx.font="bold 11px monospace"; ctx.textAlign="center";
            ctx.fillStyle="#fff"; ctx.fillText(`${d.bossHp} / ${d.bossMaxHp}`, d.x, byBar + bh - 1);
          }
          ctx.restore();
        }

        // High-value enemy telegraph — pulsing aura for mult >= 5 (non-boss, non-lucky)
        if (!d.boss && !d.lucky && d.dying === undefined && dt.mult >= 5) {
          const pulseA = 0.32 + Math.sin(st.t*0.13 + d.phase)*0.22;
          ctx.save();
          ctx.shadowColor=dt.glow; ctx.shadowBlur=18;
          ctx.strokeStyle=`rgba(255,140,0,${pulseA})`; ctx.lineWidth=3;
          ctx.beginPath(); ctx.arc(d.x, d.y+bob, sw*0.58, 0, Math.PI*2); ctx.stroke();
          ctx.strokeStyle=`rgba(255,220,80,${pulseA*0.55})`; ctx.lineWidth=1.5;
          ctx.setLineDash([8,5]);
          ctx.beginPath(); ctx.arc(d.x, d.y+bob, sw*0.7, 0, Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        if(d.lucky){
          drawCoinBadge(ctx,d.x,d.y+bob-sh*0.52-28,25);
          const pulseA=0.45+Math.sin(st.t*0.15)*0.35;
          ctx.save();
          ctx.shadowColor="#FFD700";ctx.shadowBlur=24;
          ctx.strokeStyle=`rgba(255,215,0,${pulseA})`;ctx.lineWidth=4;
          ctx.beginPath();ctx.arc(d.x,d.y+bob,sw*0.6,0,Math.PI*2);ctx.stroke();
          ctx.strokeStyle=`rgba(255,255,255,${pulseA*0.5})`;ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(d.x,d.y+bob,sw*0.7,0,Math.PI*2);ctx.stroke();
          ctx.shadowBlur=0;
          ctx.font="bold 13px 'Arial Black',Arial,sans-serif";ctx.textAlign="center";ctx.textBaseline="bottom";
          ctx.fillStyle="#FFD700";ctx.shadowColor="#000";ctx.shadowBlur=4;
          ctx.fillText("⭐ LUCKY",d.x,d.y+bob-sh*0.52-56);ctx.shadowBlur=0;
          ctx.restore();
        } else {
          drawCoinBadge(ctx,d.x,d.y+bob-sh*0.52-28,dt.mult);
        }
        return true;
      });

      // Bonus chest
      if(st.chest){
        st.chest.x+=st.chest.vx;st.chest.life--;
        drawBonusChest(ctx,st.chest.x,st.chest.y,st.t);
        if(Math.abs(st.chest.x)>W+120||st.chest.life<=0)st.chest=null;
      }

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
        const ring = 30 + Math.sin(p.phase*2)*4;
        ctx.shadowColor = col; ctx.shadowBlur = 26;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.beginPath(); ctx.arc(p.x, yy, ring, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, yy, ring, 0, Math.PI*2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.font = "26px 'Arial Black',Arial,sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff"; ctx.fillText(emoji, p.x, yy + 1);
        ctx.font = "bold 10px monospace"; ctx.fillStyle = col; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
        ctx.fillText(lbl, p.x, yy + ring + 12);
        ctx.restore();
        return true;
      });

      // Bullets — fly straight from muzzle; effects fire when bullet physically reaches the target
      st.bullets=st.bullets.filter(b=>{
        if(b.done)return false;
        if(!b.hitResult && Date.now() - b.bornAt > 4000) return false;
        const liveTarget=st.dragons.find(d=>d.id===b.targetId);
        // Hit radius scales with dragon's visual size — also guards against overshoot at high speed.
        const hitRadius=liveTarget?DRAGONS[liveTarget.t].size*0.55+b.radius:45+b.radius;
        // Silently steer destination toward dragon's live position while bullet is still in flight.
        // Compute dist with OLD tx/ty first — do NOT update while bullet is hovering at the
        // target waiting for the API response, otherwise the hover breaks and bullets orbit the dragon.
        const _preDist=Math.hypot(b.tx-b.x,b.ty-b.y);
        if(liveTarget&&_preDist>hitRadius+8){b.tx=liveTarget.x;b.ty=liveTarget.y;}
        const dx=b.tx-b.x,dy=b.ty-b.y,dist=Math.hypot(dx,dy);
        // Trigger hit if bullet is within hitRadius OR would overshoot this frame
        if(dist<hitRadius||dist<=b.speed*tScale){
          b.x=b.tx;b.y=b.ty;
          if(b.hitResult===null){
            // API still in-flight — hover bullet at impact point and wait
            b.x=b.tx;b.y=b.ty;
            // Only draw ring while target still alive — hides ghost rings at dead-dragon positions
            if(st.dragons.some((d: {id:number})=>d.id===b.targetId)){ctx.save();ctx.globalAlpha=0.55+Math.sin(st.t*0.4)*0.3;ctx.strokeStyle=b.col;ctx.shadowColor=b.col;ctx.shadowBlur=16;ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*2.8,0,Math.PI*2);ctx.stroke();ctx.restore();}
            return true;
          }
          // API result ready — trigger all effects at target's current position
          b.done=true;
          const res=b.hitResult;
          // b.tx/b.ty are already live (updated each frame above) — explosion is exactly where bullet lands
          const bx=b.tx,by=b.ty;
          // ── Bonus-shot fast path: visual kill, no economy, no server, no streak ──
          if (b.bonus) {
            soundEngine.playImpact();
            const targetD2 = st.dragons.find(d => d.id === b.targetId);
            for (let i = 0; i < 8; i++) st.booms.push({ x: bx+(Math.random()-0.5)*60, y: by+(Math.random()-0.5)*60, r: 6+Math.random()*22, life: 1, color: res.dragonGlow, ring: i < 3 });
            if (targetD2) {
              targetD2.flash = 6;
              targetD2.dying = 5;
              st.stats.kills++;
              const wpName = WEAPONS[b.wpIdx].name;
              st.killsByWeapon[wpName] = (st.killsByWeapon[wpName] || 0) + 1;
              const kc = st.killsByWeapon[wpName];
              saveKillsDK(st.killsByWeapon);
              if (kc === 100 || kc === 500 || kc === 1000 || kc === 2500) {
                const r = rankForDK(wpName, kc);
                if (r) { setRankBadge({ ...r, kills: kc }); soundEngine.playJackpot(); setTimeout(() => setRankBadge(null), 3500); }
              }
              if (targetD2.schoolId !== undefined) {
                const siblings = st.dragons.filter(d => d.id !== targetD2.id && d.schoolId === targetD2.schoolId && d.dying === undefined && !d.boss).slice(0, 2);
                for (const sib of siblings) fireBonusFnRef.current(sib.id, b.wpIdx);
              }
            } else {
              st.dragons = st.dragons.filter(d => d.id !== b.targetId);
            }
            return false;
          }
          if(res.hit){
            soundEngine.playImpact();
            soundEngine.playDragonHit(res.dragonMult);
            st.streak++;setStreak(st.streak);
            if(st.streak%5===0)soundEngine.playJackpot();
            else if(st.streak===3)soundEngine.playStreak3();
            if(res.pointsWon>=50)soundEngine.playJackpot();
            const bonusLabel=st.streak>=5?` 🔥×${st.streak}`:st.streak>=3?" ⚡STREAK!":"";
            const luckyLabel=res.isLucky?" ⭐LUCKY!":"";
            setFeedback({text:`SLAIN! +${res.pointsWon}${bonusLabel}${luckyLabel}`,win:true});
            for(let i=0;i<20;i++)st.booms.push({x:bx+(Math.random()-0.5)*res.dragonSize*0.5,y:by+(Math.random()-0.5)*res.dragonSize*0.5,r:12+Math.random()*46,life:1,color:res.dragonGlow,ring:i<7});
            const emberCount=res.isLucky?50:(st.streak>=3?40:26);
            for(let i=0;i<emberCount;i++){const a=Math.PI*2*i/emberCount;st.embers.push({x:bx,y:by,vx:Math.cos(a)*(1.5+Math.random()*4.5),vy:Math.sin(a)*(1.5+Math.random()*4)-3.5,life:1,col:res.isLucky?"#FFD700":EMBER_COLS[Math.floor(Math.random()*EMBER_COLS.length)]});}

            // ── JUICE: screen shake, slow-mo, floating damage number ──
            const ratio = res.pointsWon / Math.max(res.cost, 1);
            const targetD = st.dragons.find(d => d.id === b.targetId);
            const isBoss = !!targetD?.boss;
            const shakeAmt = isBoss ? 28 : res.isLucky ? 22 : ratio >= 20 ? 24 : ratio >= 8 ? 16 : ratio >= 4 ? 9 : 4;
            st.shake = Math.max(st.shake, shakeAmt);
            if (ratio >= 8 || res.isLucky || isBoss) st.slowmo = Math.max(st.slowmo, isBoss ? 32 : ratio >= 20 ? 26 : 18);
            const big = ratio >= 8 || res.isLucky || isBoss;
            st.damageNums.push({ x: bx, y: by - res.dragonSize*0.4, vx: (Math.random()-0.5)*1.6, vy: -2.8-(big?1.6:0), life: 1, text: `+${res.pointsWon}`, color: big ? "#FFD700" : "#FFEE58", size: big ? 56 : 38 });
            // ── Track session stats ──
            st.stats.kills++;
            st.stats.totalEarned += res.pointsWon;
            st.stats.totalSpent  += res.cost;
            if (res.pointsWon > st.stats.biggestWin) st.stats.biggestWin = res.pointsWon;
            if (st.streak > st.stats.longestStreak) st.stats.longestStreak = st.streak;
            // ── Hit flash + boss multi-hit logic ──
            if (targetD) {
              targetD.flash = 6;
              if (targetD.boss && targetD.bossHp !== undefined && targetD.bossHp > 1) {
                targetD.bossHp--;
                setBossHpBar({ hp: targetD.bossHp, max: targetD.bossMaxHp || 6 });
              } else {
                targetD.dying = 5;
                if (isBoss) {
                  st.stats.bossKills++;
                  setBossHpBar(null);
                  for (let i = 0; i < 4; i++) st.damageNums.push({ x: bx+(Math.random()-0.5)*140, y: by-30-i*22, vx: (Math.random()-0.5)*2, vy: -3.2-i*0.4, life: 1, text: "+BOSS", color: "#FFD700", size: 40 });
                  st.shake = Math.max(st.shake, 36);
                  st.slowmo = Math.max(st.slowmo, 40);
                }
                // ── Per-weapon kill counter + rank milestones ──
                const wpName = WEAPONS[b.wpIdx].name;
                st.killsByWeapon[wpName] = (st.killsByWeapon[wpName] || 0) + 1;
                const kc = st.killsByWeapon[wpName];
                saveKillsDK(st.killsByWeapon);
                if (kc === 100 || kc === 500 || kc === 1000 || kc === 2500) {
                  const r = rankForDK(wpName, kc);
                  if (r) { setRankBadge({ ...r, kills: kc }); soundEngine.playJackpot(); setTimeout(() => setRankBadge(null), 3500); }
                }
                // ── School chain: free bonus shots at up to 2 siblings ──
                if (targetD.schoolId !== undefined) {
                  const siblings = st.dragons.filter(d => d.id !== targetD.id && d.schoolId === targetD.schoolId && d.dying === undefined && !d.boss).slice(0, 2);
                  for (const sib of siblings) fireBonusFnRef.current(sib.id, b.wpIdx);
                }
              }
            } else {
              st.dragons = st.dragons.filter(d => d.id !== b.targetId);
            }
          }else{
            soundEngine.playMiss(true);
            st.streak=0;setStreak(0);
            setFeedback({text:`DODGED! -${res.cost}`,win:false});
            st.damageNums.push({ x: bx, y: by - 40, vx: 0, vy: -2.2, life: 0.9, text: `-${res.cost}`, color: "#FF5252", size: 32 });
            st.stats.misses++;
            st.stats.totalSpent += res.cost;
          }
          setTimeout(()=>setFeedback(null),900);
          return false;
        }
        b.x+=(dx/dist)*b.speed*tScale;b.y+=(dy/dist)*b.speed*tScale;
        b.trail.push({x:b.x,y:b.y});if(b.trail.length>22)b.trail.shift();
        // Glowing orb trail — filled spheres fading tail→head, no choppy line segments
        for(let i=(hiQ?0:1);i<b.trail.length;i+=(hiQ?1:2)){const a=(i+1)/b.trail.length;ctx.save();ctx.globalAlpha=a*0.62;ctx.shadowColor=b.col;ctx.shadowBlur=8+14*a;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.trail[i].x,b.trail[i].y,b.radius*(0.28+a*0.68),0,Math.PI*2);ctx.fill();ctx.restore();}
        // Bright plasma head: outer halo + white-hot core
        ctx.save();ctx.globalAlpha=0.48;ctx.shadowColor=b.col;ctx.shadowBlur=44;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*2.4,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.save();ctx.shadowColor=b.col;ctx.shadowBlur=22;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.x,b.y,b.radius+2,0,Math.PI*2);ctx.fill();ctx.shadowColor="#fff";ctx.shadowBlur=10;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(b.x,b.y,b.radius*0.55,0,Math.PI*2);ctx.fill();ctx.restore();
        // Weapon-specific visual effects keyed on radius bucket
        if(b.radius<=9&&b.trail.length>0){
          // Dart/Bolt/Rune: clean directional tracer lines
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

      st.booms=st.booms.filter(bm=>{bm.life-=0.038;if(bm.life<=0)return false;ctx.save();ctx.globalAlpha=bm.life;if(bm.ring){ctx.strokeStyle=bm.color;ctx.lineWidth=6*bm.life;ctx.shadowColor=bm.color;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(bm.x,bm.y,bm.r*(2-bm.life),0,Math.PI*2);ctx.stroke();}else{ctx.fillStyle=bm.color;ctx.shadowColor=bm.color;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(bm.x,bm.y,bm.r*bm.life,0,Math.PI*2);ctx.fill();}ctx.restore();return true;});

      st.scores=st.scores.filter(sc=>{sc.life-=0.02;if(sc.life<=0)return false;sc.y-=1.5;ctx.save();ctx.globalAlpha=sc.life;ctx.font=`bold ${Math.round(24+18*sc.life)}px 'Arial Black',monospace`;ctx.textAlign="center";ctx.fillStyle=sc.color;ctx.strokeStyle="#000";ctx.lineWidth=5;ctx.shadowColor=sc.color;ctx.shadowBlur=14;ctx.strokeText(sc.text,sc.x,sc.y);ctx.fillText(sc.text,sc.x,sc.y);ctx.restore();return true;});

      // Floating damage numbers with physics (gold gravity-arced text)
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
      const wcol=WEAPONS[weaponRef.current].col;
      ctx.save();
      ctx.translate(mx,my);
      ctx.shadowColor=wcol;ctx.shadowBlur=14;
      ctx.strokeStyle=wcol;ctx.lineWidth=1.5;ctx.globalAlpha=0.75;
      const CH=10;
      ctx.beginPath();ctx.moveTo(-CH,0);ctx.lineTo(-4,0);ctx.moveTo(4,0);ctx.lineTo(CH,0);
      ctx.moveTo(0,-CH);ctx.lineTo(0,-4);ctx.moveTo(0,4);ctx.lineTo(0,CH);ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=1;ctx.shadowBlur=0;
      ctx.restore();
      // ── Auto-fire targeting reticle + cannon scan ring ──
      if(st.mouseDown){
        const cosA=Math.cos(st.cannonAngle),sinA=Math.sin(st.cannonAngle);
        let aimD:DragonObj|null=null,aimScore=-Infinity;
        for(const dr of st.dragons){
          const dx=dr.x-cannonX,dy=dr.y-cannonY;
          if(dx*cosA+dy*sinA<=10)continue;
          const perp=Math.abs(dx*sinA-dy*cosA);if(perp>220)continue;
          const dist=Math.hypot(dx,dy)||1;
          const sc=(DRAGONS[dr.t].mult*1.8)/(perp+1)/(dist*0.004+1);
          if(sc>aimScore){aimScore=sc;aimD=dr;}
        }
        if(aimD){
          const rf=30+Math.sin(st.t*0.2)*4;
          ctx.save();ctx.globalAlpha=0.65+Math.sin(st.t*0.28)*0.2;
          ctx.strokeStyle="#FF6600";ctx.lineWidth=2;ctx.shadowColor="#FF6600";ctx.shadowBlur=14;
          ctx.beginPath();ctx.arc(aimD.x,aimD.y,rf,0,Math.PI*2);ctx.stroke();
          ctx.lineWidth=1.5;const cl=10;
          ctx.beginPath();ctx.moveTo(aimD.x-(rf+4),aimD.y);ctx.lineTo(aimD.x-(rf+cl+4),aimD.y);ctx.stroke();
          ctx.beginPath();ctx.moveTo(aimD.x+(rf+4),aimD.y);ctx.lineTo(aimD.x+(rf+cl+4),aimD.y);ctx.stroke();
          ctx.beginPath();ctx.moveTo(aimD.x,aimD.y-(rf+4));ctx.lineTo(aimD.x,aimD.y-(rf+cl+4));ctx.stroke();
          ctx.beginPath();ctx.moveTo(aimD.x,aimD.y+(rf+4));ctx.lineTo(aimD.x,aimD.y+(rf+cl+4));ctx.stroke();
          ctx.restore();
        }
        // Dashed scan arc on cannon base (top half only)
        ctx.save();ctx.globalAlpha=0.28+Math.sin(st.t*0.22)*0.10;
        ctx.strokeStyle="#FF6600";ctx.lineWidth=1.8;ctx.shadowColor="#FF4400";ctx.shadowBlur=16;
        ctx.setLineDash([7,5]);ctx.lineDashOffset=-(st.t*0.8);
        ctx.beginPath();ctx.arc(cannonX,cannonY,58+Math.sin(st.t*0.18)*3,-Math.PI,0);ctx.stroke();
        ctx.setLineDash([]);ctx.restore();
      }
      drawArcaneCannon(ctx,cannonX,cannonY,st.cannonAngle,wcol,st.t,st.muzzleFlash>0);

      // Undo screen shake translation
      if (_sx || _sy) ctx.translate(-_sx, -_sy);
    };
    loop();

    canvas.style.touchAction="none";

    const onMove=(e:PointerEvent)=>{
      const r=canvas.getBoundingClientRect();
      const sx=canvas.width/r.width,sy=canvas.height/r.height;
      mouseRef.current={x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy};
    };
    const onPointerDown=(e:PointerEvent)=>{
      canvas.setPointerCapture(e.pointerId);
      if(!ambientRef.current){soundEngine.startMysticalAmbient();ambientRef.current=true;}
      const r=canvas.getBoundingClientRect();
      const sx=canvas.width/r.width,sy=canvas.height/r.height;
      const mx2=(e.clientX-r.left)*sx,my2=(e.clientY-r.top)*sy;
      mouseRef.current={x:mx2,y:my2};

      // Chest click check first
      if(st.chest&&Math.hypot(st.chest.x-mx2,st.chest.y-my2)<55){
        st.chest=null;
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
          const targets = st.dragons.filter(d => d.dying === undefined && !d.boss).slice(0, 10);
          const curWpIdx = weaponRef.current;
          targets.forEach((d, i) => setTimeout(() => {
            const cur = stRef.current.dragons.find(dd => dd.id === d.id);
            if (cur && cur.dying === undefined) fireBonusFnRef.current(d.id, curWpIdx);
          }, i * 120));
        }
        setTimeout(() => setFeedback(null), 1200);
        return;
      }

      st.mouseDown=true;
      // On click: find dragon nearest to the click position (within 450px)
      let best:DragonObj|null=null,bestD=450;
      for(const d of st.dragons){if(d.dying!==undefined)continue;const dist=Math.hypot(d.x-mx2,d.y-my2);if(dist<bestD){bestD=dist;best=d;}}
      if(best&&st.shotCooldown===0){
        // Snap cannon instantly toward clicked dragon so bullet trajectory matches cannon visuals
        st.cannonAngle=Math.atan2(best.y-(canvas.height-52),best.x-canvas.width/2);
        shootFnRef.current(best.id);
      }
    };
    const onPointerUp=()=>{st.mouseDown=false;};

    canvas.addEventListener("pointermove",  onMove);
    canvas.addEventListener("pointerdown",  onPointerDown);
    canvas.addEventListener("pointerup",    onPointerUp);
    canvas.addEventListener("pointercancel",onPointerUp);
    return()=>{
      cancelAnimationFrame(st.raf);
      window.removeEventListener("resize",resize);
      canvas.removeEventListener("pointermove",   onMove);
      canvas.removeEventListener("pointerdown",   onPointerDown);
      canvas.removeEventListener("pointerup",     onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      soundEngine.stopAmbient();
      Object.assign(st,{dragons:[],bullets:[],booms:[],embers:[],scores:[],chest:null,powerUps:[],lavaBubbles:[]});
    };
  }, [ready, spawnDragon, spawnLuckyDragon, spawnSchool, spawnPowerUp]);

  const w   = WEAPONS[weapon];
  const cost = w.mult * tierMult;
  const tierCol: Record<string,string> = { bronze:"text-orange-400", silver:"text-slate-300", gold:"text-yellow-400" };

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden select-none" style={{ background:"#0A0018" }}>
      <div className="z-10 bg-black/70 backdrop-blur-sm border-b border-purple-500/25 px-2 sm:px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => {
            soundEngine.playClick();
            if (stRef.current.stats.kills > 0 || stRef.current.stats.misses > 0) setShowSummary(true);
            else setLocation("/lobby");
          }} className="text-purple-300 hover:text-white h-8 px-2 sm:px-3">
            <ArrowLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Lobby</span>
          </Button>
          <span className="text-lg sm:text-xl">🐉</span>
          <span className="hidden md:inline text-white font-bold uppercase tracking-widest text-sm">Dragon King</span>
          <span className={`font-mono text-[10px] sm:text-xs capitalize font-bold ${tierCol[tier]}`}>[{tier}]</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 bg-black/50 border border-yellow-400/40 rounded-full px-2.5 sm:px-4 py-1 sm:py-1.5 shrink-0">
          <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400" />
          <span className="font-mono font-bold text-yellow-400 text-sm sm:text-xl">{(balance ?? player?.balance ?? 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden cursor-crosshair">
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0018] z-10">
            <div className="text-6xl mb-4">🐉</div>
            <div className="text-purple-300 font-mono text-lg animate-pulse">Summoning dragons…</div>
          </div>
        )}
        <canvas ref={cvs} className="w-full h-full block" />

        {fever && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-bounce">
            <div className="text-3xl font-black tracking-widest px-6 py-2 rounded-full border-2 border-orange-400"
              style={{ background:"rgba(0,0,0,0.75)", color:"#FF6D00", textShadow:"0 0 30px #FF6D00, 0 0 60px #FFD600" }}>
              🔥 DRAGON FURY! 2× PAYOUT 🔥
            </div>
          </div>
        )}
        {streak >= 2 && (() => {
          const t = streak >= 15 ? { c:"#FF00E5", g:"#FF00E5", lbl:"GODSLAYER" } : streak >= 10 ? { c:"#FF1744", g:"#FF1744", lbl:"INFERNO" } : streak >= 5 ? { c:"#FF6D00", g:"#FFD600", lbl:"DRAGON RAGE" } : { c:"#FFD600", g:"#FF8800", lbl:"STREAK" };
          const next = streak >= 15 ? 20 : streak >= 10 ? 15 : streak >= 5 ? 10 : 5;
          const prev = streak >= 15 ? 15 : streak >= 10 ? 10 : streak >= 5 ? 5 : 2;
          const pct  = Math.min(1, (streak - prev) / (next - prev));
          return (
            <div className="absolute top-4 right-4 pointer-events-none z-20" style={{ animation: streak >= 5 ? "pulse 0.8s ease-in-out infinite" : undefined }}>
              <div className="text-right">
                <div className="text-[10px] font-mono uppercase tracking-widest font-bold" style={{ color: t.c, textShadow:`0 0 8px ${t.c}` }}>{t.lbl}</div>
                <div className="text-5xl font-black font-mono leading-none" style={{ color: t.c, textShadow:`0 0 24px ${t.g}, 0 0 48px ${t.c}88`, transform: streak >= 10 ? `scale(${1 + Math.sin(Date.now()*0.012)*0.06})` : undefined }}>×{streak}</div>
                <div className="h-1.5 w-32 mt-1 bg-black/60 rounded-full overflow-hidden border border-white/15">
                  <div className="h-full transition-all duration-150" style={{ width: `${pct*100}%`, background: t.c, boxShadow:`0 0 12px ${t.c}` }} />
                </div>
                <div className="text-[9px] font-mono text-white/40 mt-0.5">→ {next}</div>
              </div>
            </div>
          );
        })()}
        {feedback && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className={`text-7xl font-black drop-shadow-2xl ${feedback.win ? "text-yellow-300" : "text-red-400"}`}
              style={{ textShadow: feedback.win ? "0 0 50px #FFD60099" : "0 0 20px #FF000066", WebkitTextStroke:"2px rgba(0,0,0,0.5)" }}>
              {feedback.text}
            </div>
          </div>
        )}

        {miniJackpot > 0 && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none z-30 animate-bounce">
            <div className="text-2xl font-black tracking-widest px-8 py-3 rounded-2xl border-2 border-orange-400 shadow-2xl"
              style={{ background:"rgba(0,0,0,0.85)", color:"#FF8C00", textShadow:"0 0 25px #FF8C00" }}>
              💰 MINI JACKPOT! +{miniJackpot}
            </div>
          </div>
        )}
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
        {killTrophy > 0 && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-30">
            <div className="text-2xl font-black tracking-widest px-8 py-3 rounded-2xl border-2 border-yellow-400 shadow-2xl"
              style={{ background:"rgba(0,0,0,0.85)", color:"#FFD700", textShadow:"0 0 20px #FFD700" }}>
              🏅 KILL TROPHY! {killTrophy} kills! +{killTrophy} pts
            </div>
          </div>
        )}
        {milestoneBonus > 0 && (
          <div className="absolute top-20 right-6 pointer-events-none z-30">
            <div className="text-xl font-black tracking-widest px-6 py-3 rounded-xl border-2 border-purple-400"
              style={{ background:"rgba(0,0,0,0.85)", color:"#C77DFF", textShadow:"0 0 20px #C77DFF" }}>
              🎯 MILESTONE! +{milestoneBonus} pts
            </div>
          </div>
        )}

        {/* Wave banner — every 60s */}
        {waveBanner !== null && (
          <div className="absolute inset-x-0 top-1/4 pointer-events-none z-40 flex flex-col items-center" style={{ animation:"bounce 1s ease-in-out infinite" }}>
            <div className="text-7xl font-black tracking-widest px-12 py-6 rounded-3xl border-4 border-purple-400"
              style={{ background:"rgba(20,0,40,0.92)", color:"#C77DFF", textShadow:"0 0 30px #C77DFF, 0 0 60px #9D4EDD", boxShadow:"0 0 60px rgba(199,125,255,0.5)" }}>
              ⚡ WAVE {waveBanner} ⚡
            </div>
            <div className="text-purple-200/80 font-mono mt-3 text-sm tracking-widest">🐲 MORE DRAGONS RISING 🐲</div>
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
              <div className="text-[10px] font-mono font-bold text-red-300 uppercase tracking-widest mb-1 text-center">🐲 ANCIENT HP</div>
              <div className="w-64 h-3 rounded-full overflow-hidden bg-black/60 border border-red-500/40">
                <div className="h-full transition-all duration-200" style={{ width: `${(bossHpBar.hp / bossHpBar.max) * 100}%`, background:"linear-gradient(90deg, #FF1744, #FF6D00, #FFD600)", boxShadow:"0 0 12px #FF1744" }} />
              </div>
              <div className="text-center text-xs font-mono font-bold text-white mt-1">{bossHpBar.hp} / {bossHpBar.max}</div>
            </div>
          </div>
        )}

        {bossWarning && (
          <div className="absolute inset-x-0 top-1/3 pointer-events-none z-40 flex flex-col items-center" style={{ animation:"pulse 0.5s ease-in-out infinite" }}>
            <div className="text-7xl mb-2">⚠️</div>
            <div className="text-5xl font-black tracking-[0.3em] px-10 py-4 rounded-2xl border-4 border-red-500"
              style={{ background:"rgba(20,0,0,0.92)", color:"#FF1744", textShadow:"0 0 30px #FF1744, 0 0 60px #FF000088", boxShadow:"0 0 60px rgba(255,23,68,0.6)" }}>
              ANCIENT DRAGON RISING
            </div>
            <div className="text-purple-200/70 font-mono mt-2 text-sm tracking-widest">🐲 LEGENDARY PAYOUT 🐲</div>
          </div>
        )}

        {showSummary && (() => {
          const s = stRef.current.stats;
          const net = s.totalEarned - s.totalSpent;
          const acc = s.kills + s.misses > 0 ? Math.round((s.kills / (s.kills + s.misses)) * 100) : 0;
          return (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
              <div className="w-full max-w-md rounded-3xl border-2 border-purple-400/60 overflow-hidden shadow-2xl"
                style={{ background:"linear-gradient(135deg, #1A0033, #2a0048)", boxShadow:"0 0 80px rgba(199,125,255,0.4)" }}>
                <div className="px-6 pt-6 pb-4 text-center border-b border-purple-400/20">
                  <div className="text-6xl mb-2">🐉</div>
                  <h2 className="text-3xl font-black text-purple-300 tracking-widest">SESSION COMPLETE</h2>
                  <p className="text-purple-200/60 text-xs font-mono mt-1">DRAGON KING · {tier.toUpperCase()}</p>
                </div>
                <div className="px-6 py-5 grid grid-cols-2 gap-3">
                  <div className="bg-black/40 rounded-xl p-3 border border-purple-500/20"><div className="text-[10px] font-mono text-purple-300/60 uppercase tracking-widest">Dragons Slain</div><div className="text-3xl font-black font-mono" style={{ color:"#C77DFF" }}>{s.kills}</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-red-500/20"><div className="text-[10px] font-mono text-red-300/60 uppercase tracking-widest">Dodged</div><div className="text-3xl font-black font-mono" style={{ color:"#FF5252" }}>{s.misses}</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-yellow-500/20"><div className="text-[10px] font-mono text-yellow-300/60 uppercase tracking-widest">Biggest Win</div><div className="text-2xl font-black font-mono" style={{ color:"#FFD700" }}>+{s.biggestWin.toLocaleString()}</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-orange-500/20"><div className="text-[10px] font-mono text-orange-300/60 uppercase tracking-widest">Best Streak</div><div className="text-2xl font-black font-mono" style={{ color:"#FF6D00" }}>×{s.longestStreak}</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-green-500/20"><div className="text-[10px] font-mono text-green-300/60 uppercase tracking-widest">Accuracy</div><div className="text-2xl font-black font-mono" style={{ color:"#00C853" }}>{acc}%</div></div>
                  <div className="bg-black/40 rounded-xl p-3 border border-pink-500/20"><div className="text-[10px] font-mono text-pink-300/60 uppercase tracking-widest">Ancient Slain</div><div className="text-2xl font-black font-mono" style={{ color:"#FF00E5" }}>{s.bossKills}</div></div>
                </div>
                <div className="px-6 pb-3"><div className="bg-black/60 rounded-xl p-4 border-2" style={{ borderColor: net >= 0 ? "#00C85388" : "#FF525288" }}>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-white/50 text-center">Net Result</div>
                  <div className="text-4xl font-black font-mono text-center mt-1" style={{ color: net >= 0 ? "#00C853" : "#FF5252", textShadow: net >= 0 ? "0 0 20px #00C85388" : "0 0 20px #FF525288" }}>{net >= 0 ? "+" : ""}{net.toLocaleString()}</div>
                </div></div>
                <div className="px-6 pb-6 flex gap-2">
                  <Button onClick={() => { soundEngine.playClick(); setShowSummary(false); }} variant="outline" className="flex-1 border-purple-500/40 text-purple-300 hover:bg-purple-500/10">Keep Slaying</Button>
                  <Button onClick={() => { soundEngine.playClick(); setLocation("/lobby"); }} className="flex-1 bg-purple-500 hover:bg-purple-400 text-black font-black tracking-wider">EXIT TO LOBBY</Button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="z-10 bg-black/80 backdrop-blur-sm border-t border-purple-500/20 px-2 sm:px-5 py-2 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar">
          <span className="hidden sm:inline text-muted-foreground text-[10px] font-mono uppercase tracking-widest mr-1">Spell</span>
          <button
            onClick={() => { setAutoFire(v => !v); soundEngine.playWeaponSelect(); }}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border transition-all mr-1"
            style={{ color: autoFire ? "#000" : "#FFD60A", borderColor: autoFire ? "#FFD60A" : "#ffffff22", background: autoFire ? "#FFD60A" : "rgba(0,0,0,0.55)", boxShadow: autoFire ? "0 0 18px #FFD60A99" : "none", transform: autoFire ? "scale(1.08)" : "scale(1)" }}>
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
