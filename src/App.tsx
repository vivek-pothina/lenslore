/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Camera, ArrowLeft, ArrowRight, Play, Pause, Loader2, User, Plus, Minus, CheckCircle, MapPin, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { themes, type Vibe, type ThemeColors } from './theme';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Stop {
  id: number;
  name: string;
  location: string;
  era: string;
  coordinates: string;
  imageHint: string;
}

const STOPS: Stop[] = [
  { id: 1, name: "FIT Museum", location: "Seventh Ave at 27 St", era: "20th Century Fashion", coordinates: "40.7465° N, 73.9942° W", imageHint: "A grand entrance or a window display of style." },
  { id: 2, name: "The High Line", location: "Chelsea Section", era: "Industrial Rebirth", coordinates: "40.7480° N, 74.0048° W", imageHint: "Elevated steel and urban greenery." },
  { id: 3, name: "Chelsea Market", location: "75 9th Ave", era: "Victorian Industrial", coordinates: "40.7423° N, 74.0061° W", imageHint: "Exposed brick and ironwork." },
];

// --- Themed Components ---

function Button({
  className, variant = 'primary', theme, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost'; theme: ThemeColors }) {
  const style = {
    primary: { background: theme.accent, color: '#fff', boxShadow: `0 0 15px ${theme.accentGlow}` },
    outline: { background: 'transparent', borderColor: theme.foreground, color: theme.foreground, boxShadow: `0 0 15px ${theme.glowColor}` },
    ghost: { background: 'transparent', color: theme.muted },
  }[variant];

  const hoverClass = {
    primary: 'hover:brightness-110',
    outline: 'hover:brightness-110',
    ghost: 'hover:brightness-125',
  }[variant];

  return (
    <button
      className={cn(
        "h-12 px-6 rounded-lg font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none border",
        variant === 'outline' ? 'border' : 'border-transparent',
        hoverClass,
        className
      )}
      style={style}
      {...props}
    />
  );
}

function Card({ children, className, theme }: { children: React.ReactNode; className?: string; theme: ThemeColors }) {
  return (
    <div className={cn("rounded-xl overflow-hidden", className)} style={{ background: theme.surface, borderColor: theme.border, borderWidth: 1, borderStyle: 'solid' }}>
      {children}
    </div>
  );
}

// --- Main App ---

export default function App() {
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [vibe, setVibe] = useState<Vibe>('Cyberpunk');
  const [groupSize, setGroupSize] = useState(1);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [lore, setLore] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = themes[vibe];
  const currentStop = STOPS[currentStopIndex];

  // --- AI Logic ---

  const generateLore = async (base64Image: string) => {
    setIsGenerating(true);
    setStep(2);
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image.split(',')[1], vibe, location: currentStop.name, groupSize }),
      });
      if (!response.ok) throw new Error('Gemini API request failed');
      const data = await response.json();
      setLore(data.lore);

      try {
        const ttsResponse = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.lore }),
        });
        if (ttsResponse.ok) {
          const blob = await ttsResponse.blob();
          setAudioUrl(URL.createObjectURL(blob));
        }
      } catch (e) {
        console.error('TTS failed', e);
      }
      setStep(3);
    } catch (error) {
      console.error('AI Error:', error);
      setLore('The shadows refuse to speak today. Proceed to the next coordinate.');
      setStep(3);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setCapturedImage(base64);
        generateLore(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const nextStop = () => {
    if (currentStopIndex < STOPS.length - 1) {
      setCurrentStopIndex(prev => prev + 1);
      setStep(1);
      setLore('');
      setAudioUrl(null);
      setCapturedImage(null);
      setIsPlaying(false);
    } else {
      setStep(4);
    }
  };

  // --- Render Helpers ---

  const renderSetup = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col gap-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: t.foreground }}>Configure Journey</h2>
        <p style={{ color: t.muted }}>Set the parameters for your urban exploration.</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <label className="block text-xs font-mono uppercase tracking-widest" style={{ color: t.muted }}>Journey Vibe</label>
          <div className="grid grid-cols-2 gap-2">
            {(['Cyberpunk', 'Noir', 'Fantasy', 'Historical'] as Vibe[]).map(v => {
              const isActive = vibe === v;
              const vt = themes[v];
              return (
                <button
                  key={v}
                  onClick={() => setVibe(v)}
                  className="h-12 rounded-lg border transition-all text-sm font-medium"
                  style={{
                    background: isActive ? vt.accentLight : vt.surface,
                    borderColor: isActive ? vt.accent : vt.border,
                    color: isActive ? vt.accent : vt.muted,
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-mono uppercase tracking-widest" style={{ color: t.muted }}>Group Size</label>
          <div className="flex items-center justify-between rounded-lg p-2 h-12" style={{ background: t.surface, borderColor: t.border, borderWidth: 1, borderStyle: 'solid' }}>
            <button onClick={() => setGroupSize(Math.max(1, groupSize - 1))} className="w-8 h-8 flex items-center justify-center rounded" style={{ background: t.background, borderColor: t.border, color: t.muted, borderWidth: 1, borderStyle: 'solid' }}>
              <Minus size={16} />
            </button>
            <span className="font-medium" style={{ color: t.foreground }}>{groupSize}</span>
            <button onClick={() => setGroupSize(groupSize + 1)} className="w-8 h-8 flex items-center justify-center rounded" style={{ background: t.background, borderColor: t.border, color: t.muted, borderWidth: 1, borderStyle: 'solid' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-8">
        <Button onClick={() => setStep(1)} className="w-full" theme={t}>Start Journey</Button>
      </div>
    </motion.div>
  );

  const renderHunt = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="text-center space-y-2 mb-8">
        <p className="text-xs font-mono uppercase tracking-widest" style={{ color: t.muted }}>Stop {currentStop.id} of {STOPS.length}</p>
        <h2 className="text-2xl font-semibold" style={{ color: t.foreground }}>{currentStop.name}</h2>
        <div className="flex items-center justify-center gap-1 text-sm" style={{ color: t.muted }}>
          <MapPin size={14} />
          <span>{currentStop.location}</span>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-xs mb-2" style={{ color: t.muted }}>
          <span>Progress</span>
          <span>Step {currentStopIndex + 1}/{STOPS.length}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: t.border }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((currentStopIndex + 1) / STOPS.length) * 100}%`, background: t.accent }} />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="w-full aspect-[3/4] rounded-3xl relative overflow-hidden flex flex-col items-center justify-center" style={{ background: t.surface, borderColor: t.border, borderWidth: 1, borderStyle: 'solid' }}>
          <div className="absolute inset-8 rounded-lg pointer-events-none" style={{ borderColor: `${t.border}50`, borderWidth: 1, borderStyle: 'solid' }}>
            <div className="absolute top-0 left-0 w-8 h-8 rounded-tl-lg" style={{ borderTopWidth: 2, borderLeftWidth: 2, borderColor: `${t.foreground}33` }} />
            <div className="absolute top-0 right-0 w-8 h-8 rounded-tr-lg" style={{ borderTopWidth: 2, borderRightWidth: 2, borderColor: `${t.foreground}33` }} />
            <div className="absolute bottom-0 left-0 w-8 h-8 rounded-bl-lg" style={{ borderBottomWidth: 2, borderLeftWidth: 2, borderColor: `${t.foreground}33` }} />
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-br-lg" style={{ borderBottomWidth: 2, borderRightWidth: 2, borderColor: `${t.foreground}33` }} />
          </div>

          <Camera size={64} className="mb-4 opacity-20" style={{ color: t.muted }} />
          <p className="text-xs font-mono uppercase tracking-widest opacity-40" style={{ color: t.muted }}>Frame Landmark</p>

          <div className="absolute bottom-8 px-6 text-center">
            <p className="text-sm italic" style={{ color: t.muted }}>{currentStop.imageHint}</p>
          </div>
        </div>

        <input type="file" accept="image/*" capture="environment" className="hidden" id="camera-input" onChange={handleCapture} ref={fileInputRef} />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-20 h-20 rounded-full flex items-center justify-center border-4 active:scale-90 transition-transform ring-2"
          style={{ background: t.accent, borderColor: t.background, boxShadow: `0 0 20px ${t.accentGlow}` }}
        >
          <div className="w-14 h-14 rounded-full" style={{ border: `2px solid ${t.foreground}33` }} />
        </button>
      </div>
    </motion.div>
  );

  const renderAnalyzing = () => (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <div className="relative">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 blur-3xl rounded-full"
          style={{ background: t.accent }}
        />
        <Loader2 size={48} className="animate-spin relative z-10" style={{ color: t.accent }} />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-medium" style={{ color: t.foreground }}>Analyzing Artifact...</h3>
        <p className="text-sm font-mono uppercase tracking-widest" style={{ color: t.muted }}>Consulting the Void</p>
      </div>
    </div>
  );

  const renderLore = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="flex gap-4 mb-8">
        <div className="w-24 h-24 shrink-0 rounded overflow-hidden" style={{ background: t.surface, borderColor: t.border, borderWidth: 1, borderStyle: 'solid' }}>
          {capturedImage && <img src={capturedImage} alt="Captured" className="w-full h-full object-cover grayscale" />}
        </div>
        <div className="flex flex-col justify-center">
          <h2 className="text-xl font-semibold" style={{ color: t.foreground }}>{currentStop.name}</h2>
          <p className="text-xs font-mono uppercase" style={{ color: t.muted }}>{currentStop.era}</p>
        </div>
      </div>

      <div className="flex-1 space-y-6">
        <p className="text-lg font-serif leading-relaxed italic" style={{ color: t.foreground }}>"{lore}"</p>

        <div className="h-16 rounded-lg flex items-center px-4 gap-4" style={{ background: t.surface, borderColor: t.border, borderWidth: 1, borderStyle: 'solid' }}>
          <button
            onClick={() => { if (audioRef.current) { isPlaying ? audioRef.current.pause() : audioRef.current.play(); setIsPlaying(!isPlaying); } }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white"
            style={{ background: t.accent }}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <div className="flex-1 flex items-center gap-1 h-6">
            {[...Array(24)].map((_, i) => (
              <motion.div
                key={i}
                animate={isPlaying ? { height: [4, Math.random() * 20 + 4, 4] } : { height: 4 }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.05 }}
                className="w-1 rounded-full"
                style={{ background: i < 12 ? t.accent : t.border }}
              />
            ))}
          </div>

          {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="hidden" />}
        </div>
      </div>

      {currentStopIndex < STOPS.length - 1 && (
        <div className="mb-6 p-4 rounded-lg" style={{ background: t.surface, borderColor: t.border, borderWidth: 1, borderStyle: 'solid' }}>
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: t.muted }}>
            <MapPin size={14} />
            <span>Next Destination</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium" style={{ color: t.foreground }}>{STOPS[currentStopIndex + 1].name}</p>
              <p className="text-xs" style={{ color: t.muted }}>{STOPS[currentStopIndex + 1].coordinates}</p>
            </div>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${STOPS[currentStopIndex + 1].coordinates.replace('°', '').replace(/,/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline"
              style={{ color: t.accent }}
            >
              Navigate
            </a>
          </div>
        </div>
      )}

      <div className="mt-auto pt-4">
        <Button onClick={nextStop} variant="outline" className="w-full" theme={t}>
          Next Destination <ArrowRight size={18} />
        </Button>
      </div>
    </motion.div>
  );

  const renderSummary = () => (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col gap-8">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: t.accentLight, color: t.accent }}>
          <Sparkles size={32} />
        </div>
        <h2 className="text-3xl font-bold font-serif italic" style={{ color: t.foreground }}>Journey Complete</h2>
        <p style={{ color: t.muted }}>The alchemist has woven your path into history.</p>
      </div>

      <Card theme={t} className="p-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-serif" style={{ color: t.foreground }}>{STOPS.length}</p>
            <p className="text-[10px] font-mono uppercase" style={{ color: t.muted }}>Stops</p>
          </div>
          <div style={{ borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.border, borderStyle: 'solid' }}>
            <p className="text-2xl font-serif" style={{ color: t.foreground }}>45m</p>
            <p className="text-[10px] font-mono uppercase" style={{ color: t.muted }}>Time</p>
          </div>
          <div>
            <p className="text-2xl font-serif" style={{ color: t.foreground }}>2.4</p>
            <p className="text-[10px] font-mono uppercase" style={{ color: t.muted }}>KM</p>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: t.muted }}>Captured Memories</h3>
        <div className="grid grid-cols-2 gap-2">
          {STOPS.map((_, i) => (
            <div key={i} className="aspect-square rounded-lg flex items-center justify-center" style={{ background: t.surface, borderColor: t.border, borderWidth: 1, borderStyle: 'solid' }}>
              <Camera size={24} className="opacity-20" style={{ color: t.muted }} />
            </div>
          ))}
        </div>
      </div>

      <Button onClick={() => window.location.reload()} className="w-full mt-4" theme={t}>
        Finish Journey <CheckCircle size={18} />
      </Button>
    </motion.div>
  );

  return (
    <div className="min-h-screen font-sans" style={{ background: t.background, color: t.foreground, '--accent': t.accent } as React.CSSProperties}>
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 sticky top-0 z-50" style={{ borderBottomWidth: 1, borderColor: t.border, background: `${t.background}cc`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        {step > 0 && step < 4 ? (
          <button onClick={() => setStep(prev => (prev - 1) as 0 | 1 | 2 | 3 | 4)} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: t.surface, borderColor: t.border, borderWidth: 1, borderStyle: 'solid' }}>
            <ArrowLeft size={16} style={{ color: t.foreground }} />
          </button>
        ) : <div className="w-8" />}

        <h1 className="text-lg font-semibold tracking-tight" style={{ color: t.foreground }}>LensLore</h1>

        <button className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: t.surface, borderColor: t.border, borderWidth: 1, borderStyle: 'solid' }}>
          <User size={16} style={{ color: t.muted }} />
        </button>
      </header>

      {/* Main Content */}
      <main className="max-w-[450px] mx-auto px-6 py-8 h-[calc(100vh-3.5rem)] overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 0 && renderSetup()}
          {step === 1 && renderHunt()}
          {step === 2 && renderAnalyzing()}
          {step === 3 && renderLore()}
          {step === 4 && renderSummary()}
        </AnimatePresence>
      </main>

      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1]">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full" style={{ background: t.glowColor }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full" style={{ background: t.glowColor }} />
      </div>
    </div>
  );
}
