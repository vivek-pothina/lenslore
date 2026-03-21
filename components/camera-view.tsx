"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Camera, Scan, MapPin, Crosshair, Loader2, AlertTriangle } from "lucide-react";
import type { Vibe, ScanResult, CameraState } from "@/src/lib/types";
import type { ThemeColors } from "@/src/theme";

interface CameraViewProps {
  vibe: Vibe;
  theme: ThemeColors;
  stopName: string;
  stopAddress: string;
  onCollect: (image: string, lore: string) => void;
}

type Phase = "camera" | "scanning" | "discovered" | "no-detection";

function ArtifactSprite({ vibe, color }: { vibe: Vibe; color: string }) {
  if (vibe === "Cyberpunk") {
    return (
      <svg viewBox="0 0 200 200" className="w-48 h-48" style={{ filter: `drop-shadow(0 0 20px ${color})` }}>
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
      <svg viewBox="0 0 200 200" className="w-48 h-48" style={{ filter: `drop-shadow(0 0 25px ${color})` }}>
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
      <svg viewBox="0 0 200 200" className="w-48 h-48" style={{ filter: `drop-shadow(0 0 15px ${color})` }}>
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
    <svg viewBox="0 0 200 200" className="w-48 h-48" style={{ filter: `drop-shadow(0 0 20px ${color})` }}>
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

export function CameraView({ vibe, theme: t, stopName, onCollect }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraState, setCameraState] = useState<CameraState>("loading");
  const [phase, setPhase] = useState<Phase>("camera");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const log = useCallback((msg: string) => {
    console.log(`[CV] ${msg}`);
    setDebugLog((prev) => [...prev.slice(-5), msg]);
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

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) { log("Cannot capture"); return null; }
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, [log]);

  const handleScan = useCallback(async () => {
    if (phase !== "camera") return;
    const frame = captureFrame();
    if (!frame) { log("No frame"); return; }

    setPhase("scanning");
    log("Scanning...");

    try {
      const base64 = frame.split(",")[1];
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, vibe, expectedLocation: stopName }),
      });
      if (!res.ok) { log(`API ${res.status}`); setPhase("camera"); return; }

      const data: ScanResult = await res.json();
      log(`Result: ${data.landmarkDetected} "${data.landmarkName}"`);
      setCapturedImage(frame);

      if (!data.landmarkDetected) {
        setScanResult(data);
        setPhase("no-detection");
        return;
      }

      setScanResult(data);
      setPhase("discovered");
      log("DISCOVERED ✓");
    } catch (e) {
      log(`Error: ${e}`);
      setPhase("camera");
    }
  }, [phase, captureFrame, vibe, stopName, log]);

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
            body: JSON.stringify({ image: base64, vibe, expectedLocation: stopName }),
          });
          if (!res.ok) throw new Error();
          const data: ScanResult = await res.json();
          setCapturedImage(b64Full);
          if (!data.landmarkDetected) { setScanResult(data); setPhase("no-detection"); return; }
          setScanResult(data);
          setPhase("discovered");
        } catch (err) { log(`File err: ${err}`); setPhase("camera"); }
      };
      reader.readAsDataURL(file);
    },
    [vibe, stopName, log]
  );

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden rounded-3xl" style={{ minHeight: "70vh" }}>
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Feed - ALWAYS visible */}
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ backgroundColor: "#000" }} />

      {/* Scan lines */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5, background: `repeating-linear-gradient(0deg, transparent 0px, transparent 3px, ${t.accent}05 3px, ${t.accent}05 4px)` }} />

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

      {/* Camera phase: crosshair */}
      {phase === "camera" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
          <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 2.5, repeat: Infinity }}>
            <Crosshair size={100} strokeWidth={0.8} style={{ color: t.accent }} />
          </motion.div>
          <p className="mt-3 text-xs font-mono" style={{ color: `${t.accent}88` }}>POINT AT A CAN & SCAN</p>
        </div>
      )}

      {/* Camera phase: bottom button */}
      {phase === "camera" && (
        <div className="relative mt-auto flex flex-col items-center gap-3 p-6" style={{ zIndex: 15 }}>
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
          {debugLog.length > 0 && (
            <div className="w-full max-h-16 overflow-y-auto rounded p-1.5 mt-1" style={{ backgroundColor: `${t.background}88` }}>
              {debugLog.map((l, i) => <p key={i} className="text-[10px] font-mono opacity-40">{l}</p>)}
            </div>
          )}
        </div>
      )}

      {/* SCANNING overlay */}
      <AnimatePresence>
        {phase === "scanning" && (
          <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 50, backgroundColor: `${t.background}88` }}>
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-32 h-32">
                <motion.div className="absolute inset-0 rounded-full border-2" style={{ borderColor: t.accent }} animate={{ scale: [1, 1.6, 1], opacity: [0.8, 0, 0.8] }} transition={{ duration: 1.8, repeat: Infinity }} />
                <motion.div className="absolute inset-4 rounded-full border" style={{ borderColor: `${t.accent}80` }} animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 1.8, repeat: Infinity, delay: 0.4 }} />
                <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={28} className="animate-spin" style={{ color: t.accent }} /></div>
              </div>
              <p className="text-sm font-mono" style={{ color: t.foreground }}>Scanning...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NO DETECTION */}
      <AnimatePresence>
        {phase === "no-detection" && (
          <motion.div key="no-detect" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center p-6" style={{ zIndex: 50, backgroundColor: `${t.background}dd` }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }} className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${t.accent}15`, border: `2px solid ${t.accent}40` }}>
              <AlertTriangle size={32} style={{ color: t.accent }} />
            </motion.div>
            <p className="text-lg font-semibold mb-2" style={{ color: t.foreground }}>No Can Detected</p>
            <p className="text-sm text-center mb-6 max-w-xs" style={{ color: t.muted }}>Point your camera at a <strong style={{ color: t.accent }}>soda can, La Croix, Coke</strong>, or any beverage can and try again.</p>
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

            {/* Bounding box highlight - shows where the object was detected */}
            {scanResult.boundingBox && (
              <motion.div
                className="absolute border-2 rounded-lg"
                style={{
                  borderColor: t.accent,
                  boxShadow: `0 0 20px ${t.accentGlow}, inset 0 0 20px ${t.accent}15`,
                  left: `${scanResult.boundingBox.x * 100}%`,
                  top: `${scanResult.boundingBox.y * 100}%`,
                  width: `${scanResult.boundingBox.width * 100}%`,
                  height: `${scanResult.boundingBox.height * 100}%`,
                }}
                initial={{ opacity: 0, scale: 1.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                {/* Corner markers */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 rounded-tl" style={{ borderColor: t.accent }} />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 rounded-tr" style={{ borderColor: t.accent }} />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 rounded-bl" style={{ borderColor: t.accent }} />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 rounded-br" style={{ borderColor: t.accent }} />
              </motion.div>
            )}

            {/* Expanding rings from detected object center */}
            {scanResult.boundingBox && (
              <>
                <motion.div
                  className="absolute rounded-full border-2"
                  style={{
                    borderColor: `${t.accent}60`,
                    left: `${(scanResult.boundingBox.x + scanResult.boundingBox.width / 2) * 100}%`,
                    top: `${(scanResult.boundingBox.y + scanResult.boundingBox.height / 2) * 100}%`,
                    width: 40, height: 40, marginLeft: -20, marginTop: -20,
                  }}
                  initial={{ scale: 0.5, opacity: 1 }}
                  animate={{ scale: 5, opacity: 0 }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
                <motion.div
                  className="absolute rounded-full border-2"
                  style={{
                    borderColor: `${t.accent}80`,
                    left: `${(scanResult.boundingBox.x + scanResult.boundingBox.width / 2) * 100}%`,
                    top: `${(scanResult.boundingBox.y + scanResult.boundingBox.height / 2) * 100}%`,
                    width: 30, height: 30, marginLeft: -15, marginTop: -15,
                  }}
                  initial={{ scale: 0.5, opacity: 1 }}
                  animate={{ scale: 4, opacity: 0 }}
                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.15 }}
                />
              </>
            )}

            {/* ===== SVG ARTIFACT SPRITE — overlaid at bounding box center ===== */}
            <motion.div
              className="absolute"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 160, damping: 12, delay: 0.25 }}
              style={
                scanResult.boundingBox
                  ? {
                      left: `${(scanResult.boundingBox.x + scanResult.boundingBox.width / 2) * 100}%`,
                      top: `${(scanResult.boundingBox.y + scanResult.boundingBox.height / 2) * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }
                  : { left: "50%", top: "40%", transform: "translate(-50%, -50%)" }
              }
            >
              {/* Glow behind sprite */}
              <motion.div
                className="absolute -inset-12 rounded-full blur-2xl"
                style={{ backgroundColor: `${t.accent}20` }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
              <div className="relative">
                <ArtifactSprite vibe={vibe} color={t.accent} />
              </div>
            </motion.div>

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
