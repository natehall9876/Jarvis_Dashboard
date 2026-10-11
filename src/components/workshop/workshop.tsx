"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Expand, Layers3, Minus, Plus, RotateCcw, Save, Sparkles } from "lucide-react";
import { useJarvis } from "@/components/jarvis/jarvis-provider";
import { ActivityPanel } from "@/components/jarvis/activity-panel";
import { GestureControls } from "./gesture-controls";
import type { CoreControls } from "./core-scene";
import { prepareLookingGlass } from "@/lib/jarvis/workshop-display";
import { loadWorkshopProperty } from "@/lib/jarvis/workshop-data";
import { DEFAULT_VIEW, buildWorkshopReview, workshopActivityNodes, priceDifference, readWorkshop, workOptions, workshopKey, type WorkshopDetail, type WorkshopSave } from "@/lib/jarvis/workshop-model";
import type { PropertyWithClient } from "@/types/domain";
import { clientDisplayName } from "@/lib/format";
import styles from "./workshop.module.css";
const CoreScene = dynamic(() => import("./core-scene").then(module => module.CoreScene), { ssr: false, loading: () => <div className={styles.sceneWrap}><p className={styles.coreStatus}>Preparing Workshop…</p></div> });
const money = (value: number | null) => value === null ? "Not recorded" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const panelNames = ["Property", "Comparison", "Assumptions"];

export function Workshop({ owner, properties, dataError, detailLoader = loadWorkshopProperty }: { detailLoader?: typeof loadWorkshopProperty; owner: string | null; properties: PropertyWithClient[]; dataError: string | null }) {
  const jarvis = useJarvis();
  const controlsRef = useRef<CoreControls | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const [detail, setDetail] = useState<WorkshopDetail | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [assumptions, setAssumptions] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lowPower, setLowPower] = useState(false);
  const [coreOnly, setCoreOnly] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [displayPanel, setDisplayPanel] = useState(false);
  const [activePanel, setActivePanel] = useState(0);
  const [displayBusy, setDisplayBusy] = useState(false);
  const [lookingGlassReady, setLookingGlassReady] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches || navigator.hardwareConcurrency <= 4) queueMicrotask(() => setLowPower(true));
  }, []);
  const options = detail ? workOptions(detail) : [];
  const chosen = selected.map(id => options.find(option => option.id === id)).filter(option => option !== undefined);
  const difference = priceDifference(chosen[0], chosen[1]);
  const review = buildWorkshopReview(detail?.property.id ?? "", chosen.map(option => option.id), assumptions);
  const activityNodes = workshopActivityNodes(jarvis.loading, jarvis.progress, jarvis.activeCapabilities, jarvis.exchanges[0]?.toolsUsed ?? []);
  const openProperty = useCallback(async (id: string, saved?: WorkshopSave) => {
    const sequence = ++request.current;
    setPropertyId(id); setDetail(null); setSelected([]); setAssumptions(""); setError(null); setMessage("");
    if (!id) { setBusy(false); return; }
    setBusy(true);
    try {
      const result = await detailLoader(id);
      if (sequence !== request.current) return;
      if (result.error || !result.data) { setError(result.error || "This property could not be loaded."); return; }
      setDetail(result.data);
      const available = workOptions(result.data);
      if (saved) { setSelected(saved.options.filter(id => available.some(option => option.id === id))); setAssumptions(saved.assumptions); controlsRef.current?.restore(saved.view); setMessage(`Restored work saved ${new Date(saved.savedAt).toLocaleString()}. Source records refreshed.`); }
      else { setSelected(available.slice(0, 2).map(option => option.id)); setMessage("Property opened from your current records."); }
    } catch { if (sequence === request.current) setError("The property could not be loaded. Please retry."); }
    finally { if (sequence === request.current) setBusy(false); }
  }, [detailLoader]);
  function save() {
    if (!owner || !detail) return;
    try {
      const saved: WorkshopSave = { version: 1, owner, propertyId: detail.property.id, options: selected, assumptions, view: controlsRef.current?.view() ?? DEFAULT_VIEW, savedAt: new Date().toISOString() };
      const raw = JSON.stringify(saved); if (!readWorkshop(raw, owner)) throw new Error("Invalid workspace");
      localStorage.setItem(workshopKey(owner), raw); setMessage("Work saved on this device for your account.");
    } catch { setError("This browser could not save your work. Keep this page open or copy your assumptions."); }
  }
  function restore() {
    if (!owner) return;
    try { const saved = readWorkshop(localStorage.getItem(workshopKey(owner)), owner); if (!saved) { setMessage("No saved Workshop was found for your account on this device."); return; } void openProperty(saved.propertyId, saved); }
    catch { setError("This browser is blocking saved Workshop access."); }
  }
  function selectOption(id: string) { setSelected(value => value.includes(id) ? value.filter(item => item !== id) : [...value.slice(-1), id]); }
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (surface.current?.requestFullscreen) await surface.current.requestFullscreen(); else setMessage("Fullscreen is unavailable in this browser. Core-only view is still available."); } catch { setError("This browser could not enter fullscreen. Try core-only view instead."); } }
  async function configureLookingGlass() { setDisplayBusy(true); try { await prepareLookingGlass(); setLookingGlassReady(true); setMessage("Looking Glass adapter ready. Connect your display, start Bridge, allow popups, then select Enter Looking Glass."); } catch (error) { setError(error instanceof Error ? error.message : "Looking Glass setup failed."); } finally { setDisplayBusy(false); } }
  async function externalDisplay(kind: "headset" | "looking-glass") { setDisplayBusy(true); setError(null); try { if (!controlsRef.current) throw new Error("3D rendering must be available first."); await controlsRef.current.display(kind); setMessage(kind === "looking-glass" ? "Looking Glass session requested. Use the vendor display window; verify the picture on your hardware." : "Headset session started. Use your headset's exit control to return."); } catch (error) { setError(error instanceof Error ? error.message : "The display could not connect."); } finally { setDisplayBusy(false); } }
  const chooseTool = useCallback((tool: string) => { setMessage(`${tool.startsWith("capability:") ? "Active capability" : "Recorded tool"}: ${tool.replace(/^(capability|tool):/, "").replaceAll("_", " ")}`); setActivePanel(tool.includes("quote") || tool.includes("job") ? 1 : 0); }, []);
  const selectNextPanel = useCallback(() => { setActivePanel(value => (value + 1) % panelNames.length); }, []);
  return <div className={styles.workshop}>
    <header className={styles.header}><div><Link className={styles.back} href="/"><ArrowLeft size={13} /> Command center</Link><div className={styles.titleRow}><Layers3 size={23} /><h1>Workshop</h1><span className={styles.previewBadge}>A place to think</span></div><p>Bring one property into focus. Compare the work. Keep your place.</p></div><div className={styles.headerActions}><button onClick={restore} disabled={!owner}>Restore work</button><button className={styles.primary} onClick={save} disabled={!detail || !owner || busy}><Save size={14} /> Save work</button></div></header>
    <div className={styles.notices} aria-live="polite">{(dataError || error) && <p role="alert" className={styles.error}>{dataError || error}</p>}{message && <p>{message}</p>}</div>
    <div ref={surface} className={`${styles.surface} ${coreOnly ? styles.coreOnly : ""}`}>
      <div className={styles.surfaceToolbar}><span className={styles.eyebrow}>JARVIS / SPATIAL WORKSPACE</span><div className={styles.toolbarButtons}><button aria-pressed={lowPower} onClick={() => setLowPower(!lowPower)}>{lowPower ? "Low power on" : "Low power"}</button><button aria-pressed={coreOnly} onClick={() => setCoreOnly(!coreOnly)}>{coreOnly ? "Show workspace" : "Core only"}</button><button aria-label="Toggle fullscreen" onClick={() => void fullscreen()}><Expand size={15} /></button></div></div>
      <div className={styles.workspaceGrid}>
        <aside className={`${styles.panel} ${styles.propertyPanel} ${activePanel === 0 ? styles.selectedPanel : ""}`} aria-label="Property context">
          <span className={styles.eyebrow}>01 / PROPERTY</span><h2>Open your work</h2><label className={styles.fieldLabel} htmlFor="workshop-property">Property</label><select id="workshop-property" value={propertyId} onChange={event => void openProperty(event.target.value)}><option value="">Choose a property</option>{properties.map(property => <option key={property.id} value={property.id}>{property.property_name || property.street || "Unnamed property"} · {clientDisplayName(property.client)}</option>)}</select>
          {busy ? <p role="status" className={styles.empty}>Opening current records…</p> : detail ? <><div className={styles.propertyIdentity}><span className={styles.locationMark}>⌖</span><h3>{detail.property.property_name || detail.property.street || "Property"}</h3><p>{[detail.property.street, detail.property.city, detail.property.state, detail.property.zip].filter(Boolean).join(", ") || "Address not recorded"}</p><p>{clientDisplayName(detail.property.client)}</p></div><dl className={styles.facts}><div><dt>Estimates</dt><dd>{detail.quotes.length}</dd></div><div><dt>Recent jobs</dt><dd>{detail.jobs.length}{detail.jobs.length === 50 ? "+" : ""}</dd></div><div><dt>Location</dt><dd>{detail.property.latitude !== null && detail.property.longitude !== null ? "Recorded" : "Not recorded"}</dd></div></dl><p className={styles.muted}>{detail.property.service_notes || "No service notes recorded."}</p><Link className={styles.sourceLink} href={`/properties/${detail.property.id}`}>Open source property <ArrowRight size={13} /></Link></> : <div className={styles.empty}><Layers3 size={28} /><p>Select an existing property to bring its estimates and recent jobs into view.</p><p className={styles.muted}>No generated property model or inferred measurements.</p></div>}
        </aside>
        <section className={styles.center} aria-label="Jarvis live core"><div className={styles.centerHeading}><span className={styles.eyebrow}>CONNECTED TO YOUR JARVIS SESSION</span><h2>{detail ? detail.property.property_name || detail.property.street || "Property in focus" : "Room for the next idea."}</h2></div><CoreScene controlsRef={controlsRef} lowPower={lowPower} mirrored={mirror} onSelect={chooseTool} audioLevel={jarvis.audioLevel} /><div className={styles.coreControls}><button onClick={() => controlsRef.current?.rotate(-.2, 0)} aria-label="Rotate core left"><ArrowLeft size={14} /></button><button onClick={() => controlsRef.current?.rotate(.2, 0)} aria-label="Rotate core right"><ArrowRight size={14} /></button><button onClick={() => controlsRef.current?.zoom(.5)} aria-label="Zoom out"><Minus size={14} /></button><button onClick={() => controlsRef.current?.zoom(-.5)} aria-label="Zoom in"><Plus size={14} /></button><button onClick={() => controlsRef.current?.reset()} aria-label="Reset core view"><RotateCcw size={14} /></button></div><p className={styles.coreCaption}>Drag to orbit · Pinch or scroll to zoom</p><p className={styles.honesty}>Live session state and recorded tool calls, shown as a branching 3D structure.</p>{jarvis.loading && jarvis.progress && <p className={styles.coreCaption} role="status">{jarvis.progress}</p>}<div className={styles.toolList}>{activityNodes.slice(-4).map(node => <button key={node.id} onClick={() => chooseTool(node.id)}>{node.label}</button>)}</div></section>
        <aside className={`${styles.panel} ${styles.assumptionsPanel} ${activePanel === 2 ? styles.selectedPanel : ""}`} aria-label="Comparison assumptions"><span className={styles.eyebrow}>03 / CONTEXT</span><h2>Make the unknowns visible.</h2><p className={styles.muted}>Compare recorded scopes, dates and prices. These records may cover different work; a lower price alone does not make a better option.</p><label className={styles.fieldLabel} htmlFor="workshop-assumptions">Your assumptions & next steps</label><textarea id="workshop-assumptions" rows={6} maxLength={6000} value={assumptions} onChange={event => setAssumptions(event.target.value)} placeholder="What needs a site visit? Which scope is comparable?" /><p className={styles.muted}>Saved with this workspace on this device. Does not change a quote or job.</p><button className={styles.askButton} disabled={!detail || jarvis.loading} onClick={() => { if (detail) { void jarvis.submit(review.prompt); jarvis.setPanelOpen(true); } }}><Sparkles size={14} /> Ask Jarvis to review</button>{review.truncated && <p className={styles.muted}>This review includes only the beginning of your assumptions to fit Jarvis’s request limit. Your full notes stay in the workspace; use Save work to keep them.</p>}<div className={styles.voiceStatus}>{jarvis.speechStatus}</div></aside>
        <section className={`${styles.panel} ${styles.comparisonPanel} ${activePanel === 1 ? styles.selectedPanel : ""}`} aria-label="Work option comparison"><div className={styles.inline}><div><span className={styles.eyebrow}>02 / COMPARE WORK</span><h2>See the difference.</h2></div><span className={styles.smallBadge}>Two recorded options</span></div>{!detail ? <p className={styles.empty}>Open a property to compare recorded estimates or jobs.</p> : options.length === 0 ? <p className={styles.empty}>No estimates or recent jobs are recorded for this property. Open the source property to review its details.</p> : <><div className={styles.optionPicker}>{options.map(option => <button key={option.id} aria-pressed={selected.includes(option.id)} onClick={() => selectOption(option.id)}><span>{option.label}</span><small>{option.date.slice(0, 10)} · {money(option.price)}</small></button>)}</div><div className={styles.comparisonCards}>{chosen.map((option, index) => <article key={option.id} className={styles.optionCard}><span className={styles.eyebrow}>OPTION {index === 0 ? "A" : "B"} · {option.kind.toUpperCase()}</span><h3>{option.label}</h3><strong className={styles.price}>{money(option.price)}</strong><p className={styles.muted}>{option.status} · {option.date.slice(0, 10)}</p><p className={styles.muted}>Budgeted hours: {option.hours ?? "not recorded"}</p><ul>{option.scope.length ? option.scope.map((scope, i) => <li key={i}>{scope}</li>) : <li>Line item scope not recorded</li>}</ul><Link className={styles.sourceLink} href={option.href}>View source <ArrowRight size={13} /></Link></article>)}</div>{chosen.length === 2 && <p className={styles.difference}>{difference === null ? "A price is missing, so the difference cannot be calculated." : `Recorded price difference (B − A): ${money(difference)}`}<span>Estimate totals include recorded tax; job prices may use a different basis. Optional line items may not be included in estimate totals. Verify like-for-like scope.</span></p>}<p className={styles.muted}>Current records read {new Date(detail.checkedAt).toLocaleString()}. Up to 50 recent jobs.</p></>}</section>
      </div>
      <footer className={styles.surfaceFooter}><span>{coreOnly ? "Core display" : `Focus: ${panelNames[activePanel]}`}</span><button onClick={() => setDisplayPanel(!displayPanel)} aria-expanded={displayPanel}>Display & gesture controls</button></footer>
      {displayPanel && <div className={styles.displaySettings}><div><h3>Put Jarvis in the room.</h3><p className={styles.muted}>For a monitor or TV, move this browser window to that display and use fullscreen.</p><div className={styles.displayButtons}><button aria-pressed={mirror} onClick={() => { setMirror(!mirror); setCoreOnly(true); }}>Pepper’s Ghost mirror {mirror ? "on" : "off"}</button><button disabled={displayBusy} onClick={() => void (lookingGlassReady ? externalDisplay("looking-glass") : configureLookingGlass())}>{lookingGlassReady ? "Enter Looking Glass" : "Set up Looking Glass"}</button><button disabled={displayBusy} onClick={() => void externalDisplay("headset")}>Enter headset XR</button><button onClick={() => void controlsRef.current?.endDisplay()}>Exit XR</button></div><p className={styles.muted}>Reflection mode needs an angled transparent surface and dark surroundings. Looking Glass uses the vendor WebXR adapter and requires compatible hardware, Bridge, Desktop Mode, and a supported browser. Allow its display popup. Headset XR requires a compatible immersive browser. Physical output has not been verified here.</p></div><GestureControls controlsRef={controlsRef} onSelect={selectNextPanel} /></div>}
    </div>
    <ActivityPanel />
  </div>;
}
