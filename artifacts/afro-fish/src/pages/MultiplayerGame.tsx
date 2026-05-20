import { useEffect, useRef, useState, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { ArrowLeft, Coins, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { soundEngine } from "@/lib/sound-engine";

const BASE = import.meta.env.BASE_URL ?? "/";
const API  = `${BASE}api`;

// ─── Game Data ───────────────────────────────────────────────────────────────

const FISH = [
  { mult:1, name:"Clownfish",  sprite:`${BASE}sprites/fish_clownfish.png`,  glow:"#FF8C00", size:72,  spd:3.6  },
  { mult:2, name:"Grouper",    sprite:`${BASE}sprites/fish_grouper.png`,    glow:"#E53935", size:96,  spd:2.7  },
  { mult:3, name:"Pufferfish", sprite:`${BASE}sprites/fish_pufferfish.png`, glow:"#FFD600", size:115, spd:2.0  },
  { mult:5, name:"Shark",      sprite:`${BASE}sprites/fish_shark.png`,      glow:"#90A4AE", size:150, spd:1.3  },
  { mult:7, name:"Megalodon",  sprite:`${BASE}sprites/fish_megalodon.png`,  glow:"#B71C1C", size:195, spd:0.78 },
];
const WEAPONS = [
  { mult:1, name:"Pistol",  col:"#00E5FF", bg:"#003344", emoji:"🔫", speed:32, radius:5  },
  { mult:2, name:"Rifle",   col:"#76FF03", bg:"#1A3300", emoji:"🎯", speed:30, radius:6  },
  { mult:3, name:"Cannon",  col:"#FFD600", bg:"#332600", emoji:"💣", speed:24, radius:10 },
  { mult:5, name:"Railgun", col:"#FF6D00", bg:"#331500", emoji:"⚡", speed:38, radius:7  },
  { mult:7, name:"Torpedo", col:"#FF1744", bg:"#330008", emoji:"🌊", speed:22, radius:16 },
];
const SHOT_COOLDOWN = [16, 26, 38, 52, 68];
const TIER: Record<string, number> = { bronze:1, silver:10, gold:100 };

// ─── Multiplayer Config ──────────────────────────────────────────────────────

const N = 4;
const CANNON_COLORS  = ["#00E5FF", "#00E676", "#FF5252", "#FFD600"];
const CANNON_LABELS  = ["P1", "P2", "P3", "P4"];
const CANNON_X_FRAC  = [0.125, 0.375, 0.625, 0.875];
const CANNON_Y_OFF   = 60;
const BOSS_HP_BASE   = 150;
const BOSS_PRIZE_BASE = 2000;  // × tierMult, split by damage
const BOSS_KILLS_AT  = 200;   // collective kills to spawn
const BOSS_DURATION  = 90 * 60;
const BOSS_WARN_FRAMES = 6 * 60;

// P1=mouse; P2–P4=keyboard
const KEYS = [
  { aimL:null,         aimR:null,          fire:null,    wPrev:null,  wNext:null  },
  { aimL:"a",          aimR:"d",           fire:" ",     wPrev:"q",   wNext:"e"   },
  { aimL:"arrowleft",  aimR:"arrowright",  fire:"enter", wPrev:",",   wNext:"."   },
  { aimL:"j",          aimR:"l",           fire:"m",     wPrev:"u",   wNext:"i"   },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type SlotInfo = { playerId:number; playerName:string; sessionToken:string; balance:number; weapon:number } | null;

interface FishObj  { id:number; x:number; y:number; vx:number; vy:number; t:number; phase:number; lucky?:boolean; }
interface FishHitResult { hit:boolean; newBalance:number; fishSize:number; fishGlow:string; }
interface Bullet   { id:number; x:number; y:number; tx:number; ty:number; trail:{x:number;y:number}[]; done:boolean; col:string; targetId:number; speed:number; radius:number; cannonIdx:number; targetType:"fish"|"boss"; hitResult:FishHitResult|null; }
interface Boom     { x:number; y:number; r:number; life:number; color:string; ring:boolean; }
interface Coin     { x:number; y:number; vx:number; vy:number; life:number; }
interface Ripple   { x:number; y:number; r:number; life:number; }
interface Bubble   { x:number; y:number; r:number; vy:number; phase:number; }
interface BossSt   { x:number; y:number; vx:number; vy:number; phase:number; hp:number; maxHp:number; entranceFrames:number; }
interface CState   { angle:number; shotCooldown:number; muzzleFlash:number; mouseDown:boolean; keyFire:boolean; weapon:number; bossHits:number; }

interface GameSt {
  cannons: CState[];
  fish: FishObj[]; bullets: Bullet[]; booms: Boom[];
  coins: Coin[]; ripples: Ripple[]; bubbles: Bubble[];
  boss: BossSt | null;
  bossWarnFrames: number; bossTimerFrames: number;
  collectiveKills: number; nextBossAt: number;
  nextLuckyAt: number; feverFrames: number; nextFeverAt: number;
  t: number; raf: number; nextId: number;
}

interface BossResult { results:{name:string;hits:number;pct:number;prize:number;col:string}[]; total:number; }

// ─── Draw Helpers ─────────────────────────────────────────────────────────────

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise(r => { const i=new Image(); i.onload=()=>r(i); i.onerror=()=>r(i); i.crossOrigin="anonymous"; i.src=src; });
}

let hiQ = true; // adaptive rendering quality — auto-disabled on slow devices
let _fpsA = 60, _lastMs = 0;

function drawBG(ctx: CanvasRenderingContext2D, W:number, H:number, t:number, bubbles:Bubble[], bgImg:HTMLImageElement|null) {
  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,"#00233a"); bg.addColorStop(0.4,"#00496F"); bg.addColorStop(0.8,"#0077B6"); bg.addColorStop(1,"#005B8E");
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  if(bgImg&&bgImg.complete&&bgImg.naturalWidth>0){
    ctx.save(); ctx.globalAlpha=0.88; ctx.drawImage(bgImg,0,0,W,H); ctx.restore();
    const vig=ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.85);
    vig.addColorStop(0,"rgba(0,0,0,0)"); vig.addColorStop(1,"rgba(0,10,30,0.45)");
    ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);
  }
  bubbles.forEach(b=>{
    b.x+=Math.sin(t*0.015+b.phase)*0.25; b.y-=b.vy; b.phase+=0.012;
    if(b.y<-b.r*2){b.y=H+b.r;b.x=Math.random()*W;}
    ctx.save();ctx.globalAlpha=0.22+Math.sin(b.phase)*0.1;ctx.strokeStyle="#8ee3f5";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.stroke();ctx.restore();
  });
}

function drawCoinBadge(ctx: CanvasRenderingContext2D, x:number, y:number, mult:number) {
  ctx.save(); ctx.shadowColor="#FFD600"; ctx.shadowBlur=10;
  ctx.fillStyle="#FFD600"; ctx.strokeStyle="#B8860B"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(x,y,15,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur=0; ctx.fillStyle="#000"; ctx.font=`bold ${mult>=10?9:11}px monospace`;
  ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(`×${mult}`,x,y); ctx.restore();
}

// Multiplayer cannon — scaled down (BR=32, BL=58) to fit 4 across the screen
function drawCannon(ctx: CanvasRenderingContext2D, cx:number, cy:number, angle:number, col:string, t:number, shooting:boolean) {
  ctx.save(); ctx.translate(cx,cy);
  // Shadow
  ctx.fillStyle="rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(0,11,38,8,0,0,Math.PI*2); ctx.fill();
  // Outer rotating ring + dots
  ctx.save(); ctx.rotate(-t*0.022);
  ctx.strokeStyle=col+"44"; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(0,0,38,0,Math.PI*2); ctx.stroke();
  for(let i=0;i<8;i++){const a=(Math.PI*2*i)/8;ctx.fillStyle=col+"99";ctx.shadowColor=col;ctx.shadowBlur=4;ctx.beginPath();ctx.arc(Math.cos(a)*38,Math.sin(a)*38,3.5,0,Math.PI*2);ctx.fill();}
  ctx.shadowBlur=0; ctx.restore();
  // Base disc
  const bd=ctx.createRadialGradient(-6,-6,3,0,0,32);
  bd.addColorStop(0,"#3a3a4a");bd.addColorStop(0.5,"#222230");bd.addColorStop(1,"#10101a");
  ctx.fillStyle=bd; ctx.beginPath(); ctx.arc(0,0,32,0,Math.PI*2); ctx.fill();
  ctx.shadowColor=col; ctx.shadowBlur=18+Math.sin(t*0.07)*6; ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.stroke(); ctx.shadowBlur=0;
  // Inner rotating ring
  ctx.save(); ctx.rotate(t*0.035);
  ctx.strokeStyle=col+"66"; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.stroke(); ctx.restore();
  // Center jewel
  const jg=ctx.createRadialGradient(0,0,0,0,0,7);jg.addColorStop(0,"#fff");jg.addColorStop(0.5,col);jg.addColorStop(1,col+"00");
  ctx.fillStyle=jg;ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();
  // Barrel
  ctx.save(); ctx.rotate(angle);
  const BR=32,BL=58,TIP=BR+BL+8;
  // Aim dash
  ctx.setLineDash([5,7]);ctx.strokeStyle=col+"44";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(TIP,0);ctx.lineTo(TIP+70,0);ctx.stroke();ctx.setLineDash([]);
  // Barrel body
  ctx.shadowColor=col; ctx.shadowBlur=22; ctx.fillStyle=col;
  ctx.beginPath(); ctx.roundRect(BR,-9,BL,18,[0,0,5,5]); ctx.fill();
  ctx.shadowBlur=0; ctx.fillStyle="#0e0e1a";
  ctx.beginPath(); ctx.roundRect(BR+2,-5,BL-4,10,[0,0,3,3]); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.24)"; ctx.beginPath(); ctx.roundRect(BR+6,-3,BL-14,5,2); ctx.fill();
  // Barrel rings — flush with bounds (-9..9)
  [0.3,0.6,0.85].forEach(f=>{const rx=BR+BL*f;ctx.fillStyle=col;ctx.shadowColor=col;ctx.shadowBlur=6;ctx.beginPath();ctx.roundRect(rx-3,-9,6,18,2);ctx.fill();ctx.shadowBlur=0;});
  // Muzzle cap
  ctx.shadowColor=col; ctx.shadowBlur=22; ctx.fillStyle="#222230"; ctx.beginPath(); ctx.arc(TIP,0,10,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.stroke(); ctx.shadowBlur=0;
  ctx.fillStyle="#000"; ctx.beginPath(); ctx.arc(TIP,0,5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=col+"88"; ctx.beginPath(); ctx.arc(TIP,0,3,0,Math.PI*2); ctx.fill();
  // Muzzle flash with sparks
  if(shooting){
    ctx.shadowColor="#fff";ctx.shadowBlur=55;
    ctx.fillStyle="#fff";ctx.globalAlpha=0.95;ctx.beginPath();ctx.arc(TIP,0,18,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=col;ctx.globalAlpha=0.8;ctx.beginPath();ctx.arc(TIP,0,11,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=0.85;ctx.strokeStyle="#fff";ctx.lineWidth=2;
    for(let i=0;i<8;i++){const ra=(Math.PI*2*i)/8;const len=12+Math.sin(i*137.5)*8;ctx.beginPath();ctx.moveTo(TIP+Math.cos(ra)*10,Math.sin(ra)*10);ctx.lineTo(TIP+Math.cos(ra)*(10+len),Math.sin(ra)*(10+len));ctx.stroke();}
    ctx.globalAlpha=1;ctx.shadowBlur=0;
  }
  ctx.restore(); ctx.restore();
}

function drawBoss(ctx: CanvasRenderingContext2D, boss:BossSt, img:HTMLImageElement|null, t:number) {
  const sw=520;
  const sh=img&&img.naturalWidth>0 ? sw*(img.naturalHeight/img.naturalWidth) : sw*0.55;
  const hpPct=boss.hp/boss.maxHp; const rage=hpPct<0.3;
  const col=rage?"#FF1111":"#CC2222";
  const entranceScale=Math.min(1, boss.entranceFrames/90);
  const pulse=1+Math.sin(t*0.08)*0.02;

  ctx.save(); ctx.translate(boss.x,boss.y); ctx.scale(entranceScale*pulse,entranceScale*pulse); ctx.rotate(Math.sin(boss.phase)*0.025);
  const gr=sw*0.65+Math.sin(t*0.06)*20;
  const glow=ctx.createRadialGradient(0,0,0,0,0,gr);
  glow.addColorStop(0,col+"99"); glow.addColorStop(0.4,col+"44"); glow.addColorStop(1,col+"00");
  ctx.fillStyle=glow; ctx.beginPath(); ctx.ellipse(0,0,gr,gr*0.65,0,0,Math.PI*2); ctx.fill();
  if(rage){const rr=sw*0.7+Math.sin(t*0.15)*15;ctx.save();ctx.globalAlpha=0.5+Math.sin(t*0.15)*0.3;ctx.strokeStyle="#FF4444";ctx.lineWidth=4;ctx.shadowColor="#FF0000";ctx.shadowBlur=20;ctx.beginPath();ctx.arc(0,0,rr,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.restore();}
  if(boss.vx<0) ctx.scale(-1,1);
  ctx.shadowColor=col; ctx.shadowBlur=rage?60+Math.sin(t*0.12)*20:40;
  if(img&&img.complete&&img.naturalWidth>0){ctx.drawImage(img,-sw/2,-sh/2,sw,sh);}
  else{ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(0,0,sw*0.42,sh*0.28,0,0,Math.PI*2);ctx.fill();}
  ctx.shadowBlur=0; ctx.restore();
  const labelY=boss.y-sh/2*entranceScale*pulse-18;
  ctx.save(); ctx.font="bold 26px 'Arial Black',Arial,sans-serif"; ctx.textAlign="center"; ctx.textBaseline="bottom";
  ctx.shadowColor="#000"; ctx.shadowBlur=8; ctx.fillStyle=rage?"#FF5555":"#FF9999";
  ctx.fillText("⚡ LEVIATHAN BOSS",boss.x,labelY); ctx.shadowBlur=0; ctx.restore();
}

// ─── Join Screen ──────────────────────────────────────────────────────────────

function JoinScreen({ slots, tier, onJoin, onStart }: {
  slots: (SlotInfo|null)[];
  tier: string;
  onJoin: (idx:number, info:NonNullable<SlotInfo>) => void;
  onStart: () => void;
}) {
  const [joining, setJoining] = useState<number|null>(null);
  const [name, setName] = useState(""); const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const [, setLocation] = useLocation();

  const handleJoin = async () => {
    if(!name.trim()||pin.length<4){setErr("Name and 4-digit PIN required");return;}
    setLoading(true); setErr("");
    try {
      const res = await fetch(`${API}/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name.trim(),pin})});
      if(!res.ok) throw new Error();
      const data = await res.json();
      if(joining!==null){
        onJoin(joining,{playerId:data.player.id,playerName:data.player.name,sessionToken:data.sessionToken,balance:Number(data.player.balance),weapon:0});
        setJoining(null); setName(""); setPin("");
      }
    } catch { setErr("Invalid name or PIN. Try again."); }
    setLoading(false);
  };

  const active=slots.filter(Boolean).length;
  const tierLabel=tier.charAt(0).toUpperCase()+tier.slice(1);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" style={{background:"rgba(0,8,22,0.97)"}}>
      <div className="text-5xl mb-3">🌊</div>
      <h1 className="text-4xl font-black tracking-widest uppercase mb-1" style={{color:"#00E5FF",textShadow:"0 0 30px #00E5FF80"}}>
        4-Player Boss Battle
      </h1>
      <p className="text-muted-foreground font-mono mb-8 text-xs uppercase tracking-widest">{tierLabel} Room · Hunt fish · Slay the Leviathan Boss</p>

      <div className="grid grid-cols-4 gap-4 mb-8 w-full max-w-4xl px-6">
        {CANNON_LABELS.map((label,i)=>{
          const slot=slots[i];
          const k=KEYS[i];
          const keyHint="Mouse + Click";
          return (
            <div key={i} className="rounded-2xl border-2 p-4 flex flex-col items-center gap-2 transition-all"
              style={{borderColor:slot?CANNON_COLORS[i]:"#ffffff22",background:slot?`${CANNON_COLORS[i]}11`:"rgba(255,255,255,0.02)",boxShadow:slot?`0 0 24px ${CANNON_COLORS[i]}44`:"none"}}>
              <div className="text-3xl font-black" style={{color:CANNON_COLORS[i]}}>{label}</div>
              <div className="text-[10px] text-muted-foreground font-mono text-center">{keyHint}</div>
              {slot ? (
                <>
                  <div className="text-white font-bold text-sm text-center truncate w-full">{slot.playerName}</div>
                  <div className="flex items-center gap-1"><Coins className="w-3 h-3 text-yellow-400"/><span className="font-mono text-xs text-yellow-400 font-bold">{slot.balance.toLocaleString()}</span></div>
                  <div className="text-xs font-mono font-bold" style={{color:CANNON_COLORS[i]}}>✓ READY</div>
                </>
              ) : (
                <>
                  <div className="text-muted-foreground text-xs">Empty Slot</div>
                  <Button size="sm" variant="outline" onClick={()=>{setJoining(i);setErr("");setName("");setPin("");}}
                    style={{borderColor:CANNON_COLORS[i],color:CANNON_COLORS[i]}}>
                    Join
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <Button onClick={onStart} disabled={active===0} size="lg"
        className="h-14 px-16 text-xl font-black uppercase tracking-widest mb-3"
        style={{background:active>0?"linear-gradient(135deg,#00C9FF,#0055DD)":undefined}}>
        {active===0?"Waiting for players…":`⚡ Start Battle (${active} Player${active>1?"s":""})`}
      </Button>
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={()=>setLocation("/lobby")}>← Back to Lobby</Button>

      {joining!==null&&(
        <div className="absolute inset-0 flex items-center justify-center" style={{background:"rgba(0,0,0,0.82)"}}>
          <div className="rounded-2xl border-2 p-8 w-80 flex flex-col gap-4" style={{borderColor:CANNON_COLORS[joining],background:"#07080f"}}>
            <h3 className="text-xl font-black text-center" style={{color:CANNON_COLORS[joining]}}>{CANNON_LABELS[joining]} — Join Game</h3>
            <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Player Name" className="bg-black/60" onKeyDown={e=>e.key==="Enter"&&handleJoin()}/>
            <Input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="4-Digit PIN" type="password" className="bg-black/60" onKeyDown={e=>e.key==="Enter"&&handleJoin()}/>
            {err&&<p className="text-red-400 text-sm text-center">{err}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={()=>setJoining(null)} className="flex-1">Cancel</Button>
              <Button onClick={handleJoin} disabled={loading} className="flex-1 font-bold" style={{background:CANNON_COLORS[joining],color:"#000"}}>
                {loading?"…":"Join"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const mkCannon = (): CState => ({ angle:-Math.PI/2, shotCooldown:0, muzzleFlash:0, mouseDown:false, keyFire:false, weapon:0, bossHits:0 });

export default function MultiplayerGame() {
  const search   = useSearch();
  const tier     = (new URLSearchParams(search).get("tier")||"bronze") as string;
  const tierMult = TIER[tier]??1;
  const [,setLocation] = useLocation();

  const [slots,      setSlots]      = useState<(SlotInfo|null)[]>([null,null,null,null]);
  const [phase,      setPhase]      = useState<"join"|"playing"|"boss-result">("join");
  const [bossWarn,   setBossWarn]   = useState(false);
  const [bossResult, setBossResult] = useState<BossResult|null>(null);
  const [fever,      setFever]      = useState(false);
  const [p1Weapon,   setP1Weapon]   = useState(0);
  const [ready,      setReady]      = useState(false);

  const cvs        = useRef<HTMLCanvasElement>(null);
  const mouseRef   = useRef({x:400,y:300});
  const keysRef    = useRef<Set<string>>(new Set());
  const slotsRef   = useRef<(SlotInfo|null)[]>([null,null,null,null]);
  const tierRef    = useRef(tier);
  const tierMultRef= useRef(tierMult);
  const spriteImgs = useRef<HTMLImageElement[]>([]);
  const bgImgRef   = useRef<HTMLImageElement|null>(null);
  const ambientRef = useRef(false);
  const bossKilledRef = useRef(false);

  const stRef = useRef<GameSt>({
    cannons:[...Array(N)].map(mkCannon),
    fish:[],bullets:[],booms:[],coins:[],ripples:[],bubbles:[],
    boss:null, bossWarnFrames:0, bossTimerFrames:0,
    collectiveKills:0, nextBossAt:BOSS_KILLS_AT,
    nextLuckyAt:2200, feverFrames:0, nextFeverAt:1800,
    t:0, raf:0, nextId:0,
  });

  // mouseSlotRef = which slot the mouse controls.
  // If P1 is filled → 0 (normal). Otherwise → first filled slot (so solo P2/P3/P4 can use mouse too).
  const mouseSlotRef = useRef<number>(0);
  useEffect(()=>{
    slotsRef.current=[...slots];
    // Initial mouse-slot assignment: lowest-index filled slot.
    // The actual slot is re-selected dynamically on every mouse move
    // (see onMove) so the cannon nearest the cursor takes control.
    const filled=slots.map((s,i)=>s?i:-1).filter(i=>i>=0);
    mouseSlotRef.current=filled.length>0?filled[0]:0;
  },[slots]);
  useEffect(()=>{tierRef.current=tier;tierMultRef.current=TIER[tier]??1;},[tier]);

  // ── Boss kill payout (async, triggered from canvas loop) ──
  const bossKillRef = useRef<()=>void>(()=>{});
  useEffect(()=>{
    bossKillRef.current=async()=>{
      if(bossKilledRef.current)return;
      bossKilledRef.current=true;
      const st=stRef.current;
      const tm=tierMultRef.current;
      const basePrize=BOSS_PRIZE_BASE*tm;
      const active=slotsRef.current.map((s,i)=>s?{slot:s,idx:i,hits:st.cannons[i].bossHits}:null).filter(Boolean) as {slot:NonNullable<SlotInfo>;idx:number;hits:number}[];
      const totalHits=active.reduce((s,c)=>s+c.hits,0);
      const payouts=active.map(c=>({
        sessionToken:c.slot.sessionToken,
        amount:totalHits>0?Math.floor((c.hits/totalHits)*basePrize):Math.floor(basePrize/Math.max(active.length,1)),
      }));
      try {
        const res=await fetch(`${API}/game/boss-payout`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payouts,tier:tierRef.current,note:"Leviathan Boss Kill Reward"})});
        const data=await res.json();
        setSlots(prev=>prev.map((s,i)=>{
          if(!s)return s;
          const r=data.results?.find((r:{playerName:string;newBalance:number})=>r.playerName===s.playerName);
          return r?{...s,balance:r.newBalance}:s;
        }));
      } catch { /* credit locally via optimistic update below */ }
      setBossResult({
        total:basePrize,
        results:active.map((c,pi)=>({
          name:c.slot.playerName, hits:c.hits,
          pct:totalHits>0?Math.round((c.hits/totalHits)*100):Math.round(100/active.length),
          prize:payouts[pi]?.amount??0, col:CANNON_COLORS[c.idx],
        })),
      });
      st.boss=null; st.bossTimerFrames=0;
      for(const c of st.cannons)c.bossHits=0;
      st.nextBossAt=st.collectiveKills+BOSS_KILLS_AT;
      soundEngine.playJackpot();
      setPhase("boss-result");
    };
  });

  // ── Fish shoot (calls API, tracks economy) ──
  const shootFishRef = useRef<((fishId:number,ci:number)=>void)>(()=>{});
  useEffect(()=>{
    shootFishRef.current=(fishId:number,ci:number)=>{
      const st=stRef.current;
      const slot=slotsRef.current[ci]; if(!slot)return;
      const fish=st.fish.find(f=>f.id===fishId); if(!fish)return;
      const wIdx=st.cannons[ci].weapon;
      const cost=WEAPONS[wIdx].mult*tierMultRef.current;
      if(slot.balance<cost)return;
      const newBal=slot.balance-cost;
      slotsRef.current[ci]={...slot,balance:newBal};
      setSlots(prev=>{const n=[...prev];n[ci]=slotsRef.current[ci];return n;});
      st.cannons[ci].shotCooldown=SHOT_COOLDOWN[wIdx]; st.cannons[ci].muzzleFlash=18;
      soundEngine.playShot(wIdx);
      const W=cvs.current!.width,H=cvs.current!.height;
      const cx=W*CANNON_X_FRAC[ci],cy=H-CANNON_Y_OFF;
      const ang=st.cannons[ci].angle; const wp=WEAPONS[wIdx];
      // Multiplayer cannon tip: BR=32, BL=58, tip=+8 → total 98 from centre
      const muzzleX=cx+Math.cos(ang)*98, muzzleY=cy+Math.sin(ang)*98;
      const bulletId=st.nextId;
      st.bullets.push({id:st.nextId++,x:muzzleX,y:muzzleY,tx:fish.x,ty:fish.y,trail:[],done:false,col:CANNON_COLORS[ci],targetId:fish.id,speed:wp.speed,radius:wp.radius,cannonIdx:ci,targetType:"fish",hitResult:null});
      const ft=FISH[fish.t]; const feverMult=st.feverFrames>0?2:1; const fishValue=ft.mult*feverMult;
      fetch(`${API}/game/shoot`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sessionToken:slot.sessionToken,game:"fish-hunter",tier:tierRef.current,weaponMultiplier:WEAPONS[wIdx].mult,fishName:ft.name,fishValue})
      }).then(r=>r.json()).then(data=>{
        // Always update balance from API (deduct bet or add winnings)
        slotsRef.current[ci]=slotsRef.current[ci]?{...slotsRef.current[ci]!,balance:data.newBalance}:null;
        setSlots(prev=>{const n=[...prev];n[ci]=slotsRef.current[ci];return n;});
        // Attach result to bullet — effects fire when bullet physically reaches the fish
        const b=stRef.current.bullets.find(bl=>bl.id===bulletId);
        if(b){
          b.hitResult={hit:data.hit,newBalance:data.newBalance,fishSize:ft.size,fishGlow:CANNON_COLORS[ci]};
        } else if(data.hit){
          // Bullet already arrived (rare) — apply effects immediately
          stRef.current.fish=stRef.current.fish.filter(f=>f.id!==fishId);
          stRef.current.collectiveKills++;
        }
      }).catch(()=>{});
    };
  });

  // ── Boss shoot (client-side HP damage, no API call per shot) ──
  const bossShootRef = useRef<((ci:number)=>void)>(()=>{});
  useEffect(()=>{
    bossShootRef.current=(ci:number)=>{
      const st=stRef.current; if(!st.boss||st.cannons[ci].shotCooldown>0)return;
      const slot=slotsRef.current[ci]; if(!slot)return;
      const wIdx=st.cannons[ci].weapon; const cost=WEAPONS[wIdx].mult*tierMultRef.current;
      if(slot.balance<cost)return;
      const newBal=slot.balance-cost;
      slotsRef.current[ci]={...slot,balance:newBal};
      setSlots(prev=>{const n=[...prev];n[ci]=slotsRef.current[ci];return n;});
      st.cannons[ci].shotCooldown=SHOT_COOLDOWN[wIdx]; st.cannons[ci].muzzleFlash=18;
      soundEngine.playShot(wIdx);
      const W=cvs.current!.width,H=cvs.current!.height;
      const cx=W*CANNON_X_FRAC[ci],cy=H-CANNON_Y_OFF;
      const ang=st.cannons[ci].angle; const wp=WEAPONS[wIdx];
      // Multiplayer cannon tip: BR=32, BL=58, tip=+8 → total 98 from centre
      const muzzleX=cx+Math.cos(ang)*98, muzzleY=cy+Math.sin(ang)*98;
      st.bullets.push({id:st.nextId++,x:muzzleX,y:muzzleY,tx:st.boss.x,ty:st.boss.y,trail:[],done:false,col:CANNON_COLORS[ci],targetId:-1,speed:wp.speed,radius:wp.radius,cannonIdx:ci,targetType:"boss",hitResult:null});
    };
  });

  // Sprite loading
  useEffect(()=>{
    Promise.all([Promise.all(FISH.map(f=>loadImg(f.sprite))),loadImg(`${BASE}sprites/bg_underwater.png`)]).then(([imgs,bg])=>{
      spriteImgs.current=imgs; bgImgRef.current=bg; setReady(true);
    });
  },[]);

  const spawnFish=useCallback((W:number,H:number,onScreen:boolean)=>{
    const t=Math.floor(Math.random()*FISH.length); const ft=FISH[t];
    const spd=ft.spd*(0.82+Math.random()*0.36); const sandY=H*0.87; const sz=ft.size;
    const y=sz*0.6+Math.random()*(sandY-sz*1.2); const goLeft=Math.random()>0.5;
    const x=onScreen?sz+Math.random()*Math.max(10,W-sz*2):(goLeft?W+sz*1.6:-sz*1.6);
    stRef.current.fish.push({id:stRef.current.nextId++,x,y,vx:goLeft?-spd:spd,vy:(Math.random()-0.5)*0.3,t,phase:Math.random()*Math.PI*2});
  },[]);

  // ── Main game loop ──
  useEffect(()=>{
    if(!ready||phase!=="playing")return;
    const canvas=cvs.current!; const ctx=canvas.getContext("2d")!; const st=stRef.current;
    const MAX_W=1920, MAX_H=1080;
    const resize=()=>{
      const cssW=canvas.offsetWidth,cssH=canvas.offsetHeight;
      const s=Math.min(1,MAX_W/cssW,MAX_H/cssH);
      canvas.width=Math.round(cssW*s); canvas.height=Math.round(cssH*s);
    };
    resize(); window.addEventListener("resize",resize);
    if(st.fish.length===0) for(let i=0;i<24;i++) spawnFish(canvas.width,canvas.height,i<18);
    if(st.bubbles.length===0) for(let i=0;i<22;i++) st.bubbles.push({x:Math.random()*canvas.width,y:canvas.height*(0.08+Math.random()*0.78),r:2+Math.random()*5,vy:0.3+Math.random()*0.55,phase:Math.random()*Math.PI*2});

    let spawnTick=0; let alive=true;
    const loop=()=>{
      if(!alive)return;
      st.raf=requestAnimationFrame(loop);
      st.t++; spawnTick++;
      const W=canvas.width, H=canvas.height;
      // ── Adaptive quality: auto-disable shadows when fps drops below 42 ──
      const _nt=performance.now();
      if(_lastMs>0){_fpsA=_fpsA*0.94+(1000/Math.max(_nt-_lastMs,1))*0.06;}
      _lastMs=_nt;
      if(_fpsA<42&&hiQ){hiQ=false;try{Object.defineProperty(ctx,'shadowBlur',{get(){return 0;},set(_v){},configurable:true});}catch{}}
      else if(_fpsA>52&&!hiQ){hiQ=true;try{delete (ctx as any).shadowBlur;}catch{}}
      if(spawnTick>=80&&st.fish.filter(f=>!f.lucky).length<38){spawnFish(W,H,false);spawnTick=0;}

      // Lucky fish
      if(st.t>=st.nextLuckyAt&&!st.fish.some(f=>f.lucky)){
        const ti=FISH.length-1; const ft=FISH[ti]; const spd=ft.spd*2.4;
        const sz=ft.size; const y=sz*0.6+Math.random()*(H*0.87-sz*1.2); const goLeft=Math.random()>0.5;
        st.fish.push({id:st.nextId++,x:goLeft?W+sz*1.6:-sz*1.6,y,vx:goLeft?-spd:spd,vy:(Math.random()-0.5)*0.3,t:ti,phase:Math.random()*Math.PI*2,lucky:true});
        st.nextLuckyAt=st.t+2200+Math.floor(Math.random()*800);
      }

      // Keyboard P2–P4 aim (0.07 rad/frame ≈ 4°/frame, fast enough to track fish)
      for(let ci=1;ci<N;ci++){
        const k=KEYS[ci]; const c=st.cannons[ci];
        if(!slotsRef.current[ci])continue;
        if(k.aimL&&keysRef.current.has(k.aimL)) c.angle=Math.max(-Math.PI+0.12,c.angle-0.07);
        if(k.aimR&&keysRef.current.has(k.aimR)) c.angle=Math.min(-0.12,c.angle+0.07);
        c.keyFire=!!(k.fire&&keysRef.current.has(k.fire));
        c.angle=Math.max(-Math.PI+0.12,Math.min(-0.12,c.angle));
      }

      // Boss warning trigger
      if(!st.boss&&st.bossWarnFrames===0&&st.collectiveKills>=st.nextBossAt){
        st.bossWarnFrames=BOSS_WARN_FRAMES; setBossWarn(true); soundEngine.playBossRoar();
      }
      if(st.bossWarnFrames>0){
        st.bossWarnFrames--;
        if(st.bossWarnFrames===0){
          setBossWarn(false); bossKilledRef.current=false;
          st.boss={x:W+320,y:H*0.42,vx:-1.3,vy:0,phase:0,hp:BOSS_HP_BASE,maxHp:BOSS_HP_BASE,entranceFrames:0};
          st.bossTimerFrames=BOSS_DURATION;
        }
      }

      // Boss update
      if(st.boss){
        const b=st.boss;
        b.x+=b.vx; b.vy+=Math.sin(st.t*0.012)*0.04; b.y+=b.vy;
        b.y=Math.max(H*0.18,Math.min(H*0.68,b.y)); b.phase+=0.02;
        if(b.entranceFrames<120)b.entranceFrames++;
        if(b.x<-260)b.vx=Math.abs(b.vx);
        if(b.x>W+260)b.vx=-Math.abs(b.vx);
        st.bossTimerFrames--;
        if(st.bossTimerFrames<=0){
          // Boss escapes
          st.boss=null; st.bossTimerFrames=0;
          for(const c of st.cannons)c.bossHits=0;
          st.nextBossAt=st.collectiveKills+BOSS_KILLS_AT;
        }
      }

      // Mouse aim — controls P1 if filled, otherwise the first-filled slot
      const msi=mouseSlotRef.current;
      if(slotsRef.current[msi]){
        const mx=mouseRef.current.x,my=mouseRef.current.y;
        const cx0=W*CANNON_X_FRAC[msi],cy0=H-CANNON_Y_OFF;
        const raw=Math.atan2(my-cy0,mx-cx0);
        const tgt=Math.max(-Math.PI+0.12,Math.min(-0.12,raw));
        let d=tgt-st.cannons[msi].angle;
        while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI;
        st.cannons[msi].angle+=d*0.30;
        st.cannons[msi].angle=Math.max(-Math.PI+0.12,Math.min(-0.12,st.cannons[msi].angle));
      }

      for(const c of st.cannons){if(c.shotCooldown>0)c.shotCooldown--;if(c.muzzleFlash>0)c.muzzleFlash--;}

      // Auto-fire all cannons
      for(let ci=0;ci<N;ci++){
        const c=st.cannons[ci]; const slot=slotsRef.current[ci];
        if(!slot||c.shotCooldown>0)continue;
        const firing=ci===mouseSlotRef.current?(c.mouseDown||c.keyFire):c.keyFire;
        if(!firing)continue;
        const cx=W*CANNON_X_FRAC[ci],cy=H-CANNON_Y_OFF;
        const cosA=Math.cos(c.angle),sinA=Math.sin(c.angle);
        // Prefer boss if active and aligned
        if(st.boss&&st.boss.entranceFrames>=30){
          const bdx=st.boss.x-cx,bdy=st.boss.y-cy;
          if(bdx*cosA+bdy*sinA>10&&Math.abs(bdx*sinA-bdy*cosA)<300){bossShootRef.current(ci);continue;}
        }
        // Value-weighted targeting: prefer high-value + aligned + nearby fish
        let best:FishObj|null=null,bestScore=-Infinity;
        for(const fish of st.fish){
          const dx=fish.x-cx,dy=fish.y-cy;
          const dot=dx*cosA+dy*sinA; if(dot<=10)continue;
          const perp=Math.abs(dx*sinA-dy*cosA); if(perp>130)continue;
          const dist=Math.hypot(dx,dy)||1;
          const score=(FISH[fish.t].mult*1.8)/(perp+1)/(dist*0.004+1);
          if(score>bestScore){bestScore=score;best=fish;}
        }
        if(best)shootFishRef.current(best.id,ci);
      }

      // Fever
      if(st.feverFrames>0)st.feverFrames--;
      else if(st.t>=st.nextFeverAt){st.feverFrames=480;st.nextFeverAt=st.t+1800+480;setFever(true);soundEngine.playFeverStart();setTimeout(()=>setFever(false),8000);}

      // ── DRAW ──
      drawBG(ctx,W,H,st.t,st.bubbles,bgImgRef.current);

      // Fever overlay
      if(st.feverFrames>0){ctx.save();ctx.globalAlpha=0.06+Math.sin(st.t*0.14)*0.04;ctx.fillStyle="#FFD600";ctx.fillRect(0,0,W,H);ctx.globalAlpha=0.18+Math.sin(st.t*0.18)*0.1;ctx.strokeStyle="#FFD600";ctx.lineWidth=12;ctx.strokeRect(6,6,W-12,H-12);ctx.restore();}
      // Boss warning flash
      if(st.bossWarnFrames>0&&Math.floor(st.t/15)%2===0){ctx.save();ctx.globalAlpha=0.18;ctx.fillStyle="#FF0000";ctx.fillRect(0,0,W,H);ctx.globalAlpha=0.55;ctx.strokeStyle="#FF4444";ctx.lineWidth=18;ctx.strokeRect(9,9,W-18,H-18);ctx.restore();}

      // Boss HP bar
      if(st.boss){
        const pct=st.boss.hp/st.boss.maxHp;
        const bw=W*0.52,bh=22,bx=W/2-bw/2,by=6;
        ctx.fillStyle="#111";ctx.fillRect(bx-2,by-2,bw+4,bh+4);
        const hg=ctx.createLinearGradient(bx,0,bx+bw,0);
        hg.addColorStop(0,"#FF1744");hg.addColorStop(0.5,"#FF6D00");hg.addColorStop(1,"#FF1744");
        ctx.fillStyle=hg;ctx.fillRect(bx,by,bw*pct,bh);
        ctx.strokeStyle="#FF444466";ctx.lineWidth=2;ctx.strokeRect(bx,by,bw,bh);
        ctx.fillStyle="#fff";ctx.font="bold 12px monospace";ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(`⚡ LEVIATHAN  ${st.boss.hp} / ${st.boss.maxHp}`,W/2,by+bh/2);
        const sec=Math.ceil(st.bossTimerFrames/60);
        ctx.font="bold 11px monospace";ctx.textAlign="right";ctx.textBaseline="top";
        ctx.fillStyle=sec<=20?"#FF5555":"#aaa";ctx.fillText(`⏱ ${sec}s`,bx+bw,by+bh+3);
      }

      // Fish
      const mx=mouseRef.current.x,my=mouseRef.current.y;
      let hoveredId:number|null=null;
      for(const fish of st.fish)if(Math.hypot(fish.x-mx,fish.y-my)<FISH[fish.t].size*0.9){hoveredId=fish.id;break;}
      st.fish=st.fish.filter(fish=>{
        const ft=FISH[fish.t];fish.x+=fish.vx;fish.y+=fish.vy;fish.phase+=0.04;
        if(fish.y<ft.size*0.5||fish.y>H*0.86-ft.size*0.5)fish.vy*=-1;
        if(Math.abs(fish.x)>W+ft.size*2.5)return false;
        const img=spriteImgs.current[fish.t];const flip=fish.vx<0;const hover=hoveredId===fish.id;
        const sw=ft.size*1.6;let sh=sw;if(img&&img.naturalWidth>0)sh=sw*(img.naturalHeight/img.naturalWidth);
        ctx.save();ctx.translate(fish.x,fish.y);if(flip)ctx.scale(-1,1);ctx.rotate(Math.sin(fish.phase)*0.045);
        const gr2=hover?ft.size*1.2:ft.size*0.9;const gc=fish.lucky?"#FFD700":ft.glow;
        const gw=ctx.createRadialGradient(0,0,0,0,0,gr2);gw.addColorStop(0,gc+"55");gw.addColorStop(0.6,gc+"18");gw.addColorStop(1,gc+"00");
        ctx.fillStyle=gw;ctx.beginPath();ctx.ellipse(0,0,gr2,gr2*0.65,0,0,Math.PI*2);ctx.fill();
        if(hover){ctx.shadowColor=gc;ctx.shadowBlur=28;ctx.strokeStyle="#fff";ctx.lineWidth=2.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.ellipse(0,0,sw*0.54,sh*0.46,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
        if(img&&img.complete&&img.naturalWidth>0){ctx.shadowColor=gc;ctx.shadowBlur=hover?22:8;ctx.drawImage(img,-sw/2,-sh/2,sw,sh);}
        else{ctx.shadowColor=gc;ctx.shadowBlur=18;ctx.fillStyle=gc;ctx.beginPath();ctx.ellipse(0,0,sw*0.42,sh*0.28,0,0,Math.PI*2);ctx.fill();}
        ctx.shadowBlur=0;ctx.restore();
        drawCoinBadge(ctx,fish.x,fish.y-(sh||sw)*0.52-24,fish.lucky?25:ft.mult);
        return true;
      });

      // Boss
      if(st.boss) drawBoss(ctx,st.boss,spriteImgs.current[4],st.t);

      // Bullets
      st.bullets=st.bullets.filter(b=>{
        if(b.done)return false;
        // Compute dist with OLD tx/ty first — prevents hover-lock from breaking when target moves
        const _preDist=Math.hypot(b.tx-b.x,b.ty-b.y);
        const hitR=b.targetType==="boss"?b.radius+55:b.radius+6;
        if(b.targetType==="boss"&&st.boss){b.tx=st.boss.x;b.ty=st.boss.y;}
        else if(b.targetType==="fish"&&_preDist>hitR){const lf=st.fish.find(f=>f.id===b.targetId);if(lf){b.tx=lf.x;b.ty=lf.y;}}
        const dx=b.tx-b.x,dy=b.ty-b.y,dist=Math.hypot(dx,dy);
        if(dist<hitR){
          if(b.targetType==="fish"){
            if(b.hitResult===null){
              // API still in-flight — hover bullet and wait
              b.x=b.tx;b.y=b.ty;
              // Only draw ring while target still alive — hides ghost rings at dead-fish positions
              if(st.fish.some(f=>f.id===b.targetId)){ctx.save();ctx.globalAlpha=0.55+Math.sin(st.t*0.4)*0.3;ctx.strokeStyle=b.col;ctx.shadowColor=b.col;ctx.shadowBlur=16;ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*2.8,0,Math.PI*2);ctx.stroke();ctx.restore();}
              return true;
            }
            // API result ready — trigger effects at impact point
            b.done=true;
            const res=b.hitResult;
            const bx=b.tx,by=b.ty;
            if(res.hit){
              soundEngine.playImpact();
              soundEngine.playHit(Math.min(7,Math.round(res.fishSize/28)));
              for(let i=0;i<20;i++) st.booms.push({x:bx+(-36+Math.random()*72),y:by+(-36+Math.random()*72),r:10+Math.random()*40,life:1,color:res.fishGlow,ring:i%3===0});
              const cc=12+Math.round(res.fishSize/22);
              for(let i=0;i<cc;i++){const a=Math.PI*2*i/cc;st.coins.push({x:bx,y:by,vx:Math.cos(a)*(1.5+Math.random()*3.5),vy:Math.sin(a)*(1.5+Math.random()*3)-2.5,life:1});}
              st.ripples.push({x:bx,y:by,r:10,life:1});st.ripples.push({x:bx,y:by,r:4,life:0.75});
              st.fish=st.fish.filter(f=>f.id!==b.targetId);
              st.collectiveKills++;
            } else {
              soundEngine.playMiss();
              st.ripples.push({x:bx,y:by,r:6,life:0.7});
            }
            return false;
          }
          b.done=true;
          if(b.targetType==="boss"&&st.boss){
            st.boss.hp-=1;st.cannons[b.cannonIdx].bossHits++;
            soundEngine.playBossHit();
            for(let _i=0;_i<5;_i++)st.booms.push({x:b.tx+(-40+Math.random()*80),y:b.ty+(-40+Math.random()*80),r:12+Math.random()*32,life:1,color:CANNON_COLORS[b.cannonIdx],ring:_i<2});
            if(st.boss.hp<=0&&!bossKilledRef.current){soundEngine.playBossDefeated();bossKillRef.current();}
          }
          return false;
        }
        b.x+=(dx/dist)*b.speed;b.y+=(dy/dist)*b.speed;
        b.trail.push({x:b.x,y:b.y});if(b.trail.length>22)b.trail.shift();
        // Glowing orb trail — filled spheres fading tail→head, no line segments
        for(let i=(hiQ?0:1);i<b.trail.length;i+=(hiQ?1:2)){const a=(i+1)/b.trail.length;ctx.save();ctx.globalAlpha=a*0.62;ctx.shadowColor=b.col;ctx.shadowBlur=8+14*a;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.trail[i].x,b.trail[i].y,b.radius*(0.28+a*0.68),0,Math.PI*2);ctx.fill();ctx.restore();}
        // Bright plasma head: outer halo + white-hot core
        ctx.save();ctx.globalAlpha=0.48;ctx.shadowColor=b.col;ctx.shadowBlur=44;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*2.4,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.save();ctx.shadowColor=b.col;ctx.shadowBlur=22;ctx.fillStyle=b.col;ctx.beginPath();ctx.arc(b.x,b.y,b.radius+2,0,Math.PI*2);ctx.fill();ctx.shadowColor="#fff";ctx.shadowBlur=10;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(b.x,b.y,b.radius*0.55,0,Math.PI*2);ctx.fill();ctx.restore();
        // Weapon-specific visual effects keyed on radius bucket
        if(b.radius<=9&&b.trail.length>0){
          // Pistol/Rifle/Railgun: clean directional tracer lines (no scattered stars)
          const _tr=b.trail[b.trail.length-1];
          const _d=Math.hypot(b.x-_tr.x,b.y-_tr.y)||1;
          const _fx=(b.x-_tr.x)/_d,_fy=(b.y-_tr.y)/_d;
          ctx.save();ctx.strokeStyle=b.col;ctx.lineWidth=1.8;ctx.globalAlpha=0.52;ctx.shadowColor=b.col;ctx.shadowBlur=7;
          ctx.beginPath();ctx.moveTo(b.x-_fy*2.5,b.y+_fx*2.5);ctx.lineTo(b.x-_fy*2.5-_fx*13,b.y+_fx*2.5-_fy*13);ctx.stroke();
          ctx.beginPath();ctx.moveTo(b.x+_fy*2.5,b.y-_fx*2.5);ctx.lineTo(b.x+_fy*2.5-_fx*13,b.y-_fx*2.5-_fy*13);ctx.stroke();
          ctx.restore();
        } else if(b.radius<=13){
          // Cannon: double smoke ring
          ctx.save();ctx.globalAlpha=0.12;ctx.strokeStyle=b.col;ctx.lineWidth=4;ctx.shadowColor=b.col;ctx.shadowBlur=14;
          ctx.beginPath();ctx.arc(b.x,b.y,b.radius*3.0,0,Math.PI*2);ctx.stroke();
          ctx.globalAlpha=0.06;ctx.lineWidth=7;ctx.beginPath();ctx.arc(b.x,b.y,b.radius*4.2,0,Math.PI*2);ctx.stroke();
          ctx.restore();
        } else {
          // Torpedo: bubble wake behind
          if(b.trail.length>5){const bp=b.trail[Math.max(0,b.trail.length-6)];ctx.save();ctx.globalAlpha=0.42;ctx.strokeStyle=b.col;ctx.lineWidth=1.5;ctx.shadowColor=b.col;ctx.shadowBlur=8;[b.radius*0.30,b.radius*0.46,b.radius*0.36].forEach((br,_i)=>{ctx.beginPath();ctx.arc(bp.x+Math.cos((_i+1)*2.1)*10,bp.y+(_i-1)*8,br,0,Math.PI*2);ctx.stroke();});ctx.restore();}
        }
        return true;
      });

      // Effects
      st.booms=st.booms.filter(bm=>{bm.life-=0.045;if(bm.life<=0)return false;ctx.save();ctx.globalAlpha=bm.life;if(bm.ring){ctx.strokeStyle=bm.color;ctx.lineWidth=5*bm.life;ctx.shadowColor=bm.color;ctx.shadowBlur=14;ctx.beginPath();ctx.arc(bm.x,bm.y,bm.r*(2-bm.life),0,Math.PI*2);ctx.stroke();}else{ctx.fillStyle=bm.color;ctx.shadowColor=bm.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(bm.x,bm.y,bm.r*bm.life,0,Math.PI*2);ctx.fill();}ctx.restore();return true;});
      st.coins=st.coins.filter(c=>{c.life-=0.028;if(c.life<=0)return false;c.x+=c.vx;c.y+=c.vy;c.vy+=0.12;ctx.save();ctx.globalAlpha=c.life;ctx.shadowColor="#FFD600";ctx.shadowBlur=8;ctx.fillStyle="#FFD600";ctx.strokeStyle="#B8860B";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(c.x,c.y,9,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();return true;});
      st.ripples=st.ripples.filter(r=>{r.life-=0.04;if(r.life<=0)return false;r.r+=5;ctx.save();ctx.globalAlpha=r.life*0.6;ctx.strokeStyle="#fff";ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,Math.PI*2);ctx.stroke();ctx.restore();return true;});

      // Draw 4 cannons + per-player info above each
      for(let ci=0;ci<N;ci++){
        const slot=slotsRef.current[ci]; if(!slot)continue;
        const cx2=W*CANNON_X_FRAC[ci],cy2=H-CANNON_Y_OFF;
        // Per-cannon auto-fire reticle on targeted fish
        const cc=st.cannons[ci];
        if(((ci===mouseSlotRef.current?(cc.mouseDown||cc.keyFire):cc.keyFire))&&slotsRef.current[ci]){
          const ccosA=Math.cos(cc.angle),csinA=Math.sin(cc.angle);
          let aimF:FishObj|null=null,aimSc=-Infinity;
          for(const fish of st.fish){
            const fdx=fish.x-cx2,fdy=fish.y-cy2;
            if(fdx*ccosA+fdy*csinA<=10)continue;
            const fperp=Math.abs(fdx*csinA-fdy*ccosA);if(fperp>130)continue;
            const fdist=Math.hypot(fdx,fdy)||1;
            const fsc=(FISH[fish.t].mult*1.8)/(fperp+1)/(fdist*0.004+1);
            if(fsc>aimSc){aimSc=fsc;aimF=fish;}
          }
          if(aimF){
            const rf=28+Math.sin(st.t*0.2)*4;
            ctx.save();ctx.globalAlpha=0.60+Math.sin(st.t*0.28)*0.2;
            ctx.strokeStyle=CANNON_COLORS[ci];ctx.lineWidth=2;ctx.shadowColor=CANNON_COLORS[ci];ctx.shadowBlur=12;
            ctx.beginPath();ctx.arc(aimF.x,aimF.y,rf,0,Math.PI*2);ctx.stroke();
            ctx.lineWidth=1.4;const cl=9;
            ctx.beginPath();ctx.moveTo(aimF.x-(rf+4),aimF.y);ctx.lineTo(aimF.x-(rf+cl+4),aimF.y);ctx.stroke();
            ctx.beginPath();ctx.moveTo(aimF.x+(rf+4),aimF.y);ctx.lineTo(aimF.x+(rf+cl+4),aimF.y);ctx.stroke();
            ctx.beginPath();ctx.moveTo(aimF.x,aimF.y-(rf+4));ctx.lineTo(aimF.x,aimF.y-(rf+cl+4));ctx.stroke();
            ctx.beginPath();ctx.moveTo(aimF.x,aimF.y+(rf+4));ctx.lineTo(aimF.x,aimF.y+(rf+cl+4));ctx.stroke();
            ctx.restore();
          }
          // Dashed scan arc on this cannon
          ctx.save();ctx.globalAlpha=0.25+Math.sin(st.t*0.22)*0.09;
          ctx.strokeStyle=CANNON_COLORS[ci];ctx.lineWidth=1.6;ctx.shadowColor=CANNON_COLORS[ci];ctx.shadowBlur=14;
          ctx.setLineDash([6,5]);ctx.lineDashOffset=-(st.t*0.8);
          ctx.beginPath();ctx.arc(cx2,cy2,52+Math.sin(st.t*0.18)*3,-Math.PI,0);ctx.stroke();
          ctx.setLineDash([]);ctx.restore();
        }
        drawCannon(ctx,cx2,cy2,st.cannons[ci].angle,CANNON_COLORS[ci],st.t,st.cannons[ci].muzzleFlash>0);
        ctx.save();
        ctx.font="bold 11px monospace";ctx.textAlign="center";ctx.textBaseline="bottom";
        ctx.shadowColor="#000";ctx.shadowBlur=6;ctx.fillStyle=CANNON_COLORS[ci];
        ctx.fillText(slot.playerName.slice(0,12),cx2,cy2-54);
        ctx.font="9px monospace";ctx.fillStyle="#ffffff88";
        ctx.fillText(WEAPONS[st.cannons[ci].weapon].emoji+" "+WEAPONS[st.cannons[ci].weapon].name,cx2,cy2-42);
        if(st.boss&&st.cannons[ci].bossHits>0){
          ctx.font="bold 10px monospace";ctx.fillStyle=CANNON_COLORS[ci];
          ctx.fillText(`⚡${st.cannons[ci].bossHits} hits`,cx2,cy2-30);
        }
        ctx.shadowBlur=0;ctx.restore();
      }
    };
    loop();

    canvas.style.touchAction="none";
    const onMove=(e:PointerEvent)=>{
      const r=canvas.getBoundingClientRect();
      const sx=canvas.width/r.width,sy=canvas.height/r.height;
      const mx=(e.clientX-r.left)*sx,my=(e.clientY-r.top)*sy;
      mouseRef.current={x:mx,y:my};
      // Whichever joined cannon is horizontally closest to the cursor
      // becomes the mouse-controlled cannon. Lets every player aim/fire
      // with the mouse just by moving into their cannon's region.
      const W=canvas.width;
      let bestI=-1,bestD=Infinity;
      for(let i=0;i<N;i++){
        if(!slotsRef.current[i])continue;
        const cxi=W*CANNON_X_FRAC[i];
        const d=Math.abs(mx-cxi);
        if(d<bestD){bestD=d;bestI=i;}
      }
      if(bestI>=0&&bestI!==mouseSlotRef.current){
        // Releasing previous slot's mouseDown prevents stuck-firing when
        // the cursor leaves its region while the button is held.
        const prev=mouseSlotRef.current;
        if(st.cannons[prev])st.cannons[prev].mouseDown=false;
        mouseSlotRef.current=bestI;
      }
    };
    const onDown=(e:PointerEvent)=>{
      canvas.setPointerCapture(e.pointerId);
      if(!ambientRef.current){soundEngine.startUnderwaterAmbient();ambientRef.current=true;}
      const r=canvas.getBoundingClientRect();
      const sx=canvas.width/r.width,sy=canvas.height/r.height;
      const mx2=(e.clientX-r.left)*sx,my2=(e.clientY-r.top)*sy;
      mouseRef.current={x:mx2,y:my2};
      const msi=mouseSlotRef.current;
      if(!slotsRef.current[msi])return;
      st.cannons[msi].mouseDown=true;
      // Click boss
      if(st.boss&&Math.hypot(st.boss.x-mx2,st.boss.y-my2)<300&&st.cannons[msi].shotCooldown===0){bossShootRef.current(msi);return;}
      // Click fish
      let best:FishObj|null=null,bestD=450;
      for(const fish of st.fish){const d=Math.hypot(fish.x-mx2,fish.y-my2);if(d<bestD){bestD=d;best=fish;}}
      if(best&&st.cannons[msi].shotCooldown===0)shootFishRef.current(best.id,msi);
    };
    const onUp=()=>{const msi=mouseSlotRef.current;if(st.cannons[msi])st.cannons[msi].mouseDown=false;};

    const onKeyDown=(e:KeyboardEvent)=>{
      const k=e.key.toLowerCase();
      keysRef.current.add(k);
      // Weapon cycle for P2–P4
      for(let ci=1;ci<N;ci++){
        const ks=KEYS[ci]; if(!slotsRef.current[ci])continue;
        if(ks.wPrev&&k===ks.wPrev){st.cannons[ci].weapon=Math.max(0,st.cannons[ci].weapon-1);}
        if(ks.wNext&&k===ks.wNext){st.cannons[ci].weapon=Math.min(WEAPONS.length-1,st.cannons[ci].weapon+1);}
      }
      // P1 weapon: 1–5 keys
      if(k>="1"&&k<="5"&&slotsRef.current[0]){
        const wi=parseInt(k)-1;
        st.cannons[0].weapon=wi; setP1Weapon(wi);
      }
      if([" ","arrowleft","arrowright","arrowup","arrowdown"].includes(k))e.preventDefault();
    };
    const onKeyUp=(e:KeyboardEvent)=>{keysRef.current.delete(e.key.toLowerCase());};

    canvas.addEventListener("pointermove",onMove);
    canvas.addEventListener("pointerdown",onDown);
    canvas.addEventListener("pointerup",onUp);
    canvas.addEventListener("pointercancel",onUp);
    window.addEventListener("keydown",onKeyDown);
    window.addEventListener("keyup",onKeyUp);

    return ()=>{
      alive=false; cancelAnimationFrame(st.raf);
      window.removeEventListener("resize",resize);
      canvas.removeEventListener("pointermove",onMove);
      canvas.removeEventListener("pointerdown",onDown);
      canvas.removeEventListener("pointerup",onUp);
      canvas.removeEventListener("pointercancel",onUp);
      window.removeEventListener("keydown",onKeyDown);
      window.removeEventListener("keyup",onKeyUp);
      soundEngine.stopAmbient();
    };
  },[ready,phase,spawnFish]);

  const w=WEAPONS[p1Weapon];

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden select-none" style={{background:"#001520"}}>

      {/* Top HUD */}
      {phase==="playing"&&(
        <div className="z-10 bg-black/70 backdrop-blur-sm border-b border-cyan-400/20 px-3 py-1.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={()=>setLocation("/lobby")} className="text-cyan-300 hover:text-white h-7 px-2">
              <ArrowLeft className="w-3 h-3 mr-1"/>Lobby
            </Button>
            <Users className="w-4 h-4 text-cyan-400"/>
            <span className="text-white font-bold uppercase tracking-widest text-xs">4-Player Boss Battle</span>
            <span className="font-mono text-xs capitalize text-yellow-400 font-bold">[{tier}]</span>
          </div>
          <div className="flex items-center gap-2">
            {slots.map((s,i)=>s&&(
              <div key={i} className="flex items-center gap-1 bg-black/50 rounded-full px-2.5 py-1 border" style={{borderColor:CANNON_COLORS[i]+"44"}}>
                <span className="text-[10px] font-bold font-mono" style={{color:CANNON_COLORS[i]}}>{CANNON_LABELS[i]}</span>
                <span className="text-white/50 text-[10px]">·</span>
                <span className="text-[10px] text-white/80 font-mono truncate max-w-[60px]">{s.playerName}</span>
                <Coins className="w-2.5 h-2.5 text-yellow-400 ml-1"/>
                <span className="font-mono text-[10px] text-yellow-400 font-bold">{Math.floor(s.balance).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden cursor-crosshair">
        {!ready&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#001520] z-10">
            <div className="text-6xl mb-4">🌊</div>
            <div className="text-cyan-300 font-mono text-lg animate-pulse">Loading arena…</div>
          </div>
        )}
        <canvas ref={cvs} className="w-full h-full block"/>

        {/* Join Screen */}
        {phase==="join"&&(
          <JoinScreen slots={slots} tier={tier}
            onJoin={(idx,info)=>setSlots(prev=>{const n=[...prev];n[idx]=info;return n;})}
            onStart={()=>{
              const st=stRef.current;
              Object.assign(st,{fish:[],bullets:[],booms:[],coins:[],ripples:[],bubbles:[],boss:null,bossWarnFrames:0,bossTimerFrames:0,collectiveKills:0,nextBossAt:BOSS_KILLS_AT,t:0,nextId:0,feverFrames:0,nextFeverAt:1800,nextLuckyAt:2200});
              st.cannons=[...Array(N)].map(mkCannon);
              setP1Weapon(0); setPhase("playing");
            }}
          />
        )}

        {/* Boss Warning */}
        {bossWarn&&(
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-20">
            <div className="animate-pulse text-center">
              <div className="text-8xl mb-4">⚡</div>
              <div className="text-5xl font-black tracking-widest px-12 py-6 rounded-3xl border-4 border-red-500"
                style={{background:"rgba(0,0,0,0.9)",color:"#FF4444",textShadow:"0 0 40px #FF000099",boxShadow:"0 0 60px rgba(255,0,0,0.5)"}}>
                ⚡ LEVIATHAN APPROACHING! ⚡
              </div>
              <div className="text-xl text-red-300 mt-4 font-mono font-bold animate-bounce">ALL CANNONS READY — 6 SECONDS</div>
            </div>
          </div>
        )}

        {/* Fever */}
        {fever&&phase==="playing"&&(
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-bounce">
            <div className="text-3xl font-black tracking-widest px-6 py-2 rounded-full border-2 border-yellow-400"
              style={{background:"rgba(0,0,0,0.75)",color:"#FFD600",textShadow:"0 0 30px #FFD600"}}>
              🔥 FEVER TIME! 2× PAYOUT 🔥
            </div>
          </div>
        )}

        {/* Boss Result */}
        {phase==="boss-result"&&bossResult&&(
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center" style={{background:"rgba(0,5,18,0.94)"}}>
            <div className="text-7xl mb-3 animate-bounce">🏆</div>
            <h2 className="text-5xl font-black tracking-widest mb-1" style={{color:"#FFD600",textShadow:"0 0 40px #FFD60080"}}>BOSS DEFEATED!</h2>
            <p className="text-muted-foreground font-mono mb-6 text-sm">Leviathan reward pool: <span className="text-yellow-400 font-bold">{bossResult.total.toLocaleString()} pts</span></p>
            <div className="flex flex-col gap-3 w-full max-w-lg px-6 mb-8">
              {bossResult.results.map((r,i)=>(
                <div key={i} className="rounded-xl p-4 border flex items-center justify-between"
                  style={{borderColor:r.col+"66",background:r.col+"0e"}}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚡</span>
                    <div>
                      <div className="font-bold text-white text-sm">{r.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.hits} hits · {r.pct}% damage</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black font-mono" style={{color:r.col}}>+{r.prize.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">pts</div>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={()=>{setPhase("playing");setBossResult(null);}} size="lg"
              className="px-12 text-lg font-black uppercase tracking-widest h-14"
              style={{background:"linear-gradient(135deg,#00C9FF,#0055DD)"}}>
              ⚡ Continue Hunting
            </Button>
          </div>
        )}
      </div>

      {/* Bottom bar — P1 weapon + key guide */}
      {phase==="playing"&&slots[0]&&(
        <div className="z-10 bg-black/80 backdrop-blur-sm border-t border-cyan-400/15 px-4 py-1.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-mono uppercase tracking-widest mr-2" style={{color:CANNON_COLORS[0]}}>P1 Weapon (1–5)</span>
            {WEAPONS.map((wp,i)=>(
              <button key={i}
                onClick={()=>{stRef.current.cannons[0].weapon=i;setP1Weapon(i);soundEngine.playWeaponSelect();}}
                className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border transition-all"
                style={{color:wp.col,borderColor:p1Weapon===i?wp.col:"#ffffff11",background:p1Weapon===i?wp.bg:"rgba(0,0,0,0.55)",transform:p1Weapon===i?"scale(1.1)":"scale(1)"}}>
                <span className="text-sm leading-none">{wp.emoji}</span>
                <span className="text-[9px] font-bold">{wp.name}</span>
                <span className="text-white/30 text-[8px]">{wp.mult}×</span>
              </button>
            ))}
          </div>
          <div className="text-right">
            <div className="text-[8px] text-muted-foreground font-mono uppercase mb-1">Key Guide</div>
            <div className="flex gap-3 text-[9px] text-muted-foreground font-mono">
              <span style={{color:CANNON_COLORS[1]}}>P2: A/D·SPC·Q/E</span>
              <span style={{color:CANNON_COLORS[2]}}>P3: ←/→·ENT·,/.</span>
              <span style={{color:CANNON_COLORS[3]}}>P4: J/L·M·U/I</span>
            </div>
          </div>
          <div className="text-right ml-4">
            <div className="text-[8px] text-muted-foreground font-mono uppercase">P1 Bet/shot</div>
            <div className="text-lg font-bold font-mono" style={{color:w.col}}>{(w.mult*(TIER[tier]??1)).toLocaleString()} pts</div>
          </div>
        </div>
      )}
    </div>
  );
}
