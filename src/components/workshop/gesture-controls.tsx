"use client";
import { useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import type { CoreControls } from "./core-scene";
import { handPose } from "@/lib/jarvis/workshop-model";
import styles from "./workshop.module.css";

export function GestureControls({ controlsRef, onSelect }: { controlsRef: React.MutableRefObject<CoreControls | null>; onSelect: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("Camera off. Gestures only change this view.");
  const video = useRef<HTMLVideoElement>(null);
  const select = useRef(onSelect);
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false; let stream: MediaStream | null = null; let detector: HandLandmarker | null = null; let frame = 0; let previousTime = -1; let lastRun = 0; let pinchAt = 0; let lastSelect = 0;
    let previous: ReturnType<typeof handPose> = null;
    const stop = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; cancelAnimationFrame(frame); detector?.close(); detector = null; if (video.current) video.current.srcObject = null; };
    const hidden = () => { if (document.hidden) { stop(); setEnabled(false); setMessage("Camera stopped while Workshop was hidden."); } };
    document.addEventListener("visibilitychange", hidden);
    void (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera gestures need a secure browser with camera support.");
        setMessage("Preparing on-device hand tracking…");
        const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        if (cancelled) return;
        const next = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate: "CPU" }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: .65, minTrackingConfidence: .65 });
        if (cancelled) { next.close(); return; } detector = next;
        const media = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360, facingMode: "user" }, audio: false });
        if (cancelled || document.hidden) { media.getTracks().forEach(track => track.stop()); return; } stream = media;
        if (!video.current) { stop(); return; }
        video.current.srcObject = stream; await video.current.play();
        if (cancelled) { stop(); return; }
        setMessage("Ready. Pinch and move to rotate; two pinches to zoom; hold a still pinch to select the next panel.");
        let previousSpan: number | null = null;
        const tick = (now: number) => {
          if (cancelled || !detector || !video.current) return;
          frame = requestAnimationFrame(tick);
          if (now - lastRun < 90 || video.current.readyState < 2 || video.current.currentTime === previousTime) return;
          lastRun = now; previousTime = video.current.currentTime;
          try {
            const result = detector.detectForVideo(video.current, now);
            const pose = result.landmarks[0] ? handPose(result.landmarks[0]) : null;
            const other = result.landmarks[1] ? handPose(result.landmarks[1]) : null;
            if (pose?.pinched && other?.pinched) {
              const span = Math.hypot(pose.x - other.x, pose.y - other.y);
              if (previousSpan !== null) controlsRef.current?.zoom((previousSpan - span) * 6);
              previousSpan = span; pinchAt = 0;
            } else {
              previousSpan = null;
              if (pose?.pinched && previous?.pinched) {
                const dx = pose.x - previous.x; const dy = pose.y - previous.y;
                controlsRef.current?.rotate(-dx * 3, dy * 3);
                if (Math.hypot(dx, dy) > .012) pinchAt = now;
                if (pinchAt && now - pinchAt > 900 && now - lastSelect > 1700) { select.current(); lastSelect = now; pinchAt = 0; setMessage("Panel selected. Release your pinch before the next selection."); }
              } else if (pose?.pinched) pinchAt = now;
              else pinchAt = 0;
            }
            previous = pose;
          } catch { stop(); setEnabled(false); setMessage("Hand tracking stopped after a camera error. Mouse and touch controls remain available."); }
        };
        frame = requestAnimationFrame(tick);
      } catch (error) { if (!cancelled) { stop(); setEnabled(false); setMessage(error instanceof Error && error.name === "NotAllowedError" ? "Camera permission was declined. You can continue with mouse or touch." : "Hand tracking could not start. Check camera access and the installed MediaPipe model assets."); } }
    })();
    return () => { cancelled = true; stop(); document.removeEventListener("visibilitychange", hidden); };
  }, [enabled, controlsRef]);
  return <div className={styles.gestures}><div className={styles.inline}><strong>Hands, optionally</strong><button aria-pressed={enabled} onClick={() => { setEnabled(!enabled); if (enabled) setMessage("Camera off. Gestures only change this view."); }}>{enabled ? "Turn camera off" : "Enable camera gestures"}</button></div><p role="status">{message}</p><p className={styles.muted}>Processed on this device. No video is uploaded or recorded. Camera stops when you leave or hide Workshop.</p><video ref={video} muted playsInline className={enabled ? styles.cameraPreview : styles.hiddenVideo} aria-label="Your local hand tracking preview" /></div>;
}
