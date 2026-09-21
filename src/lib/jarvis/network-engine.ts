/**
 * Rendering engine for the living Jarvis intelligence network: thousands of
 * fine points in a slowly rotating, luminous ellipsoid with a concentrated
 * core, whose connecting lines continuously form and dissolve. It has no React
 * or DOM dependency beyond a 2D context, and takes injectable frame
 * scheduling, so its lifecycle (single loop, clean stop, destroy) is testable.
 *
 * The visual state is driven by REAL application events (see JarvisProvider);
 * the engine never invents activity of its own — it only renders the state it
 * is given.
 */
export type JarvisVisualState = "idle" | "listening" | "processing" | "responding" | "action" | "success" | "error";

/** The subset of CanvasRenderingContext2D the engine uses (lets tests pass a recording fake). */
export interface Ctx2D {
  canvas?: unknown;
  globalAlpha: number;
  globalCompositeOperation: string;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, s: number, e: number): void;
  stroke(): void;
  fill(): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(offset: number, color: string): void };
}

export type EngineEnv = {
  raf: (cb: (t: number) => void) => number;
  caf: (id: number) => void;
};

export type EngineOptions = {
  particles: number;
  variant?: "hero" | "orb";
  env?: Partial<EngineEnv>;
  /** Deterministic random source (tests / stable layouts). */
  random?: () => number;
};

type Params = { spin: number; link: number; core: number; contract: number; jitter: number; spread: number };

const TARGETS: Record<JarvisVisualState, Params> = {
  idle: { spin: 1, link: 1, core: 0.55, contract: 0, jitter: 0.6, spread: 1 },
  listening: { spin: 2.2, link: 1.25, core: 0.8, contract: 0, jitter: 1.3, spread: 1.03 },
  processing: { spin: 3.2, link: 1.1, core: 1, contract: 0.16, jitter: 1.1, spread: 0.94 },
  responding: { spin: 1.6, link: 1.2, core: 0.9, contract: 0, jitter: 1, spread: 1.02 },
  action: { spin: 2.2, link: 1.3, core: 1, contract: 0.05, jitter: 1, spread: 1 },
  success: { spin: 1.4, link: 1.15, core: 1, contract: 0, jitter: 0.8, spread: 1.02 },
  error: { spin: 0.6, link: 0.8, core: 0.35, contract: 0, jitter: 0.4, spread: 0.98 },
};

const WHITE = "255,255,255";
const GOLD = "232,199,120";
const LIME = "114,242,56";
const AMBER = "245,166,35";

export class NetworkEngine {
  private ctx: Ctx2D;
  private n: number;
  private variant: "hero" | "orb";
  private raf: EngineEnv["raf"];
  private caf: EngineEnv["caf"];

  private theta: Float32Array;
  private phi: Float32Array;
  private radius: Float32Array;
  private phase: Float32Array;
  private gold: Uint8Array;
  private sx: Float32Array;
  private sy: Float32Array;
  private depth: Float32Array;
  private next: Int32Array;

  private width = 0;
  private height = 0;
  private cx = 0;
  private cy = 0;
  private R = 0;
  private rot = 0;
  private time = 0;
  private lastTs = 0;
  private state: JarvisVisualState = "idle";
  private stateSince = 0;
  private params: Params = { ...TARGETS.idle };
  private pulses: number[] = [];
  private lastPulse = 0;
  private frameId: number | null = null;
  private destroyed = false;

  constructor(ctx: Ctx2D, options: EngineOptions) {
    this.ctx = ctx;
    this.n = Math.max(12, Math.floor(options.particles));
    this.variant = options.variant ?? "hero";
    this.raf = options.env?.raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = options.env?.caf ?? ((id) => cancelAnimationFrame(id));
    const rnd = options.random ?? Math.random;

    const n = this.n;
    this.theta = new Float32Array(n);
    this.phi = new Float32Array(n);
    this.radius = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.gold = new Uint8Array(n);
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.depth = new Float32Array(n);
    this.next = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      this.theta[i] = rnd() * Math.PI * 2;
      this.phi[i] = Math.acos(2 * rnd() - 1);
      // Biased toward the centre so the core reads as concentrated and the
      // outskirts thin out into delicate, sparse connections.
      this.radius[i] = Math.pow(rnd(), 1.12);
      this.phase[i] = rnd() * Math.PI * 2;
      this.gold[i] = rnd() < 0.14 ? 1 : 0;
    }
  }

  get running(): boolean {
    return this.frameId !== null;
  }

  get currentState(): JarvisVisualState {
    return this.state;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.R = Math.min(this.width, this.height * (this.variant === "hero" ? 1.5 : 1)) * (this.variant === "hero" ? 0.5 : 0.44);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setState(state: JarvisVisualState): void {
    if (state === this.state) return;
    this.state = state;
    this.stateSince = this.time;
    if (state === "success") this.pulses.push(this.time);
  }

  /** Starts exactly one animation loop, no matter how many times it is called. */
  start(): void {
    if (this.destroyed || this.frameId !== null) return;
    this.lastTs = 0;
    this.frameId = this.raf(this.tick);
  }

  stop(): void {
    if (this.frameId !== null) {
      this.caf(this.frameId);
      this.frameId = null;
    }
  }

  destroy(): void {
    this.stop();
    this.destroyed = true;
  }

  private tick = (ts: number): void => {
    if (this.destroyed) return;
    const dt = this.lastTs ? Math.min(64, ts - this.lastTs) : 16;
    this.lastTs = ts;
    this.step(dt);
    this.draw();
    this.frameId = this.destroyed || this.frameId === null ? null : this.raf(this.tick);
  };

  /** Renders one frame without scheduling another (reduced-motion / state-change repaint). */
  renderStatic(): void {
    this.step(16);
    this.draw();
  }

  private step(dt: number): void {
    this.time += dt;
    const target = TARGETS[this.state];
    const k = 1 - Math.pow(0.001, dt / 1000); // ~1s easing
    const p = this.params;
    p.spin += (target.spin - p.spin) * k;
    p.link += (target.link - p.link) * k;
    p.core += (target.core - p.core) * k;
    p.contract += (target.contract - p.contract) * k;
    p.jitter += (target.jitter - p.jitter) * k;
    p.spread += (target.spread - p.spread) * k;
    this.rot += dt * 0.00007 * p.spin;

    if (this.state === "responding" && this.time - this.lastPulse > 850) {
      this.pulses.push(this.time);
      this.lastPulse = this.time;
    }
    this.pulses = this.pulses.filter((t) => this.time - t < 1500);
  }

  private draw(): void {
    const { ctx, n, cx, cy, R, time } = this;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.width, this.height);
    if (R <= 0) return;

    const tint = this.state === "error" ? AMBER : WHITE;
    const breathe = 1 + Math.sin(time * 0.0011) * (this.state === "listening" ? 0.045 : 0.018);
    const cosR = Math.cos(this.rot);
    const sinR = Math.sin(this.rot);
    const tilt = 0.42;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);

    // Project every point (rotating ellipsoid with perspective).
    for (let i = 0; i < n; i++) {
      const wobble = 1 + Math.sin(time * 0.0006 * (0.6 + this.phase[i] * 0.1) + this.phase[i]) * 0.045 * this.params.jitter;
      const r = this.radius[i] * wobble * this.params.spread * breathe * (1 - this.params.contract * (1 - this.radius[i]));
      const st = Math.sin(this.phi[i]);
      const x0 = r * st * Math.cos(this.theta[i]);
      const y0 = r * Math.cos(this.phi[i]) * 0.86;
      const z0 = r * st * Math.sin(this.theta[i]);
      const x1 = x0 * cosR - z0 * sinR;
      const z1 = x0 * sinR + z0 * cosR;
      const y2 = y0 * cosT - z1 * sinT;
      const z2 = y0 * sinT + z1 * cosT;
      const persp = 1 / (1 - z2 * 0.32);
      this.sx[i] = cx + x1 * R * persp * (this.variant === "hero" ? 1.25 : 1);
      this.sy[i] = cy + y2 * R * persp;
      this.depth[i] = (z2 + 1) / 2;
    }

    // Spatial grid for near-linear neighbour search.
    const reconf = 0.86 + 0.24 * Math.sin(time * 0.00028 + 1.3);
    const linkDist = R * 0.33 * reconf * this.params.link;
    const cell = Math.max(8, linkDist);
    const cols = Math.ceil(this.width / cell) + 1;
    const rows = Math.ceil(this.height / cell) + 1;
    const head = new Int32Array(cols * rows).fill(-1);
    for (let i = 0; i < n; i++) {
      const gx = Math.min(cols - 1, Math.max(0, Math.floor(this.sx[i] / cell)));
      const gy = Math.min(rows - 1, Math.max(0, Math.floor(this.sy[i] / cell)));
      const idx = gx + gy * cols;
      this.next[i] = head[idx];
      head[idx] = i;
    }

    const active = this.state === "action";
    ctx.lineWidth = this.variant === "orb" ? 0.6 : 0.7;
    for (let i = 0; i < n; i++) {
      // Points dissolve out of and back into the web over time, so the
      // structure reconfigures rather than merely rotating.
      if (Math.sin(time * 0.0004 + this.phase[i] * 3) < -0.35) continue;
      const gx = Math.floor(this.sx[i] / cell);
      const gy = Math.floor(this.sy[i] / cell);
      let made = 0;
      for (let oy = -1; oy <= 1 && made < 4; oy++) {
        for (let ox = -1; ox <= 1 && made < 4; ox++) {
          const cxg = gx + ox;
          const cyg = gy + oy;
          if (cxg < 0 || cyg < 0 || cxg >= cols || cyg >= rows) continue;
          for (let j = head[cxg + cyg * cols]; j !== -1 && made < 4; j = this.next[j]) {
            if (j <= i) continue;
            const dx = this.sx[i] - this.sx[j];
            const dy = this.sy[i] - this.sy[j];
            const d2 = dx * dx + dy * dy;
            if (d2 > linkDist * linkDist) continue;
            const d = Math.sqrt(d2);
            const alpha = (1 - d / linkDist) * (0.2 + 0.5 * ((this.depth[i] + this.depth[j]) / 2));
            const lit = active && i % 3 === 0;
            ctx.strokeStyle = `rgba(${lit ? LIME : this.gold[i] && this.gold[j] ? GOLD : tint},${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(this.sx[i], this.sy[i]);
            ctx.lineTo(this.sx[j], this.sy[j]);
            ctx.stroke();
            made++;
          }
        }
      }
    }

    // Processing: activity travels inward along spokes to the core.
    if (this.state === "processing") {
      const spokes = Math.min(22, Math.floor(n / 16));
      for (let s = 0; s < spokes; s++) {
        const i = (s * 37 + Math.floor(time / 2400) * 11) % n;
        const t = ((time * 0.0007 + s * 0.173) % 1 + 1) % 1;
        const x = this.sx[i] + (cx - this.sx[i]) * t;
        const y = this.sy[i] + (cy - this.sy[i]) * t;
        ctx.strokeStyle = `rgba(${LIME},0.2)`;
        ctx.beginPath();
        ctx.moveTo(this.sx[i], this.sy[i]);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.fillStyle = `rgba(${LIME},${(0.9 - t * 0.5).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, this.variant === "orb" ? 1.6 : 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Points.
    for (let i = 0; i < n; i++) {
      const d = this.depth[i];
      const lit = active && i % 3 === 0;
      const size = (this.variant === "orb" ? 0.7 : 1) + d * (this.variant === "orb" ? 0.9 : 1.7) + (this.gold[i] ? 0.4 : 0);
      const a = 0.4 + d * 0.6;
      ctx.fillStyle = `rgba(${lit ? LIME : this.gold[i] ? GOLD : tint},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(this.sx[i], this.sy[i], size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Response / success pulses expanding from the core.
    for (const t0 of this.pulses) {
      const age = (time - t0) / 1500;
      const rr = R * (0.12 + age * 0.95) * (this.variant === "hero" ? 1.25 : 1);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(${this.state === "success" ? LIME : GOLD},${((1 - age) * 0.4).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Concentrated luminous core.
    const coreR = R * (0.24 + this.params.core * 0.14) * (this.variant === "hero" ? 1.25 : 1);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    const coreTint = this.state === "error" ? AMBER : GOLD;
    g.addColorStop(0, `rgba(255,250,235,${(0.55 * this.params.core + 0.15).toFixed(3)})`);
    g.addColorStop(0.35, `rgba(${coreTint},${(0.22 * this.params.core).toFixed(3)})`);
    g.addColorStop(1, `rgba(${coreTint},0)`);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g as unknown as CanvasGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
}

/** Particle count for the device: fewer on phones and low-core devices. */
export function chooseParticleCount(input: { variant: "hero" | "orb"; width: number; cores?: number; memoryGb?: number; saveData?: boolean }): number {
  if (input.variant === "orb") return 90;
  const area = input.width < 640 ? 210 : input.width < 1100 ? 420 : 680;
  let n = area;
  if ((input.cores ?? 8) <= 4) n *= 0.7;
  if ((input.memoryGb ?? 8) <= 4) n *= 0.7;
  if (input.saveData) n *= 0.5;
  return Math.max(60, Math.round(n));
}
