"use client";

import { useEffect, useRef, useState } from "react";
import { NetworkEngine, chooseParticleCount, type Ctx2D } from "@/lib/jarvis/network-engine";
import { useJarvis } from "@/components/jarvis/jarvis-provider";

/**
 * The living Jarvis network. It renders the REAL session state from
 * JarvisProvider (idle / listening / processing / responding / action /
 * success / error) and invents none of its own.
 *
 * Resource discipline: exactly one animation loop; it pauses while the canvas
 * is off-screen or the tab is hidden; with prefers-reduced-motion it paints
 * still frames only on state changes; particle density adapts to the device;
 * every observer and listener is removed and the engine destroyed on unmount.
 * If canvas is unavailable it falls back to a static gradient — the rest of the
 * interface never depends on this component working.
 */
export function IntelligenceNetwork({ variant = "hero", className = "" }: { variant?: "hero" | "orb"; className?: string }) {
  const { visualState } = useJarvis();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<NetworkEngine | null>(null);
  const stateRef = useRef(visualState);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    stateRef.current = visualState;
    const engine = engineRef.current;
    if (!engine) return;
    engine.setState(visualState);
    if (!engine.running) engine.renderStatic();
  }, [visualState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setFallback(true);
      return;
    }
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const engine = new NetworkEngine(ctx as unknown as Ctx2D, {
      variant,
      particles: chooseParticleCount({
        variant,
        width: window.innerWidth,
        cores: navigator.hardwareConcurrency,
        memoryGb: nav.deviceMemory,
        saveData: nav.connection?.saveData,
      }),
    });
    engineRef.current = engine;
    engine.setState(stateRef.current);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = true;
    let tabVisible = !document.hidden;

    const sync = () => {
      if (onScreen && tabVisible && !reduced.matches) engine.start();
      else {
        engine.stop();
        engine.renderStatic();
      }
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      engine.resize(rect.width, rect.height, dpr);
      if (!engine.running) engine.renderStatic();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      sync();
    });
    io.observe(canvas);
    const onVisibility = () => {
      tabVisible = !document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", sync);

    resize();
    sync();

    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", sync);
      engine.destroy();
      engineRef.current = null;
    };
  }, [variant]);

  if (fallback) {
    return <div aria-hidden className={`${className} bg-[radial-gradient(circle_at_center,rgba(232,199,120,0.25),transparent_60%)]`} />;
  }
  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
