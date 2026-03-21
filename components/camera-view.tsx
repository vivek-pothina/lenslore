"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Camera, Scan, MapPin, Loader2 } from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vibe, ScanResult, CameraState } from "@/src/lib/types";
import type { ThemeColors } from "@/src/theme";

/**
 * Compute the rendered rect of a video with object-cover inside its container.
 * Returns {offsetX, offsetY, renderedW, renderedH} in CSS pixels.
 * Gemini bbox coords (0–1) are relative to the captured frame (= full video res).
 * We need to map them to the portion of the container that actually shows the video.
 */
function getObjectCoverRect(
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number
): { offsetX: number; offsetY: number; renderedW: number; renderedH: number } {
  const containerAR = containerW / containerH;
  const videoAR = videoW / videoH;
  let renderedW: number, renderedH: number;
  if (videoAR > containerAR) {
    // Video is wider → height fills, width overflows → crop left/right
    renderedH = containerH;
    renderedW = containerH * videoAR;
  } else {
    // Video is taller → width fills, height overflows → crop top/bottom
    renderedW = containerW;
    renderedH = containerW / videoAR;
  }
  const offsetX = (containerW - renderedW) / 2;
  const offsetY = (containerH - renderedH) / 2;
  return { offsetX, offsetY, renderedW, renderedH };
}

interface CameraViewProps {
  vibe: Vibe;
  theme: ThemeColors;
  stopName: string;
  stopAddress: string;
  onCollect: (image: string, lore: string) => void;
}

type Phase = "camera" | "scanning" | "discovered" | "no-detection";
type BoundingBox = { x: number; y: number; width: number; height: number };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalizeBox(box: BoundingBox): BoundingBox {
  const x1 = clamp01(box.x);
  const y1 = clamp01(box.y);
  const x2 = clamp01(box.x + box.width);
  const y2 = clamp01(box.y + box.height);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(0.02, Math.abs(x2 - x1)),
    height: Math.max(0.02, Math.abs(y2 - y1)),
  };
}

function iou(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.width * a.height + b.width * b.height - inter;
  if (union <= 0) return 0;
  return inter / union;
}

function smoothBox(prev: BoundingBox | null, next: BoundingBox): BoundingBox {
  if (!prev) return normalizeBox(next);
  const cleanNext = normalizeBox(next);
  const overlap = iou(prev, cleanNext);
  const alpha = overlap > 0.08 ? 0.28 : 1; // hard switch for new target
  return normalizeBox({
    x: prev.x + (cleanNext.x - prev.x) * alpha,
    y: prev.y + (cleanNext.y - prev.y) * alpha,
    width: prev.width + (cleanNext.width - prev.width) * alpha,
    height: prev.height + (cleanNext.height - prev.height) * alpha,
  });
}

function ArtifactSprite({ vibe, color }: { vibe: Vibe; color: string }) {
  if (vibe === "Cyberpunk") {
    return (
      <svg viewBox="0 0 200 200" className="w-full h-full" style={{ filter: `drop-shadow(0 0 20px ${color})` }}>
        <style>{`
          @keyframes hexSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes hexSpinR { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
          @keyframes pulse2 { 0%,100%{opacity:0.6} 50%{opacity:1} }
          @keyframes scanDown { 0%{transform:translateY(-80px)} 100%{transform:translateY(80px)} }
        `}</style>
        <g style={{ transformOrigin: "100px 100px", animation: "hexSpin 8s linear infinite" }}>
          <polygon points="100,20 170,60 170,140 100,180 30,140 30,60" fill="none" stroke={color} strokeWidth="2" opacity="0.8"/>
          <polygon points="100,35 158,68 158,132 100,165 42,132 42,68" fill="none" stroke={color} strokeWidth="1" opacity="0.4"/>
        </g>
        <g style={{ transformOrigin: "100px 100px", animation: "hexSpinR 6s linear infinite" }}>
          <polygon points="100,40 150,70 150,130 100,160 50,130 50,70" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6"/>
        </g>
        <circle cx="100" cy="100" r="18" fill={color} opacity="0.3" style={{ animation: "pulse2 2s ease-in-out infinite" }}/>
        <circle cx="100" cy="100" r="10" fill={color} opacity="0.9" style={{ animation: "pulse2 1.5s ease-in-out infinite" }}/>
        <line x1="60" y1="100" x2="140" y2="100" stroke={color} strokeWidth="0.5" opacity="0.3" style={{ animation: "scanDown 2s ease-in-out infinite" }}/>
      </svg>
    );
  }

  if (vibe === "Fantasy") {
    return (
      <svg viewBox="0 0 200 200" className="w-full h-full" style={{ filter: `drop-shadow(0 0 25px ${color})` }}>
        <style>{`
          @keyframes runeSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes runeSpinR { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
          @keyframes glow3 { 0%,100%{opacity:0.4;r:25} 50%{opacity:1;r:30} }
          @keyframes sparkle { 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1)} }
        `}</style>
        <g style={{ transformOrigin: "100px 100px", animation: "runeSpin 10s linear infinite" }}>
          <circle cx="100" cy="100" r="80" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" strokeDasharray="8 4"/>
        </g>
        <g style={{ transformOrigin: "100px 100px", animation: "runeSpinR 7s linear infinite" }}>
          <circle cx="100" cy="100" r="65" fill="none" stroke={color} strokeWidth="1" opacity="0.3" strokeDasharray="12 6"/>
        </g>
        <g style={{ transformOrigin: "100px 100px", animation: "runeSpin 5s linear infinite" }}>
          <polygon points="100,30 115,85 170,100 115,115 100,170 85,115 30,100 85,85" fill="none" stroke={color} strokeWidth="2" opacity="0.7"/>
        </g>
        <circle cx="100" cy="100" r="25" fill={color} opacity="0.15" style={{ animation: "glow3 2s ease-in-out infinite" }}/>
        <circle cx="100" cy="100" r="12" fill={color} opacity="0.8"/>
        <circle cx="100" cy="60" r="3" fill={color} opacity="0.6" style={{ animation: "sparkle 1.5s ease-in-out infinite" }}/>
        <circle cx="140" cy="100" r="3" fill={color} opacity="0.6" style={{ animation: "sparkle 1.5s ease-in-out infinite 0.5s" }}/>
        <circle cx="100" cy="140" r="3" fill={color} opacity="0.6" style={{ animation: "sparkle 1.5s ease-in-out infinite 1s" }}/>
        <circle cx="60" cy="100" r="3" fill={color} opacity="0.6" style={{ animation: "sparkle 1.5s ease-in-out infinite 0.75s" }}/>
      </svg>
    );
  }

  if (vibe === "Noir") {
    return (
      <svg viewBox="0 0 200 200" className="w-full h-full" style={{ filter: `drop-shadow(0 0 15px ${color})` }}>
        <style>{`
          @keyframes flicker { 0%,19%,21%,23%,25%,54%,56%,100%{opacity:1} 20%,24%,55%{opacity:0.3} }
          @keyframes buzz { 0%,100%{transform:translate(0,0)} 25%{transform:translate(1px,0)} 50%{transform:translate(-1px,1px)} 75%{transform:translate(0,-1px)} }
        `}</style>
        <g style={{ animation: "buzz 0.15s linear infinite" }}>
          <rect x="30" y="55" width="140" height="90" rx="8" fill="none" stroke={color} strokeWidth="3" style={{ animation: "flicker 3s linear infinite" }}/>
          <line x1="50" y1="80" x2="150" y2="80" stroke={color} strokeWidth="6" strokeLinecap="round" style={{ animation: "flicker 2.5s linear infinite" }}/>
          <line x1="50" y1="100" x2="130" y2="100" stroke={color} strokeWidth="6" strokeLinecap="round" style={{ animation: "flicker 2.8s linear infinite" }}/>
          <line x1="50" y1="120" x2="110" y2="120" stroke={color} strokeWidth="6" strokeLinecap="round" style={{ animation: "flicker 2.2s linear infinite" }}/>
        </g>
      </svg>
    );
  }

  // Historical - compass
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full" style={{ filter: `drop-shadow(0 0 20px ${color})` }}>
      <style>{`
        @keyframes needle { 0%{transform:rotate(0deg)} 10%{transform:rotate(-15deg)} 20%{transform:rotate(10deg)} 30%{transform:rotate(-5deg)} 40%{transform:rotate(3deg)} 50%,100%{transform:rotate(0deg)} }
        @keyframes compSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
      <circle cx="100" cy="100" r="85" fill="none" stroke={color} strokeWidth="3"/>
      <circle cx="100" cy="100" r="75" fill="none" stroke={color} strokeWidth="1" opacity="0.4"/>
      <g style={{ transformOrigin: "100px 100px", animation: "compSpin 20s linear infinite" }}>
        <line x1="100" y1="25" x2="100" y2="40" stroke={color} strokeWidth="2"/>
        <line x1="100" y1="160" x2="100" y2="175" stroke={color} strokeWidth="2"/>
        <line x1="25" y1="100" x2="40" y2="100" stroke={color} strokeWidth="2"/>
        <line x1="160" y1="100" x2="175" y2="100" stroke={color} strokeWidth="2"/>
      </g>
      <circle cx="100" cy="100" r="60" fill="none" stroke={color} strokeWidth="0.5" opacity="0.3"/>
      <g style={{ transformOrigin: "100px 100px", animation: "needle 4s ease-out forwards" }}>
        <polygon points="100,35 107,100 93,100" fill="#c0392b" opacity="0.9"/>
        <polygon points="100,165 107,100 93,100" fill="#ecf0f1" opacity="0.7"/>
      </g>
      <circle cx="100" cy="100" r="6" fill={color}/>
    </svg>
  );
}

function RelicMesh({ color, vibe }: { color: string; vibe: Vibe }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const orbitARef = useRef<THREE.Mesh>(null);
  const orbitBRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      if (vibe === "Cyberpunk") {
        groupRef.current.rotation.y += delta * 1.3;
        groupRef.current.rotation.x = Math.sin(t * 1.4) * 0.18;
      } else if (vibe === "Fantasy") {
        groupRef.current.rotation.y += delta * 0.55;
        groupRef.current.rotation.z = Math.sin(t * 0.7) * 0.22;
      } else if (vibe === "Noir") {
        groupRef.current.rotation.y += delta * 0.35;
        groupRef.current.rotation.x = Math.sin(t * 2.1) * 0.05;
      } else {
        groupRef.current.rotation.y += delta * 0.75;
        groupRef.current.rotation.x = Math.sin(t * 0.8) * 0.22;
      }
    }
    if (coreRef.current) {
      coreRef.current.position.y =
        vibe === "Noir" ? Math.sin(t * 1.1) * 0.03 :
        vibe === "Fantasy" ? Math.sin(t * 1.4) * 0.12 :
        Math.sin(t * 1.7) * 0.08;
    }
    if (orbitARef.current) {
      orbitARef.current.rotation.z += delta * (vibe === "Cyberpunk" ? 2.1 : 1.1);
    }
    if (orbitBRef.current) {
      orbitBRef.current.rotation.x -= delta * (vibe === "Fantasy" ? 1.6 : 0.9);
    }
  });

  const coreMaterial =
    vibe === "Cyberpunk"
      ? { metalness: 0.9, roughness: 0.08, emissiveIntensity: 0.75 }
      : vibe === "Fantasy"
        ? { metalness: 0.2, roughness: 0.35, emissiveIntensity: 0.45 }
        : vibe === "Noir"
          ? { metalness: 0.15, roughness: 0.85, emissiveIntensity: 0.18 }
          : { metalness: 0.55, roughness: 0.18, emissiveIntensity: 0.5 };

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef}>
        {vibe === "Cyberpunk" && <octahedronGeometry args={[0.74, 0]} />}
        {vibe === "Fantasy" && <dodecahedronGeometry args={[0.72, 0]} />}
        {vibe === "Noir" && <boxGeometry args={[1.0, 1.0, 1.0]} />}
        {vibe === "Historical" && <icosahedronGeometry args={[0.72, 1]} />}
        <meshStandardMaterial
          color={vibe === "Noir" ? "#d6d6d6" : color}
          emissive={vibe === "Noir" ? "#454545" : color}
          emissiveIntensity={coreMaterial.emissiveIntensity}
          metalness={coreMaterial.metalness}
          roughness={coreMaterial.roughness}
        />
      </mesh>

      {vibe !== "Noir" && (
        <>
          <mesh ref={orbitARef} rotation={[Math.PI / 2.8, 0, 0]}>
            <torusGeometry args={[1.12, vibe === "Cyberpunk" ? 0.03 : 0.04, 16, 80]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} metalness={0.35} roughness={0.25} />
          </mesh>
          <mesh ref={orbitBRef} rotation={[0, Math.PI / 2.8, Math.PI / 4]}>
            <torusGeometry args={[1.35, 0.025, 16, 80]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.28} metalness={0.25} roughness={0.4} />
          </mesh>
        </>
      )}

      {vibe === "Cyberpunk" && (
        <mesh rotation={[Math.PI / 4, Math.PI / 4, 0]}>
          <torusKnotGeometry args={[0.5, 0.12, 72, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} metalness={0.85} roughness={0.12} />
        </mesh>
      )}

      {vibe === "Fantasy" && (
        <>
          <mesh position={[0, 1.12, 0]}>
            <coneGeometry args={[0.14, 0.35, 6]} />
            <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={0.35} metalness={0.15} roughness={0.45} />
          </mesh>
          <mesh position={[0, -1.12, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.14, 0.35, 6]} />
            <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={0.35} metalness={0.15} roughness={0.45} />
          </mesh>
        </>
      )}

      {vibe === "Noir" && (
        <mesh rotation={[0.2, 0.4, 0]}>
          <ringGeometry args={[1.0, 1.18, 4]} />
          <meshStandardMaterial color="#888888" emissive="#111111" emissiveIntensity={0.2} metalness={0.05} roughness={0.9} />
        </mesh>
      )}

      {vibe === "Historical" && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.95, 0.95, 0.08, 48]} />
          <meshStandardMaterial color="#caa46a" emissive="#7c5a2f" emissiveIntensity={0.2} metalness={0.3} roughness={0.6} />
        </mesh>
      )}
    </group>
  );
}

function ThreeSpriteOverlay({
  cx,
  cy,
  size = 160,
  color,
  vibe,
}: {
  cx: number;
  cy: number;
  size?: number;
  color: string;
  vibe: Vibe;
}) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: cx, top: cy, width: size, height: size, transform: "translate(-50%, -56%)" }}
    >
      <motion.div
        className="absolute -inset-3 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${color}55 0%, ${color}18 45%, transparent 80%)` }}
        animate={{ scale: [0.88, 1.2, 0.88], opacity: [0.2, 0.58, 0.2] }}
        transition={{ duration: 2.1, repeat: Infinity }}
      />
      <div className="absolute inset-10 opacity-30 mix-blend-screen">
        <ArtifactSprite vibe={vibe} color={color} />
      </div>
      <div className="absolute inset-0">
        <Canvas
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          camera={{ position: [0, 0, 4.5], fov: 40 }}
        >
          <ambientLight intensity={vibe === "Noir" ? 0.3 : 0.55} />
          <pointLight
            position={[2, 2, 3]}
            intensity={vibe === "Cyberpunk" ? 1.8 : vibe === "Noir" ? 0.9 : 1.45}
            color={vibe === "Historical" ? "#f5d6a1" : color}
          />
          <pointLight position={[-2, -1, 2]} intensity={0.7} color="#ffffff" />
          <RelicMesh color={color} vibe={vibe} />
        </Canvas>
      </div>
    </div>
  );
}

export function CameraView({ vibe, theme: t, stopName, onCollect }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraState, setCameraState] = useState<CameraState>("loading");
  const [phase, setPhase] = useState<Phase>("camera");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(true);
  const [liveBox, setLiveBox] = useState<BoundingBox | null>(null);
  const [liveLabel, setLiveLabel] = useState("");
  const [lockProgress, setLockProgress] = useState(0);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const [frozenBox, setFrozenBox] = useState<BoundingBox | null>(null);
  const liveInFlightRef = useRef(false);
  const liveBoxRef = useRef<BoundingBox | null>(null);
  const liveMissesRef = useRef(0);
  const lockStreakRef = useRef(0);
  const autoSnapInFlightRef = useRef(false);
  const lastAutoSnapAtRef = useRef(0);

  const log = useCallback((msg: string) => {
    console.log(`[CV] ${msg}`);
  }, []);

  const startCamera = useCallback(async () => {
    log("Starting camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("active");
      log("Camera active ✓");
    } catch (err) {
      const e = err as DOMException;
      log(`Camera error: ${e.name}`);
      setCameraState(e.name === "NotAllowedError" ? "permission-denied" : "error");
    }
  }, [log]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const captureFrame = useCallback((opts?: { maxWidth?: number; quality?: number }): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) { log("Cannot capture"); return null; }
    const srcW = video.videoWidth || 640;
    const srcH = video.videoHeight || 480;
    const maxWidth = opts?.maxWidth ?? srcW;
    const scale = Math.min(1, maxWidth / srcW);
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", opts?.quality ?? 0.8);
  }, [log]);

  const runScanWithFrame = useCallback(async (frame: string, source: "manual" | "auto") => {
    if (phase !== "camera") return;
    autoSnapInFlightRef.current = true;
    lockStreakRef.current = 0;
    setLockProgress(0);
    setFrozenFrame(frame);
    if (liveBoxRef.current) setFrozenBox(liveBoxRef.current);
    setPhase("scanning");
    log(source === "auto" ? "Target locked ✓ Auto-snap..." : "Scanning...");
    try {
      const base64 = frame.split(",")[1];
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, vibe, expectedLocation: stopName, mode: "scan" }),
      });
      if (!res.ok) { log(`API ${res.status}`); setPhase("camera"); return; }

      const data: ScanResult = await res.json();
      log(`Result: ${data.landmarkDetected} "${data.landmarkName}"`);
      setCapturedImage(frame);

      if (!data.landmarkDetected) {
        if (source === "auto") {
          setFrozenFrame(null);
          setFrozenBox(null);
          setPhase("camera");
          return;
        }
        setScanResult(data);
        setPhase("no-detection");
        return;
      }

      setScanResult(data);
      if (data.boundingBox) setFrozenBox(data.boundingBox as BoundingBox);
      setPhase("discovered");
      log("DISCOVERED ✓");
    } catch (e) {
      log(`Error: ${e}`);
      setFrozenFrame(null);
      setFrozenBox(null);
      setPhase("camera");
    } finally {
      autoSnapInFlightRef.current = false;
    }
  }, [phase, vibe, stopName, log]);

  const detectLive = useCallback(async () => {
    if (liveInFlightRef.current || autoSnapInFlightRef.current || phase !== "camera" || cameraState !== "active") return;
    const frame = captureFrame({ maxWidth: 640, quality: 0.6 });
    if (!frame) return;
    liveInFlightRef.current = true;
    try {
      const base64 = frame.split(",")[1];
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, vibe, expectedLocation: stopName, mode: "detect" }),
      });
      if (!res.ok) return;
      const data: ScanResult = await res.json();
      if (!data.landmarkDetected || !data.boundingBox) {
        liveMissesRef.current += 1;
        setLockProgress(0);
        lockStreakRef.current = 0;
        if (liveMissesRef.current >= 3) {
          setLiveBox(null);
          liveBoxRef.current = null;
          setLiveLabel("");
        }
        return;
      }
      liveMissesRef.current = 0;
      setLiveLabel(data.landmarkName || "Detected");

      const prevBox = liveBoxRef.current;
      const smoothed = smoothBox(prevBox, data.boundingBox as BoundingBox);
      liveBoxRef.current = smoothed;
      setLiveBox(smoothed);

      const overlap = prevBox ? iou(prevBox, smoothed) : 0;
      lockStreakRef.current = overlap > 0.55 ? lockStreakRef.current + 1 : 1;
      const lockSteps = Math.min(lockStreakRef.current, 3);
      setLockProgress(lockSteps / 3);

      const lockReady = lockSteps >= 3 && liveMode;
      const offCooldown = Date.now() - lastAutoSnapAtRef.current > 5000;
      if (lockReady && offCooldown && !autoSnapInFlightRef.current) {
        lastAutoSnapAtRef.current = Date.now();
        const full = captureFrame({ maxWidth: 1280, quality: 0.82 }) || captureFrame();
        if (full) {
          setFrozenFrame(full);
          setFrozenBox(smoothed);
          void runScanWithFrame(full, "auto");
        }
      }
    } catch {
      // Silent fail; live loop should keep running.
    } finally {
      liveInFlightRef.current = false;
    }
  }, [phase, cameraState, captureFrame, vibe, stopName, liveMode, runScanWithFrame]);

  useEffect(() => {
    if (!liveMode || phase !== "camera" || cameraState !== "active") return;
    detectLive();
    const id = window.setInterval(detectLive, 2400);
    return () => window.clearInterval(id);
  }, [liveMode, phase, cameraState, detectLive]);

  const getScreenBox = useCallback((bb: BoundingBox) => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return null;
    const { offsetX, offsetY, renderedW, renderedH } = getObjectCoverRect(
      container.offsetWidth,
      container.offsetHeight,
      video.videoWidth || 1280,
      video.videoHeight || 720
    );
    const safe = normalizeBox(bb);
    return {
      left: offsetX + safe.x * renderedW,
      top: offsetY + safe.y * renderedH,
      width: safe.width * renderedW,
      height: safe.height * renderedH,
    };
  }, []);

  const getSpriteAnchor = useCallback((bb: BoundingBox) => {
    const box = getScreenBox(bb);
    if (!box) return null;
    return {
      cx: box.left + box.width / 2,
      cy: box.top + box.height / 2,
      size: Math.max(92, Math.min(240, Math.max(box.width, box.height) * 1.08)),
    };
  }, [getScreenBox]);

  const handleScan = useCallback(async () => {
    if (phase !== "camera") return;
    const frame = captureFrame();
    if (!frame) { log("No frame"); return; }
    await runScanWithFrame(frame, "manual");
  }, [phase, captureFrame, log, runScanWithFrame]);

  const handleCollect = useCallback(() => {
    if (capturedImage && scanResult) {
      log("Collecting...");
      stopCamera();
      onCollect(capturedImage, scanResult.lore);
    }
  }, [capturedImage, scanResult, stopCamera, onCollect, log]);

  const handleRescan = useCallback(() => {
    log("Rescan");
    setPhase("camera");
    setScanResult(null);
    setCapturedImage(null);
    setLiveBox(null);
    setLiveLabel("");
    setLockProgress(0);
    setFrozenFrame(null);
    setFrozenBox(null);
    lockStreakRef.current = 0;
    liveBoxRef.current = null;
    liveMissesRef.current = 0;
  }, [log]);

  const handleFileCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = async () => {
        const b64Full = reader.result as string;
        const base64 = b64Full.split(",")[1];
        setPhase("scanning");
        try {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64, vibe, expectedLocation: stopName, mode: "scan" }),
          });
          if (!res.ok) throw new Error();
          const data: ScanResult = await res.json();
          setCapturedImage(b64Full);
          setFrozenFrame(b64Full);
          if (data.boundingBox) setFrozenBox(data.boundingBox as BoundingBox);
          if (!data.landmarkDetected) { setScanResult(data); setPhase("no-detection"); return; }
          setScanResult(data);
          setPhase("discovered");
        } catch (err) { log(`File err: ${err}`); setPhase("camera"); }
      };
      reader.readAsDataURL(file);
    },
    [vibe, stopName, log]
  );

  const showFrozenFrame = Boolean(frozenFrame) && phase !== "camera";
  const activeOverlayBox = (phase === "discovered" && scanResult?.boundingBox)
    ? (scanResult.boundingBox as BoundingBox)
    : frozenBox;

  return (
    <div ref={containerRef} className="flex-1 flex flex-col relative overflow-hidden rounded-3xl" style={{ minHeight: "70vh" }}>
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera feed + frozen frame */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ backgroundColor: "#000", opacity: showFrozenFrame ? 0 : 1 }}
      />
      {showFrozenFrame && frozenFrame && (
        <img src={frozenFrame} alt="Frozen scan frame" className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* Top HUD */}
      <div className="relative flex items-center justify-between p-4" style={{ zIndex: 15 }}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: `${t.background}aa` }}>
          <MapPin size={14} style={{ color: t.accent }} />
          <span className="text-sm font-semibold" style={{ color: t.foreground }}>{stopName}</span>
        </div>
        {phase === "camera" && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: `${t.background}aa` }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
            <span className="text-xs font-mono" style={{ color: "#22c55e" }}>LIVE</span>
          </div>
        )}
      </div>

      {/* Camera phase: lock target */}
      {phase === "camera" && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
          {liveBox && (() => {
            const box = getScreenBox(liveBox);
            if (!box) return null;
            const anchor = getSpriteAnchor(liveBox);
            if (!anchor) return null;
            const cx = anchor.cx;
            const cy = anchor.cy;
            const lockPercent = Math.round(lockProgress * 100);
            return (
              <>
                <motion.div
                  className="absolute rounded-md border"
                  style={{
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                    borderColor: `${t.accent}88`,
                    boxShadow: `0 0 8px ${t.accent}33`,
                  }}
                  animate={{ opacity: [0.35, 0.65, 0.35] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
                <div className="absolute px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wide" style={{ left: box.left, top: box.top - 24, color: t.foreground, backgroundColor: `${t.background}cc`, border: `1px solid ${t.accent}66` }}>
                  {lockPercent >= 100 ? "LOCKED" : `LOCK ${lockPercent}%`}: {liveLabel || "Target"}
                </div>
                <motion.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: lockProgress > 0.4 ? 1 : 0.55 }}
                >
                  <ThreeSpriteOverlay cx={cx} cy={cy} size={anchor.size} color={t.accent} vibe={vibe} />
                </motion.div>
              </>
            );
          })()}
        </div>
      )}

      {phase === "scanning" && activeOverlayBox && (() => {
        const anchor = getSpriteAnchor(activeOverlayBox);
        if (!anchor) return null;
        return (
          <motion.div className="absolute inset-0 pointer-events-none" style={{ zIndex: 55 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ThreeSpriteOverlay cx={anchor.cx} cy={anchor.cy} size={Math.max(anchor.size, 170)} color={t.accent} vibe={vibe} />
          </motion.div>
        );
      })()}

      {/* Camera phase: bottom button */}
      {phase === "camera" && (
        <div className="relative mt-auto flex flex-col items-center gap-3 p-6" style={{ zIndex: 15 }}>
          <div className="flex items-center gap-2 px-2 py-1 rounded-full" style={{ backgroundColor: `${t.background}aa` }}>
            <button
              type="button"
              onClick={() => {
                setLiveMode((v) => {
                  const next = !v;
                  if (!next) {
                    setLockProgress(0);
                    lockStreakRef.current = 0;
                  }
                  return next;
                });
              }}
              className="text-[10px] font-mono uppercase tracking-wide px-2.5 py-1 rounded-full border cursor-pointer"
              style={{ color: liveMode ? t.accent : t.muted, borderColor: liveMode ? `${t.accent}88` : `${t.muted}66`, backgroundColor: `${t.background}99` }}
            >
              Live lock {liveMode ? "on" : "off"}
            </button>
          </div>
          {liveMode && (
            <div className="w-44 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${t.background}bb`, border: `1px solid ${t.accent}33` }}>
              <motion.div
                className="h-full"
                style={{ backgroundColor: t.accent, boxShadow: `0 0 12px ${t.accentGlow}` }}
                animate={{ width: `${Math.round(lockProgress * 100)}%` }}
              />
            </div>
          )}
          {cameraState === "active" ? (
            <>
              <button onClick={handleScan} className="w-20 h-20 rounded-full flex items-center justify-center border-4 active:scale-90 transition-transform cursor-pointer" style={{ backgroundColor: t.foreground, borderColor: `${t.accent}40`, boxShadow: `0 0 30px ${t.accentGlow}` }}>
                <Scan size={28} style={{ color: t.background }} />
              </button>
              <span className="text-xs font-mono" style={{ color: `${t.muted}88` }}>TAP TO SCAN</span>
            </>
          ) : (
            <>
              <button onClick={() => fileInputRef.current?.click()} className="w-20 h-20 rounded-full flex items-center justify-center border-4 active:scale-90 transition-transform cursor-pointer" style={{ backgroundColor: t.foreground, borderColor: `${t.accent}40`, boxShadow: `0 0 30px ${t.accentGlow}` }}>
                <Camera size={28} style={{ color: t.background }} />
              </button>
              <span className="text-xs font-mono" style={{ color: `${t.muted}88` }}>CAMERA BLOCKED — TAP TO UPLOAD</span>
            </>
          )}
        </div>
      )}

      {/* SCANNING overlay */}
      <AnimatePresence>
        {phase === "scanning" && (
          <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 50, backgroundColor: `${t.background}88` }}>
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="animate-spin" style={{ color: t.accent }} />
              <p className="text-sm font-medium" style={{ color: t.foreground }}>Scanning target...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NO DETECTION */}
      <AnimatePresence>
        {phase === "no-detection" && (
          <motion.div key="no-detect" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center p-6" style={{ zIndex: 50, backgroundColor: `${t.background}dd` }}>
            <p className="text-lg font-semibold mb-2" style={{ color: t.foreground }}>Nothing Detected</p>
            <p className="text-sm text-center mb-6 max-w-xs" style={{ color: t.muted }}>Try framing the landmark or a red parking sign in better light, then scan again.</p>
            <button onClick={handleRescan} className="px-8 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform cursor-pointer" style={{ backgroundColor: t.accent, color: t.background, boxShadow: `0 0 20px ${t.accentGlow}` }}>Try Again</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== DISCOVERED: AR artifact on camera at detected position ===== */}
      <AnimatePresence>
        {phase === "discovered" && scanResult && (
          <motion.div key="discovered" className="absolute inset-0" style={{ zIndex: 50 }}>

            {/* Semi-transparent bg - camera still visible behind */}
            <div className="absolute inset-0" style={{ backgroundColor: `${t.background}88` }} />

            {/* Flash */}
            <motion.div className="absolute inset-0" style={{ backgroundColor: t.accent }} initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.3 }} />

            {/* Bounding box highlight — pixel-accurate via object-cover mapping */}
            {scanResult.boundingBox && (() => {
              const box = getScreenBox(scanResult.boundingBox as BoundingBox);
              if (!box) return null;
              const left = box.left;
              const top = box.top;
              const width = box.width;
              const height = box.height;
              return (
                <>
                  {/* The bounding box */}
                  <motion.div
                    className="absolute rounded-md border"
                    style={{
                      borderColor: `${t.accent}88`,
                      boxShadow: `0 0 10px ${t.accent}30`,
                      left, top, width, height,
                    }}
                  />
                </>
              );
            })()}

            {/* 3D sprite over frozen bbox center */}
            {activeOverlayBox && (() => {
              const anchor = getSpriteAnchor(activeOverlayBox);
              if (!anchor) return null;
              return (
                <motion.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
                >
                  <ThreeSpriteOverlay cx={anchor.cx} cy={anchor.cy} size={Math.max(anchor.size, 180)} color={t.accent} vibe={vibe} />
                </motion.div>
              );
            })()}

            {/* Info panel at bottom */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute bottom-0 left-0 right-0 flex flex-col items-center px-6 pb-6"
            >
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.6 }} className="px-4 py-1.5 rounded-full mb-3" style={{ backgroundColor: `${t.accent}20`, border: `1px solid ${t.accent}40` }}>
                <span className="text-xs font-mono uppercase tracking-widest" style={{ color: t.accent }}>✦ Artifact Discovered ✦</span>
              </motion.div>

              <motion.h3 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="text-lg font-bold mb-2 text-center" style={{ color: t.foreground }}>
                {scanResult.landmarkName}
              </motion.h3>

              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }} className="text-sm italic text-center leading-relaxed max-w-sm mb-5" style={{ color: t.muted }}>
                &ldquo;{scanResult.lore}&rdquo;
              </motion.p>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }} className="flex gap-3">
                <button type="button" onClick={handleRescan} className="px-6 py-3 rounded-full text-sm font-medium border active:scale-95 transition-transform cursor-pointer" style={{ borderColor: `${t.accent}40`, color: t.muted, backgroundColor: `${t.background}cc` }}>
                  Rescan
                </button>
                <button type="button" onClick={handleCollect} className="px-8 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform cursor-pointer" style={{ backgroundColor: t.accent, color: t.background, boxShadow: `0 0 24px ${t.accentGlow}` }}>
                  Collect Artifact
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileCapture} />
    </div>
  );
}
