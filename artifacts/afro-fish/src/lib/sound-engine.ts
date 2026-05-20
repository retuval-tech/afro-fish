class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private ambientNodes: (OscillatorNode | AudioBufferSourceNode)[] = [];
  private ambientTimers: ReturnType<typeof setInterval>[] = [];
  private activeNodes = 0;
  private _lastShotMs = 0;
  private lastJackpotTime = -9999;
  private lastStreak3Time = -9999;
  private lastBossHitTime = -9999;

  private boot() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.78;
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.12;
    this.master.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
  }

  private get ac(): AudioContext { return this.ctx!; }
  private dest(): AudioNode { return this.master!; }

  private noise(dur: number): AudioBuffer {
    const ctx = this.ac;
    const n = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private track(node: AudioScheduledSourceNode) {
    this.activeNodes++;
    node.onended = () => { this.activeNodes = Math.max(0, this.activeNodes - 1); };
  }

  private coin(freq = 1800, vol = 0.14, delayMs = 0) {
    const ctx = this.ac;
    const t = ctx.currentTime + delayMs / 1000;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.58, t + 0.14);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    o.connect(g); g.connect(this.dest());
    o.start(t); o.stop(t + 0.21);
    this.track(o);
  }

  /* ─── WEAPON SHOTS ─────────────────────────────────────────── */
  playShot(idx: number) {
    this.boot();
    const _sNow = Date.now();
    if (this.activeNodes > 14 || _sNow - this._lastShotMs < 48) return;
    this._lastShotMs = _sNow;
    const ctx = this.ac;
    const now = ctx.currentTime;

    const shoot = [
      // 0 — Pistol: sharp crack + laser ping + air echo
      () => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(2600, now); o.frequency.exponentialRampToValueAtTime(120, now + 0.07);
        g.gain.setValueAtTime(0.30, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        o.connect(g); g.connect(this.dest()); o.start(now); o.stop(now + 0.1); this.track(o);
        // Air snap noise
        const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.05);
        const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 4800; nf.Q.value = 0.6;
        const ng = ctx.createGain(); ng.gain.value = 0.24;
        ns.connect(nf); nf.connect(ng); ng.connect(this.dest()); ns.start(now); ns.stop(now + 0.06); this.track(ns);
        // Bright laser ping — the "pew" feel
        const ping = ctx.createOscillator(); const pg = ctx.createGain();
        ping.type = "triangle";
        ping.frequency.setValueAtTime(4400, now); ping.frequency.exponentialRampToValueAtTime(700, now + 0.14);
        pg.gain.setValueAtTime(0.15, now); pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        ping.connect(pg); pg.connect(this.dest()); ping.start(now); ping.stop(now + 0.18); this.track(ping);
      },
      // 1 — Rifle: snappy crack + shell casing clink
      () => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(1200, now); o.frequency.exponentialRampToValueAtTime(38, now + 0.16);
        g.gain.setValueAtTime(0.50, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        o.connect(g); g.connect(this.dest()); o.start(now); o.stop(now + 0.20); this.track(o);
        // Crisp crack noise
        const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.12);
        const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 3200; nf.Q.value = 0.5;
        const ng = ctx.createGain(); ng.gain.value = 0.38; ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
        ns.connect(nf); nf.connect(ng); ng.connect(this.dest()); ns.start(now); ns.stop(now + 0.14); this.track(ns);
        // Shell casing metallic clink (0.08s delay)
        const clink = ctx.createOscillator(); const cg = ctx.createGain();
        clink.type = "triangle";
        clink.frequency.setValueAtTime(3600, now + 0.08); clink.frequency.exponentialRampToValueAtTime(1400, now + 0.24);
        cg.gain.setValueAtTime(0.0001, now + 0.08); cg.gain.linearRampToValueAtTime(0.13, now + 0.09); cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        clink.connect(cg); cg.connect(this.dest()); clink.start(now); clink.stop(now + 0.30); this.track(clink);
      },
      // 2 — Cannon: massive boom + water pressure wave + reverb tail
      () => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(250, now); o.frequency.exponentialRampToValueAtTime(20, now + 0.34);
        g.gain.setValueAtTime(0.78, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.40);
        o.connect(g); g.connect(this.dest()); o.start(now); o.stop(now + 0.44); this.track(o);
        // Deep pressure sub
        const pw = ctx.createOscillator(); const pg = ctx.createGain();
        pw.type = "sine";
        pw.frequency.setValueAtTime(46, now); pw.frequency.exponentialRampToValueAtTime(12, now + 0.48);
        pg.gain.setValueAtTime(0.68, now); pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
        pw.connect(pg); pg.connect(this.dest()); pw.start(now); pw.stop(now + 0.56); this.track(pw);
        // Noise burst
        const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.28);
        const nf = ctx.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 700;
        const ng = ctx.createGain(); ng.gain.value = 0.60; ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        ns.connect(nf); nf.connect(ng); ng.connect(this.dest()); ns.start(now); ns.stop(now + 0.32); this.track(ns);
        // Reverb echo tail
        const rv = ctx.createOscillator(); const rg = ctx.createGain();
        rv.type = "sine";
        rv.frequency.setValueAtTime(80, now + 0.20); rv.frequency.exponentialRampToValueAtTime(16, now + 0.58);
        rg.gain.setValueAtTime(0.0001, now + 0.20); rg.gain.linearRampToValueAtTime(0.30, now + 0.24); rg.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
        rv.connect(rg); rg.connect(this.dest()); rv.start(now); rv.stop(now + 0.66); this.track(rv);
      },
      // 3 — Railgun: high electric sweep + crackling + ionization hiss
      () => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(4400, now); o.frequency.exponentialRampToValueAtTime(30, now + 0.42);
        g.gain.setValueAtTime(0.60, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
        o.connect(g); g.connect(this.dest()); o.start(now); o.stop(now + 0.48); this.track(o);
        // Sub punch
        const sub = ctx.createOscillator(); const sg = ctx.createGain();
        sub.type = "sine";
        sub.frequency.setValueAtTime(65, now); sub.frequency.exponentialRampToValueAtTime(14, now + 0.36);
        sg.gain.setValueAtTime(0.86, now); sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.40);
        sub.connect(sg); sg.connect(this.dest()); sub.start(now); sub.stop(now + 0.44); this.track(sub);
        // Electric crackle burst (high bandpass noise)
        const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.18);
        const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 5500; nf.Q.value = 1.3;
        const ngl = ctx.createGain(); ngl.gain.value = 0.46; ngl.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        ns.connect(nf); nf.connect(ngl); ngl.connect(this.dest()); ns.start(now); ns.stop(now + 0.20); this.track(ns);
        // Ionization residual hiss (slower decay)
        const hz = ctx.createBufferSource(); hz.buffer = this.noise(0.40);
        const hzf = ctx.createBiquadFilter(); hzf.type = "highpass"; hzf.frequency.value = 3800;
        const hzg = ctx.createGain(); hzg.gain.value = 0.0001; hzg.gain.linearRampToValueAtTime(0.18, now + 0.07); hzg.gain.exponentialRampToValueAtTime(0.0001, now + 0.40);
        hz.connect(hzf); hzf.connect(hzg); hzg.connect(this.dest()); hz.start(now); hz.stop(now + 0.44); this.track(hz);
      },
      // 4 — Torpedo: deep dive + sonar ping + rising bubble trail
      () => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(58, now); o.frequency.exponentialRampToValueAtTime(12, now + 0.62);
        g.gain.setValueAtTime(0.94, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);
        o.connect(g); g.connect(this.dest()); o.start(now); o.stop(now + 0.72); this.track(o);
        // Water implosion noise
        const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.55);
        const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 90; nf.Q.value = 1.6;
        const ng = ctx.createGain(); ng.gain.value = 0.74; ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.54);
        ns.connect(nf); nf.connect(ng); ng.connect(this.dest()); ns.start(now); ns.stop(now + 0.58); this.track(ns);
        // Sonar ping — distinctive torpedo launch
        const ping = ctx.createOscillator(); const pg = ctx.createGain();
        ping.type = "sine";
        ping.frequency.setValueAtTime(960, now); ping.frequency.exponentialRampToValueAtTime(420, now + 0.20);
        pg.gain.setValueAtTime(0.24, now); pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        ping.connect(pg); pg.connect(this.dest()); ping.start(now); ping.stop(now + 0.28); this.track(ping);
        // Rising bubble trail (3 staggered pops)
        [0.16, 0.28, 0.42].forEach(dt => {
          const bp = ctx.createOscillator(); const bpg = ctx.createGain();
          bp.type = "sine";
          const bf = 200 + Math.random() * 300;
          bp.frequency.setValueAtTime(bf, now + dt); bp.frequency.linearRampToValueAtTime(bf * 2.8, now + dt + 0.048);
          bpg.gain.setValueAtTime(0.09, now + dt); bpg.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.064);
          bp.connect(bpg); bpg.connect(this.dest()); bp.start(now + dt); bp.stop(now + dt + 0.08); this.track(bp);
        });
      },
    ];

    shoot[Math.min(idx, 4)]();
  }

  /* ─── BULLET IMPACT (immediate crack when bullet arrives) ───── */
  playImpact() {
    this.boot();
    if (this.activeNodes > 28) return;
    const ctx = this.ac; const now = ctx.currentTime;
    // Sharp metallic crack — very brief, confirms physical contact
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(1100, now);
    o.frequency.exponentialRampToValueAtTime(220, now + 0.045);
    g.gain.setValueAtTime(0.26, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.058);
    o.connect(g); g.connect(this.dest());
    o.start(now); o.stop(now + 0.065); this.track(o);

    // Metallic noise burst
    const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.04);
    const nf = ctx.createBiquadFilter(); nf.type = "highpass"; nf.frequency.value = 3000;
    const ng = ctx.createGain(); ng.gain.value = 0.18;
    ns.connect(nf); nf.connect(ng); ng.connect(this.dest());
    ns.start(now); ns.stop(now + 0.05); this.track(ns);
  }

  /* ─── HIT (water splash + coins) ──────────────────────────── */
  playHit(multiplier: number) {
    this.boot();
    if (this.activeNodes > 26) return;
    const ctx = this.ac;
    const now = ctx.currentTime;

    // Impact thud
    const thud = ctx.createOscillator(); const tg = ctx.createGain();
    thud.type = "sine";
    const pitchV = 0.82 + Math.random() * 0.36; // slight random pitch so each hit feels unique
    thud.frequency.setValueAtTime(130 * pitchV, now);
    thud.frequency.exponentialRampToValueAtTime(26 * pitchV, now + 0.32);
    tg.gain.setValueAtTime(0.58, now);
    tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    thud.connect(tg); tg.connect(this.dest());
    thud.start(now); thud.stop(now + 0.40); this.track(thud);

    // Splash burst
    const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.3);
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1600; nf.Q.value = 0.4;
    const ng = ctx.createGain(); ng.gain.value = 0.38;
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    ns.connect(nf); nf.connect(ng); ng.connect(this.dest());
    ns.start(now); ns.stop(now + 0.32); this.track(ns);

    // Coin cascade — 3 coins minimum for all multipliers, more for big fish
    const coinCount = Math.min(9, 3 + multiplier);
    for (let i = 0; i < coinCount; i++) {
      this.coin(1500 + Math.random() * 900 + multiplier * 70, 0.14 + multiplier * 0.012, i * 38 + Math.random() * 16);
    }

    // Win fanfare for big fish
    if (multiplier >= 3) {
      const scale = multiplier >= 7
        ? [261.6, 329.6, 392, 523.3, 659.3, 784, 1046.5]
        : [261.6, 329.6, 392, 523.3, 659.3];
      scale.forEach((freq, i) => {
        const t = now + 0.04 + i * 0.052;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "triangle"; o.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.17, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        o.connect(g); g.connect(this.dest());
        o.start(t); o.stop(t + 0.30); this.track(o);
      });
    }
  }

  /* ─── DRAGON HIT (roar + ember cascade) ────────────────────── */
  playDragonHit(multiplier: number) {
    this.boot();
    if (this.activeNodes > 26) return;
    const ctx = this.ac;
    const now = ctx.currentTime;

    // Roar: modulated noise burst
    const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.65);
    const roarF = ctx.createBiquadFilter(); roarF.type = "bandpass"; roarF.frequency.value = 210; roarF.Q.value = 3.2;
    const roarG = ctx.createGain();
    roarG.gain.setValueAtTime(0.0001, now);
    roarG.gain.linearRampToValueAtTime(0.82, now + 0.055);
    roarG.gain.setValueAtTime(0.82, now + 0.22);
    roarG.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
    ns.connect(roarF); roarF.connect(roarG); roarG.connect(this.dest());
    ns.start(now); ns.stop(now + 0.68); this.track(ns);

    // Sub boom
    const boom = ctx.createOscillator(); const bg = ctx.createGain();
    boom.type = "sine";
    boom.frequency.setValueAtTime(82, now);
    boom.frequency.exponentialRampToValueAtTime(17, now + 0.5);
    bg.gain.setValueAtTime(0.88, now);
    bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    boom.connect(bg); bg.connect(this.dest());
    boom.start(now); boom.stop(now + 0.58); this.track(boom);

    // Coin rain — 4 minimum, scales with dragon
    const coinCount = Math.min(12, 4 + multiplier * 2);
    for (let i = 0; i < coinCount; i++) {
      this.coin(1300 + Math.random() * 1000, 0.13, i * 34 + Math.random() * 14);
    }

    // Magical arp for big dragons
    if (multiplier >= 2) {
      const notes = [196, 246.9, 293.7, 392, 493.9, 587.3, 784, 987.8];
      const count = Math.min(notes.length, 2 + multiplier * 2);
      for (let i = 0; i < count; i++) {
        const t = now + 0.055 + i * 0.058;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "triangle"; o.frequency.value = notes[i];
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.17, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        o.connect(g); g.connect(this.dest());
        o.start(t); o.stop(t + 0.30); this.track(o);
      }
    }
  }

  /* ─── MISS (improved — distinct water splash or dragon dodge) ── */
  playMiss(isDragon = false) {
    this.boot();
    if (this.activeNodes > 28) return;
    const ctx = this.ac;
    const now = ctx.currentTime;

    // Main downward fail sweep — fuller and deeper
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(isDragon ? 240 : 420, now);
    o.frequency.exponentialRampToValueAtTime(isDragon ? 44 : 95, now + 0.36);
    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    o.connect(g); g.connect(this.dest());
    o.start(now); o.stop(now + 0.46); this.track(o);

    // Water splash (fish) or wind whoosh (dragon)
    const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.28);
    const nf = ctx.createBiquadFilter();
    nf.type = isDragon ? "bandpass" : "lowpass";
    nf.frequency.value = isDragon ? 700 : 900;
    nf.Q.value = isDragon ? 2.2 : 0.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(isDragon ? 0.32 : 0.28, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    ns.connect(nf); nf.connect(ng); ng.connect(this.dest());
    ns.start(now); ns.stop(now + 0.26); this.track(ns);

    // Second sub-pitch for more body
    const sub = ctx.createOscillator(); const sg = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(isDragon ? 110 : 180, now);
    sub.frequency.exponentialRampToValueAtTime(isDragon ? 32 : 55, now + 0.28);
    sg.gain.setValueAtTime(0.22, now);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);
    sub.connect(sg); sg.connect(this.dest());
    sub.start(now); sub.stop(now + 0.32); this.track(sub);
  }

  /* ─── LUCKY FISH / DRAGON APPEARS ──────────────────────────── */
  playLucky() {
    this.boot();
    if (this.activeNodes > 26) return;
    const ctx = this.ac; const now = ctx.currentTime;
    // Rising sparkle arp
    [523.3, 659.3, 784, 1046.5, 1318.5, 1568].forEach((f, i) => {
      const t = now + i * 0.058;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.07, t + 0.09);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g); g.connect(this.dest());
      o.start(t); o.stop(t + 0.28); this.track(o);
    });
    // Gold coin shimmer
    for (let i = 0; i < 10; i++) {
      this.coin(1600 + Math.random() * 600, 0.11, i * 28 + Math.random() * 12);
    }
  }

  /* ─── 3× STREAK MILESTONE ──────────────────────────────────── */
  playStreak3() {
    this.boot();
    if (this.activeNodes > 26) return;
    const ctx = this.ac; const now = ctx.currentTime;
    if (now - this.lastStreak3Time < 0.8) return;
    this.lastStreak3Time = now;
    // Quick 3-note ascending arp — lighter than jackpot
    [392, 523.3, 659.3].forEach((f, i) => {
      const t = now + i * 0.065;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(this.dest());
      o.start(t); o.stop(t + 0.26); this.track(o);
    });
    for (let i = 0; i < 5; i++) this.coin(1400 + Math.random() * 400, 0.10, i * 40 + Math.random() * 16);
  }

  /* ─── JACKPOT (streak milestones + 5×) ─────────────────────── */
  playJackpot() {
    this.boot();
    const now = this.ac.currentTime;
    if (now - this.lastJackpotTime < 1.2) return;
    this.lastJackpotTime = now;

    const ctx = this.ac;
    const scale = [261.6, 329.6, 392, 523.3, 659.3, 784, 1046.5, 1318.5];
    scale.forEach((f, i) => {
      const t = now + i * 0.05;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = i % 2 === 0 ? "triangle" : "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.19, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(this.dest());
      o.start(t); o.stop(t + 0.33); this.track(o);
    });
    for (let i = 0; i < 18; i++) {
      this.coin(1000 + Math.random() * 1400, 0.11, i * 30 + Math.random() * 14);
    }
  }

  /* ─── FEVER START (distinct from jackpot) ──────────────────── */
  playFeverStart() {
    this.boot();
    const ctx = this.ac;
    const now = ctx.currentTime;

    // Rising octave sweep
    const rising = [130.8, 196, 261.6, 392, 523.3, 784, 1046.5, 1568, 2093];
    rising.forEach((f, i) => {
      const t = now + i * 0.055;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = i % 3 === 0 ? "triangle" : i % 3 === 1 ? "sine" : "square";
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.04, t + 0.08);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.20, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.connect(g); g.connect(this.dest());
      o.start(t); o.stop(t + 0.38); this.track(o);
    });

    // Noise swoosh
    const swoop = ctx.createBufferSource(); swoop.buffer = this.noise(0.55);
    const sf = ctx.createBiquadFilter(); sf.type = "bandpass"; sf.frequency.value = 600; sf.Q.value = 0.3;
    sf.frequency.linearRampToValueAtTime(2400, ctx.currentTime + 0.55);
    const sg = ctx.createGain(); sg.gain.value = 0.0001;
    sg.gain.linearRampToValueAtTime(0.25, now + 0.18);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    swoop.connect(sf); sf.connect(sg); sg.connect(this.dest());
    swoop.start(now); swoop.stop(now + 0.58); this.track(swoop);

    // Dense coin shower
    for (let i = 0; i < 22; i++) {
      this.coin(800 + Math.random() * 1600, 0.12, i * 35 + Math.random() * 15);
    }
  }

  /* ─── BUBBLE (medium — public, used by fish games) ─────────── */
  playBubble() {
    this.boot();
    const ctx = this.ac; const now = ctx.currentTime;
    const freq = 480 + Math.random() * 640;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 0.6, now);
    o.frequency.linearRampToValueAtTime(freq * 2.6, now + 0.052);
    g.gain.setValueAtTime(0.055, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
    o.connect(g); g.connect(this.dest()); o.start(now); o.stop(now + 0.07); this.track(o);
  }

  private _bubbleSmall() {
    if (!this.ctx) return;
    const ctx = this.ctx; const now = ctx.currentTime;
    const freq = 900 + Math.random() * 1400;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, now); o.frequency.linearRampToValueAtTime(freq * 3.2, now + 0.024);
    g.gain.setValueAtTime(0.032, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.034);
    o.connect(g); g.connect(this.dest()); o.start(now); o.stop(now + 0.042); this.track(o);
  }

  private _bubbleLarge() {
    if (!this.ctx) return;
    const ctx = this.ctx; const now = ctx.currentTime;
    const freq = 160 + Math.random() * 120;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 0.5, now); o.frequency.linearRampToValueAtTime(freq * 2.4, now + 0.16);
    g.gain.setValueAtTime(0.078, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);
    o.connect(g); g.connect(this.dest()); o.start(now); o.stop(now + 0.24); this.track(o);
    // Bloop noise burst
    const ns = ctx.createBufferSource(); ns.buffer = this.noise(0.14);
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = freq * 1.8; nf.Q.value = 3.2;
    const ng = ctx.createGain(); ng.gain.value = 0.038; ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    ns.connect(nf); nf.connect(ng); ng.connect(this.dest()); ns.start(now); ns.stop(now + 0.16); this.track(ns);
  }

  /* ─── AMBIENT: UNDERWATER ──────────────────────────────────── */
  startUnderwaterAmbient() {
    this.boot();
    this.stopAmbient();
    const ctx = this.ac;

    // Deep sub pulse (LFO-modulated)
    const sub = ctx.createOscillator(); const sg = ctx.createGain();
    sub.type = "sine"; sub.frequency.value = 42; sg.gain.value = 0.12;
    const subLfo = ctx.createOscillator(); const slg = ctx.createGain();
    subLfo.frequency.value = 0.07; slg.gain.value = 3;
    subLfo.connect(slg); slg.connect(sub.frequency);
    sub.connect(sg); sg.connect(this.dest()); sub.start(); subLfo.start();

    // Harmonic shimmer
    const harm = ctx.createOscillator(); const hg = ctx.createGain();
    harm.type = "triangle"; harm.frequency.value = 84; hg.gain.value = 0.038;
    const hLfo = ctx.createOscillator(); const hlg = ctx.createGain();
    hLfo.frequency.value = 0.11; hlg.gain.value = 5;
    hLfo.connect(hlg); hlg.connect(harm.frequency);
    harm.connect(hg); hg.connect(this.dest()); harm.start(); hLfo.start();

    // Water current noise (slightly richer)
    const ws = ctx.createBufferSource(); ws.buffer = this.noise(4); ws.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = "bandpass"; wf.frequency.value = 190; wf.Q.value = 0.25;
    const wg = ctx.createGain(); wg.gain.value = 0.058;
    ws.connect(wf); wf.connect(wg); wg.connect(this.dest()); ws.start();

    // High-frequency underwater shimmer (new — adds sparkle)
    const shimmer = ctx.createBufferSource(); shimmer.buffer = this.noise(4); shimmer.loop = true;
    const shf = ctx.createBiquadFilter(); shf.type = "bandpass"; shf.frequency.value = 2800; shf.Q.value = 2.5;
    const shg = ctx.createGain(); shg.gain.value = 0.008;
    shimmer.connect(shf); shf.connect(shg); shg.connect(this.dest()); shimmer.start();

    this.ambientNodes.push(sub, subLfo, harm, hLfo, ws, shimmer);

    // ── Varied 3-size bubble scheduler (more frequent + clustered) ──
    const bt = setInterval(() => {
      const r = Math.random();
      if (r < 0.50) this._bubbleSmall();
      else if (r < 0.82) this.playBubble();
      else this._bubbleLarge();
      // Occasional cluster burst
      if (Math.random() < 0.22) {
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          setTimeout(() => { Math.random() < 0.6 ? this._bubbleSmall() : this.playBubble(); }, 55 + i * 75 + Math.random() * 55);
        }
      }
    }, 650 + Math.random() * 750);
    this.ambientTimers.push(bt);

    // ── Soft pentatonic melody pad — gives life while fish swim ──
    // Cycles through low pentatonic: G2 A2 C3 D3 G3 A3 — very quiet drifting feel
    const pentatonic = [98, 110, 130.8, 146.8, 196, 220, 261.6, 293.7];
    let padIdx = 0;
    const playPad = () => {
      if (!this.ctx) return;
      const c = this.ctx; const t = c.currentTime;
      const freq = pentatonic[padIdx % pentatonic.length] * (Math.random() < 0.15 ? 2 : 1);
      padIdx++;
      const o = c.createOscillator(); const g = c.createGain();
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.022, t + 0.5);
      g.gain.setValueAtTime(0.022, t + 2.2); g.gain.linearRampToValueAtTime(0, t + 3.2);
      o.connect(lp); lp.connect(g); g.connect(this.dest());
      o.start(t); o.stop(t + 3.6); this.track(o);
    };
    const padTimer = setInterval(() => { if (Math.random() < 0.72) playPad(); }, 2600);
    this.ambientTimers.push(padTimer);

    // ── Water swirl whoosh (every 5–11s — like a current passing) ──
    const scheduleSwirl = () => {
      const delay = 5000 + Math.random() * 6000;
      const st2 = setTimeout(() => {
        if (!this.ctx) return;
        const c = this.ctx; const t = c.currentTime;
        const ns = c.createBufferSource(); ns.buffer = this.noise(0.9);
        const f = c.createBiquadFilter(); f.type = "bandpass";
        f.frequency.setValueAtTime(280, t); f.frequency.linearRampToValueAtTime(2000, t + 0.4); f.Q.value = 0.5;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.062, t + 0.18);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.82);
        ns.connect(f); f.connect(g); g.connect(this.dest()); ns.start(t); ns.stop(t + 0.90); this.track(ns);
        scheduleSwirl();
      }, delay);
      this.ambientTimers.push(st2 as unknown as ReturnType<typeof setInterval>);
    };
    scheduleSwirl();

    // ── Whale moans (more frequent: every 12–22s) ──
    const scheduleWhale = () => {
      const delay = 12000 + Math.random() * 10000;
      const wt = setTimeout(() => {
        if (!this.ctx) return;
        const c = this.ctx; const t = c.currentTime;
        const wOsc = c.createOscillator(); const wG = c.createGain();
        wOsc.type = "sine";
        wOsc.frequency.setValueAtTime(52, t); wOsc.frequency.linearRampToValueAtTime(39, t + 2.5); wOsc.frequency.linearRampToValueAtTime(47, t + 4);
        wG.gain.setValueAtTime(0, t); wG.gain.linearRampToValueAtTime(0.068, t + 0.8);
        wG.gain.setValueAtTime(0.068, t + 2.8); wG.gain.linearRampToValueAtTime(0, t + 4.4);
        const wFilt = c.createBiquadFilter(); wFilt.type = "lowpass"; wFilt.frequency.value = 200;
        wOsc.connect(wFilt); wFilt.connect(wG); wG.connect(this.dest());
        wOsc.start(t); wOsc.stop(t + 4.8); this.track(wOsc);
        scheduleWhale();
      }, delay);
      this.ambientTimers.push(wt as unknown as ReturnType<typeof setInterval>);
    };
    scheduleWhale();
  }

  /* ─── AMBIENT: DRAGON / VOLCANIC ──────────────────────────── */
  startMysticalAmbient() {
    this.boot();
    this.stopAmbient();
    const ctx = this.ac;

    // Earth rumble
    const rumble = ctx.createOscillator(); const rg = ctx.createGain();
    rumble.type = "sawtooth"; rumble.frequency.value = 28; rg.gain.value = 0.06;
    const rLfo = ctx.createOscillator(); const rlg = ctx.createGain();
    rLfo.frequency.value = 0.05; rlg.gain.value = 6;
    rLfo.connect(rlg); rlg.connect(rumble.frequency);
    const rFilt = ctx.createBiquadFilter(); rFilt.type = "lowpass"; rFilt.frequency.value = 65;
    rumble.connect(rFilt); rFilt.connect(rg); rg.connect(this.dest());
    rumble.start(); rLfo.start();

    // Sub heartbeat
    const heart = ctx.createOscillator(); const hg = ctx.createGain();
    heart.type = "sine"; heart.frequency.value = 38; hg.gain.value = 0.055;
    const hLfo = ctx.createOscillator(); const hlg = ctx.createGain();
    hLfo.frequency.value = 0.08; hlg.gain.value = 4;
    hLfo.connect(hlg); hlg.connect(heart.frequency);
    heart.connect(hg); hg.connect(this.dest());
    heart.start(); hLfo.start();

    // Wind
    const wind = ctx.createBufferSource(); wind.buffer = this.noise(4); wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = "bandpass"; wf.frequency.value = 260; wf.Q.value = 0.22;
    const wg = ctx.createGain(); wg.gain.value = 0.042;
    wind.connect(wf); wf.connect(wg); wg.connect(this.dest());
    wind.start();

    // Lava crackle
    const crackle = ctx.createBufferSource(); crackle.buffer = this.noise(5); crackle.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = "highpass"; cf.frequency.value = 2800;
    const cg = ctx.createGain(); cg.gain.value = 0.015;
    crackle.connect(cf); cf.connect(cg); cg.connect(this.dest());
    crackle.start();

    this.ambientNodes.push(rumble, rLfo, heart, hLfo, wind, crackle);

    // Distant roar
    const scheduleRoar = () => {
      const delay = 12000 + Math.random() * 10000;
      const rt = setTimeout(() => {
        if (!this.ctx) return;
        const c = this.ctx; const t = c.currentTime;
        const ns = c.createBufferSource(); ns.buffer = this.noise(1.0);
        const rf = c.createBiquadFilter(); rf.type = "bandpass"; rf.frequency.value = 190; rf.Q.value = 3.8;
        const rG = c.createGain();
        rG.gain.setValueAtTime(0, t); rG.gain.linearRampToValueAtTime(0.48, t + 0.07); rG.gain.setValueAtTime(0.48, t + 0.5); rG.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        ns.connect(rf); rf.connect(rG); rG.connect(this.dest());
        ns.start(t); ns.stop(t + 1.1); this.track(ns);
        scheduleRoar();
      }, delay);
      this.ambientTimers.push(rt as unknown as ReturnType<typeof setInterval>);
    };
    scheduleRoar();
  }

  /* ─── UI SOUNDS ────────────────────────────────────────────── */
  playClick() {
    this.boot();
    const ctx = this.ac; const now = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 1200;
    g.gain.setValueAtTime(0.11, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.058);
    o.connect(g); g.connect(this.dest());
    o.start(now); o.stop(now + 0.065); this.track(o);
  }

  playWeaponSelect() {
    this.boot();
    const ctx = this.ac; const now = ctx.currentTime;
    [880, 1320, 1760].forEach((f, i) => {
      const t = now + i * 0.038;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.068);
      o.connect(g); g.connect(this.dest());
      o.start(t); o.stop(t + 0.075); this.track(o);
    });
  }

  /* ─── BOSS ROAR (boss spawn warning — deep ominous) ─────────── */
  playBossRoar() {
    this.boot();
    const ctx = this.ac; const now = ctx.currentTime;
    // Bone-shaking sub drop
    const sub = ctx.createOscillator(); const sg = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(88, now);
    sub.frequency.exponentialRampToValueAtTime(16, now + 2.0);
    sg.gain.setValueAtTime(0, now); sg.gain.linearRampToValueAtTime(0.88, now + 0.14);
    sg.gain.setValueAtTime(0.88, now + 0.9); sg.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    sub.connect(sg); sg.connect(this.dest()); sub.start(now); sub.stop(now + 2.4); this.track(sub);
    // Ominous bandpass roar
    const ns = ctx.createBufferSource(); ns.buffer = this.noise(2.0);
    const rf = ctx.createBiquadFilter(); rf.type = "bandpass"; rf.frequency.value = 175; rf.Q.value = 2.8;
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0, now); rg.gain.linearRampToValueAtTime(0.60, now + 0.20);
    rg.gain.setValueAtTime(0.60, now + 1.0); rg.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
    ns.connect(rf); rf.connect(rg); rg.connect(this.dest()); ns.start(now); ns.stop(now + 2.2); this.track(ns);
    // High metal shriek sweeping down
    const shriek = ctx.createOscillator(); const shg = ctx.createGain();
    shriek.type = "sawtooth";
    shriek.frequency.setValueAtTime(3600, now + 0.3);
    shriek.frequency.exponentialRampToValueAtTime(420, now + 1.8);
    shg.gain.setValueAtTime(0.0001, now + 0.3); shg.gain.linearRampToValueAtTime(0.28, now + 0.65);
    shg.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
    const shf = ctx.createBiquadFilter(); shf.type = "bandpass"; shf.frequency.value = 900; shf.Q.value = 3;
    shriek.connect(shf); shf.connect(shg); shg.connect(this.dest());
    shriek.start(now); shriek.stop(now + 2.1); this.track(shriek);
  }

  /* ─── BOSS HIT (rate-limited heavy crunch per bullet) ───────── */
  playBossHit() {
    this.boot();
    const ctx = this.ac; const now = ctx.currentTime;
    if (now - this.lastBossHitTime < 0.14) return;
    this.lastBossHitTime = now;
    if (this.activeNodes > 30) return;
    // Metallic crunch
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(920 + Math.random() * 200, now);
    o.frequency.exponentialRampToValueAtTime(52, now + 0.09);
    g.gain.setValueAtTime(0.48, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.connect(g); g.connect(this.dest()); o.start(now); o.stop(now + 0.14); this.track(o);
    // Sub punch
    const sub = ctx.createOscillator(); const sg = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(115, now); sub.frequency.exponentialRampToValueAtTime(18, now + 0.20);
    sg.gain.setValueAtTime(0.62, now); sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    sub.connect(sg); sg.connect(this.dest()); sub.start(now); sub.stop(now + 0.26); this.track(sub);
  }

  /* ─── BOSS DEFEATED (epic 2-second victory fanfare) ─────────── */
  playBossDefeated() {
    this.boot();
    const ctx = this.ac; const now = ctx.currentTime;
    // Ascending arp — C major two octaves
    [261.6, 329.6, 392, 523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => {
      const t = now + i * 0.075;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = i % 2 === 0 ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.23, t + 0.014);
      g.gain.setValueAtTime(0.23, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g); g.connect(this.dest()); o.start(t); o.stop(t + 0.60); this.track(o);
    });
    // Sustained power chord
    [130.8, 196, 261.6, 392].forEach((f) => {
      const t = now + 0.55;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.17, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.connect(g); g.connect(this.dest()); o.start(t); o.stop(t + 1.6); this.track(o);
    });
    // Big sub explosion
    const boom = ctx.createOscillator(); const bg = ctx.createGain();
    boom.type = "sine";
    boom.frequency.setValueAtTime(125, now); boom.frequency.exponentialRampToValueAtTime(14, now + 0.75);
    bg.gain.setValueAtTime(0.88, now); bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    boom.connect(bg); bg.connect(this.dest()); boom.start(now); boom.stop(now + 0.90); this.track(boom);
    // Coin explosion shower
    for (let i = 0; i < 38; i++) this.coin(700 + Math.random() * 2200, 0.13, i * 38 + Math.random() * 18);
  }

  /* ─── STOP AMBIENT ─────────────────────────────────────────── */
  stopAmbient() {
    this.ambientNodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
    this.ambientNodes = [];
    this.ambientTimers.forEach(t => clearInterval(t));
    this.ambientTimers = [];
  }
}

export const soundEngine = new SoundEngine();
