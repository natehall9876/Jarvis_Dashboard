import type { WebGLRenderer } from "three";
let lookingGlassInitialized = false;
/** Vendor adapter only loads after an explicit click; it opens the vendor display UI. */
export async function prepareLookingGlass(): Promise<void> {
  if (lookingGlassInitialized) return;
  if (!window.isSecureContext) throw new Error("Looking Glass needs HTTPS or localhost.");
  // Package 0.6.0 ships declarations but doesn't expose them in its exports map.
  // @ts-expect-error upstream package exports omit its declaration entry
  const { LookingGlassWebXRPolyfill } = await import("@lookingglass/webxr");
  new LookingGlassWebXRPolyfill({ targetX: 0, targetY: 0, targetZ: 0, targetDiam: 3.8, fovy: 14 * Math.PI / 180 });
  lookingGlassInitialized = true;
}
export async function enterWorkshopXR(renderer: WebGLRenderer, kind: "headset" | "looking-glass"): Promise<XRSession> {
  if (!navigator.xr) throw new Error("WebXR is unavailable in this browser. Use a supported headset browser or configure Looking Glass Bridge.");
  if (kind === "headset" && lookingGlassInitialized) throw new Error("Reload Workshop before switching from the Looking Glass adapter to a headset.");
  if (!await navigator.xr.isSessionSupported("immersive-vr")) throw new Error("No compatible immersive display is available.");
  const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  try { await renderer.xr.setSession(session); }
  catch (error) { await session.end(); throw error; }
  return session;
}
