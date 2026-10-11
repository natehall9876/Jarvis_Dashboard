"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useJarvis } from "@/components/jarvis/jarvis-provider";
import { DEFAULT_VIEW, type WorkshopView } from "@/lib/jarvis/workshop-model";
import { enterWorkshopXR, prepareLookingGlass } from "@/lib/jarvis/workshop-display";
import styles from "./workshop.module.css";

export type CoreControls = { reset(): void; zoom(delta: number): void; rotate(dx: number, dy: number): void; view(): WorkshopView; restore(view: WorkshopView): void; display(kind: "headset" | "looking-glass"): Promise<void>; endDisplay(): Promise<void> };
const COLORS = { idle: 0xe6a34c, listening: 0x8ee6ee, processing: 0xffb65a, responding: 0xf3cc80, action: 0xffb65a, success: 0x90d4a2, error: 0xf47f79 };
const LABELS = { idle: "Standing by", listening: "Listening", processing: "Working", responding: "Responding", action: "Action in progress", success: "Completed", error: "Needs attention" };

export function CoreScene({ controlsRef, lowPower, mirrored, onSelect, audioLevel = 0 }: { controlsRef: React.MutableRefObject<CoreControls | null>; lowPower: boolean; mirrored: boolean; onSelect: (tool: string) => void; audioLevel?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const jarvis = useJarvis();
  const live = useRef({ state: jarvis.visualState, tools: [] as string[], level: audioLevel, lowPower, onSelect });
  const [failure, setFailure] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const toolNames = useMemo(() => jarvis.exchanges[0]?.toolsUsed ?? [], [jarvis.exchanges]);
  useEffect(() => { live.current = { state: jarvis.visualState, tools: [...new Set(toolNames)].slice(-8), level: audioLevel, lowPower, onSelect }; }, [jarvis.visualState, toolNames, audioLevel, lowPower, onSelect]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
    catch { queueMicrotask(() => setFailure("3D rendering is unavailable. Your property work and Jarvis controlsRef still work.")); return; }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    const root = new THREE.Group();
    scene.add(root);
    let view = { ...DEFAULT_VIEW };
    let dirty = true;
    let lost = false;
    let lastFrame = 0;
    let oldState = "";
    let oldTools = "";
    let previousPower = live.current.lowPower;
    let session: XRSession | null = null;
    let mounted = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const lineMaterial = new THREE.LineBasicMaterial({ color: COLORS.idle, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending });
    const dotMaterial = new THREE.PointsMaterial({ color: 0xffdca1, size: 0.018, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    materials.push(lineMaterial, dotMaterial);
    const vertices: number[] = [];
    const tips: number[] = [];
    let seed = 31847;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    function branch(start: THREE.Vector3, direction: THREE.Vector3, length: number, depth: number) {
      const end = start.clone().addScaledVector(direction, length);
      vertices.push(...start.toArray(), ...end.toArray()); tips.push(...end.toArray());
      if (!depth) return;
      for (let i = 0; i < 3; i++) {
        const next = direction.clone().add(new THREE.Vector3(random() - .5, random() - .5, random() - .5).multiplyScalar(.88)).normalize();
        branch(end, next, length * (.55 + random() * .2), depth - 1);
      }
    }
    for (let i = 0; i < 22; i++) {
      const y = 1 - (i / 21) * 2; const radius = Math.sqrt(1 - y * y); const angle = i * 2.39996;
      branch(new THREE.Vector3(), new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius), .45 + random() * .3, 4);
    }
    const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const dots = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(tips, 3));
    geometries.push(geometry, dots); root.add(new THREE.LineSegments(geometry, lineMaterial), new THREE.Points(dots, dotMaterial));
    const coreGeometry = new THREE.IcosahedronGeometry(.11, 2);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffdda4, wireframe: true });
    geometries.push(coreGeometry); materials.push(coreMaterial); root.add(new THREE.Mesh(coreGeometry, coreMaterial));
    const toolGroup = new THREE.Group(); root.add(toolGroup);
    const toolGeometry = new THREE.OctahedronGeometry(.065); geometries.push(toolGeometry);
    const toolMaterial = new THREE.MeshBasicMaterial({ color: 0x91e3ef }); materials.push(toolMaterial);
    const toolLines: THREE.BufferGeometry[] = [];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function updateCamera() {
      view.pitch = THREE.MathUtils.clamp(view.pitch, -1.3, 1.3); view.distance = THREE.MathUtils.clamp(view.distance, 2.6, 9);
      camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * view.distance, Math.sin(view.pitch) * view.distance, Math.cos(view.yaw) * Math.cos(view.pitch) * view.distance); camera.lookAt(0, 0, 0); dirty = true;
    }
    const endDisplay = async () => { if (session) await session.end(); };
    controlsRef.current = {
      reset() { view = { ...DEFAULT_VIEW }; updateCamera(); },
      zoom(delta) { view.distance += delta; updateCamera(); },
      rotate(dx, dy) { view.yaw = (view.yaw + dx) % (Math.PI * 2); view.pitch += dy; updateCamera(); },
      view: () => ({ ...view }), restore(value) { view = { ...value }; updateCamera(); },
      async display(kind) {
        if (session) throw new Error("Exit the current display session first.");
        if (kind === "looking-glass") await prepareLookingGlass();
        const next = await enterWorkshopXR(renderer, kind);
        if (!mounted) { await next.end(); return; }
        session = next;
        if (kind === "headset") { root.position.set(0, 0, -2.8); root.scale.setScalar(.65); camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); }
        next.addEventListener("end", () => { session = null; root.position.set(0, 0, 0); root.scale.setScalar(1); renderer.xr.enabled = false; updateCamera(); });
      }, endDisplay,
    };
    updateCamera();
    renderer.setClearColor(0x000000, 0); renderer.domElement.setAttribute("aria-hidden", "true"); element.appendChild(renderer.domElement);
    function resize() { const rect = element!.getBoundingClientRect(); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, live.current.lowPower ? 1 : 1.8)); renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); dirty = true; }
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const pointers = new Map<number, { x: number; y: number }>();
    let down = { x: 0, y: 0 }; let moved = false;
    const pointerDown = (event: PointerEvent) => { element.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); down = { x: event.clientX, y: event.clientY }; moved = false; };
    const pointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId); if (!previous) return;
      const next = { x: event.clientX, y: event.clientY };
      if (Math.hypot(next.x - down.x, next.y - down.y) > 5) moved = true;
      if (pointers.size === 2) { const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)![1]; controlsRef.current?.zoom((Math.hypot(previous.x - other.x, previous.y - other.y) - Math.hypot(next.x - other.x, next.y - other.y)) * .012); }
      else controlsRef.current?.rotate(-(next.x - previous.x) * .006, (next.y - previous.y) * .006);
      pointers.set(event.pointerId, next);
    };
    const pointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (event.type === "pointercancel" || moved) return;
      const rect = element.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(toolGroup.children).find(hit => hit.object.userData.tool); if (hit) live.current.onSelect(hit.object.userData.tool);
    };
    const wheel = (event: WheelEvent) => { event.preventDefault(); controlsRef.current?.zoom(event.deltaY * .003); };
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; setFailure("The graphics connection was interrupted. Restore 3D to continue."); };
    const visibility = () => { dirty = true; };
    element.addEventListener("pointerdown", pointerDown); element.addEventListener("pointermove", pointerMove); element.addEventListener("pointerup", pointerUp); element.addEventListener("pointercancel", pointerUp); element.addEventListener("wheel", wheel, { passive: false }); renderer.domElement.addEventListener("webglcontextlost", contextLost); document.addEventListener("visibilitychange", visibility);
    renderer.setAnimationLoop((time) => {
      if (lost || document.hidden) return;
      const state = live.current;
      if (previousPower !== state.lowPower) { previousPower = state.lowPower; resize(); }
      const toolKey = state.tools.join("|");
      if (toolKey !== oldTools) {
        toolGroup.clear(); toolLines.splice(0).forEach(g => g.dispose());
        state.tools.forEach((tool, i) => { const angle = i / Math.max(state.tools.length, 1) * Math.PI * 2; const position = new THREE.Vector3(Math.cos(angle) * 1.7, Math.sin(angle) * 1.4, Math.sin(angle * 2) * .5); const node = new THREE.Mesh(toolGeometry, toolMaterial); node.position.copy(position); node.userData.tool = tool; toolGroup.add(node); const line = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), position]); toolLines.push(line); toolGroup.add(new THREE.Line(line, lineMaterial)); }); oldTools = toolKey; dirty = true;
      }
      if (oldState !== state.state) { lineMaterial.color.setHex(COLORS[state.state]); dotMaterial.color.setHex(COLORS[state.state]); oldState = state.state; dirty = true; }
      const busy = state.state !== "idle" && state.state !== "error" && state.state !== "success";
      if (!session && time - lastFrame < (state.lowPower ? 100 : 33)) return;
      if (!session && !dirty && (!busy || reduced.matches || state.lowPower)) return;
      if (!reduced.matches && !state.lowPower) lineMaterial.opacity = busy ? .52 + Math.sin(time * .002) * .12 + Math.min(.16, state.level * .16) : .42;
      else lineMaterial.opacity = .5;
      renderer.render(scene, camera); lastFrame = time; dirty = false;
    });
    return () => { mounted = false; void endDisplay(); controlsRef.current = null; renderer.setAnimationLoop(null); observer.disconnect(); element.removeEventListener("pointerdown", pointerDown); element.removeEventListener("pointermove", pointerMove); element.removeEventListener("pointerup", pointerUp); element.removeEventListener("pointercancel", pointerUp); element.removeEventListener("wheel", wheel); renderer.domElement.removeEventListener("webglcontextlost", contextLost); document.removeEventListener("visibilitychange", visibility); geometries.concat(toolLines).forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, [controlsRef, generation]);
  return <div className={styles.sceneWrap}>
    <div ref={host} className={styles.scene} style={mirrored ? { transform: "scaleX(-1)" } : undefined} role="img" aria-label={`Interactive 3D Jarvis core. ${LABELS[jarvis.visualState]}. Drag to rotate, pinch or scroll to zoom.`} />
    <div className={styles.coreStatus}><span className={styles.statusDot} style={{ background: `#${COLORS[jarvis.visualState].toString(16)}` }} /><span>{LABELS[jarvis.visualState]}</span></div>
    {failure && <div className={styles.sceneError} role="status"><p>{failure}</p><button onClick={() => { setFailure(null); setGeneration(value => value + 1); }}>Restore 3D</button></div>}
  </div>;
}
