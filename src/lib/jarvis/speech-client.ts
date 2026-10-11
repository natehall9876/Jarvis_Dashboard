/** Streams documented 24 kHz, signed little-endian PCM directly into Web Audio.
 * Nothing is buffered as a full file. Stop aborts fetch and every scheduled node. */
export type SpeechEngine = "checking" | "neural" | "browser" | "unavailable";
export class SpeechPlaybackError extends Error {
  constructor(public reason: "not_configured" | "unauthorized" | "unavailable" | "audio_locked") { super(reason); }
}

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
export function neuralPlaybackSupported(): boolean {
  return Boolean(window.AudioContext ?? (window as AudioWindow).webkitAudioContext);
}

/** Carries an odd byte between network chunks; network boundaries are not sample boundaries. */
export function decodePcm(chunk: Uint8Array, carry: number | null): { samples: Float32Array<ArrayBuffer>; carry: number | null } {
  const bytes = new Uint8Array(chunk.length + (carry === null ? 0 : 1));
  if (carry !== null) bytes[0] = carry;
  bytes.set(chunk, carry === null ? 0 : 1);
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return { samples, carry: bytes.length % 2 ? bytes[bytes.length - 1] : null };
}

export class NeuralSpeechPlayer {
  private context: AudioContext | null = null;
  /** Call synchronously from a user gesture, before asynchronous provider work. */
  unlock(): void {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Context) return;
    try {
      if (!this.context || this.context.state === "closed") this.context = new Context();
      void this.context.resume().catch(() => {});
      const source = this.context.createBufferSource();
      source.buffer = this.context.createBuffer(1, 1, 24000);
      source.connect(this.context.destination); source.onended = () => source.disconnect(); source.start();
    } catch { /* Playback reports a recoverable error if unlock was refused. */ }
  }
  close(): void { void this.context?.close().catch(() => {}); this.context = null; }

  async play(text: string, signal: AbortSignal, onStart: () => void, onLevel: (level: number) => void): Promise<void> {
    signal.throwIfAborted();
    const context = this.context;
    if (!context || context.state !== "running") throw new SpeechPlaybackError("audio_locked");
    const abort = new AbortController();
    const page = typeof document === "undefined" ? null : document;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let analyser: AnalyserNode | null = null;
    let failure: SpeechPlaybackError | null = null;
    const nodes = new Set<AudioBufferSourceNode>();
    let carry: number | null = null, nextAt = context.currentTime + 0.06, started = false, frame = 0;
    let resolveEnded: (() => void) | null = null;
    const ended = () => { if (!nodes.size) resolveEnded?.(); };
    const stop = () => {
      for (const node of nodes) { node.onended = null; try { node.stop(); } catch {} node.disconnect(); }
      nodes.clear(); ended(); void reader?.cancel().catch(() => {});
    };
    const interrupted = (reason: "audio_locked" | "unavailable") => {
      failure ??= new SpeechPlaybackError(reason); abort.abort(); stop();
    };
    const stateChanged = () => { if (context.state !== "running") interrupted("audio_locked"); };
    const visibilityChanged = () => { if (page?.hidden) interrupted("audio_locked"); };
    const cancelled = () => { abort.abort(signal.reason); stop(); };
    const check = () => { if (failure) throw failure; abort.signal.throwIfAborted(); };
    signal.addEventListener("abort", cancelled, { once: true });
    context.addEventListener("statechange", stateChanged);
    page?.addEventListener("visibilitychange", visibilityChanged);
    // Bounds both network stalls and missing onended events. Segments are at most
    // 1600 chars; a generous three-minute ceiling permits natural spoken pacing.
    const deadline = window.setTimeout(() => interrupted("unavailable"), Math.min(180_000, Math.max(30_000, text.length * 150)));
    abort.signal.addEventListener("abort", stop, { once: true });
    try {
      signal.throwIfAborted(); stateChanged(); visibilityChanged(); check();
      const response = await fetch("/api/jarvis/speech", { method: "POST", signal: abort.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      check();
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null); check();
        throw new SpeechPlaybackError(response.status === 401 || response.status === 403 ? "unauthorized" : data?.reason === "not_configured" ? "not_configured" : "unavailable");
      }
      reader = response.body.getReader();
      analyser = context.createAnalyser(); analyser.fftSize = 256; analyser.connect(context.destination);
      const levels = new Float32Array(analyser.fftSize);
      const measure = () => {
        analyser!.getFloatTimeDomainData(levels);
        onLevel(Math.min(1, Math.sqrt(levels.reduce((sum, n) => sum + n * n, 0) / levels.length) * 3));
        frame = window.requestAnimationFrame(measure);
      };
      while (true) {
        const { done, value } = await reader.read(); check();
        if (done) break;
        const decoded = decodePcm(value, carry); carry = decoded.carry;
        if (!decoded.samples.length) continue;
        const buffer = context.createBuffer(1, decoded.samples.length, 24000); buffer.copyToChannel(decoded.samples, 0);
        const node = context.createBufferSource(); node.buffer = buffer; node.connect(analyser); nodes.add(node);
        node.onended = () => { node.disconnect(); nodes.delete(node); ended(); };
        nextAt = Math.max(nextAt, context.currentTime + 0.02); node.start(nextAt); nextAt += buffer.duration;
        if (!started) { started = true; onStart(); measure(); }
      }
      if (!started || carry !== null) throw new SpeechPlaybackError("unavailable");
      if (nodes.size) await new Promise<void>(resolve => { resolveEnded = resolve; ended(); });
      check();
    } catch (error) {
      if (failure) throw failure;
      signal.throwIfAborted(); throw error;
    } finally {
      window.clearTimeout(deadline);
      signal.removeEventListener("abort", cancelled); abort.signal.removeEventListener("abort", stop);
      context.removeEventListener("statechange", stateChanged); page?.removeEventListener("visibilitychange", visibilityChanged);
      abort.abort(); stop();
      window.cancelAnimationFrame(frame); analyser?.disconnect(); reader?.releaseLock(); onLevel(0);
    }
  }
}
