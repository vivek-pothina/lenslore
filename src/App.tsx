/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Camera, 
  ArrowLeft, 
  ArrowRight, 
  Play, 
  Pause, 
  Loader2, 
  User, 
  Plus, 
  Minus,
  CheckCircle,
  MapPin,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Vibe = 'Cyberpunk' | 'Noir' | 'Fantasy' | 'Historical';

interface Stop {
  id: number;
  name: string;
  location: string;
  era: string;
  coordinates: string;
  imageHint: string;
}

const STOPS: Stop[] = [
  {
    id: 1,
    name: "FIT Museum",
    location: "Seventh Ave at 27 St",
    era: "20th Century Fashion",
    coordinates: "40.7465° N, 73.9942° W",
    imageHint: "A grand entrance or a window display of style."
  },
  {
    id: 2,
    name: "The High Line",
    location: "Chelsea Section",
    era: "Industrial Rebirth",
    coordinates: "40.7480° N, 74.0048° W",
    imageHint: "Elevated steel and urban greenery."
  },
  {
    id: 3,
    name: "Chelsea Market",
    location: "75 9th Ave",
    era: "Victorian Industrial",
    coordinates: "40.7423° N, 74.0061° W",
    imageHint: "Exposed brick and ironwork."
  }
];

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: "bg-[#137fec] text-white shadow-[0_0_15px_rgba(19,127,236,0.3)] hover:bg-[#137fec]/90",
      outline: "bg-transparent border border-[#F4F4F5] text-[#F4F4F5] hover:bg-white/5 shadow-[0_0_15px_rgba(250,250,250,0.15)]",
      ghost: "bg-transparent text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#27272A]/50"
    };
    return (
      <button
        ref={ref}
        className={cn(
          "h-12 px-6 rounded-lg font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn("bg-[#09090B] border border-[#27272A] rounded-xl overflow-hidden", className)}>
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0); // 0: Setup, 1: Hunt, 2: Analyzing, 3: Lore, 4: Summary
  const [vibe, setVibe] = useState<Vibe>('Cyberpunk');
  const [groupSize, setGroupSize] = useState(1);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [lore, setLore] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentStop = STOPS[currentStopIndex];

  // --- AI Logic ---

  const generateLore = async (base64Image: string) => {
    setIsGenerating(true);
    setStep(2);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = "gemini-3-flash-preview";
      
      const prompt = `You are a theatrical narrator for an immersive scavenger hunt called "The Urban Alchemist". 
      The current vibe is "${vibe}". 
      The location is "${currentStop.name}". 
      Analyze this photo taken by the user at the location. 
      Generate a short, immersive 3-sentence lore piece about what they've found. 
      Make it sound mysterious and atmospheric. 
      Do not use markdown, just plain text.`;

      const result = await ai.models.generateContent({
        model,
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] } }
            ]
          }
        ]
      });

      const generatedText = result.text || "The artifact remains silent, but its presence is felt in the marrow of your bones.";
      setLore(generatedText);
      
      // Generate Audio via Proxy
      try {
        const ttsResponse = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: generatedText })
        });
        
        if (ttsResponse.ok) {
          const blob = await ttsResponse.blob();
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
        }
      } catch (e) {
        console.error("TTS failed", e);
      }

      setStep(3);
    } catch (error) {
      console.error("AI Error:", error);
      setLore("The shadows refuse to speak today. Proceed to the next coordinate.");
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
      setLore("");
      setAudioUrl(null);
      setCapturedImage(null);
      setIsPlaying(false);
    } else {
      setStep(4);
    }
  };

  // --- Render Helpers ---

  const renderSetup = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col gap-8"
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Configure Journey</h2>
        <p className="text-[#A1A1AA]">Set the parameters for your urban exploration.</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <label className="block text-xs font-mono uppercase tracking-widest text-[#A1A1AA]">Journey Vibe</label>
          <div className="grid grid-cols-2 gap-2">
            {(['Cyberpunk', 'Noir', 'Fantasy', 'Historical'] as Vibe[]).map((v) => (
              <button
                key={v}
                onClick={() => setVibe(v)}
                className={cn(
                  "h-12 rounded-lg border transition-all text-sm font-medium",
                  vibe === v 
                    ? "bg-[#137fec]/10 border-[#137fec] text-[#137fec]" 
                    : "bg-[#09090B] border-[#27272A] text-[#A1A1AA] hover:border-[#A1A1AA]/50"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-mono uppercase tracking-widest text-[#A1A1AA]">Group Size</label>
          <div className="flex items-center justify-between bg-[#09090B] border border-[#27272A] rounded-lg p-2 h-12">
            <button 
              onClick={() => setGroupSize(Math.max(1, groupSize - 1))}
              className="w-8 h-8 flex items-center justify-center rounded bg-[#000000] border border-[#27272A] text-[#A1A1AA]"
            >
              <Minus size={16} />
            </button>
            <span className="font-medium">{groupSize}</span>
            <button 
              onClick={() => setGroupSize(groupSize + 1)}
              className="w-8 h-8 flex items-center justify-center rounded bg-[#000000] border border-[#27272A] text-[#A1A1AA]"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-8">
        <Button onClick={() => setStep(1)} className="w-full">
          Start Journey
        </Button>
      </div>
    </motion.div>
  );

  const renderHunt = () => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full"
    >
      <div className="text-center space-y-2 mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-[#A1A1AA]">
          Stop {currentStop.id} of {STOPS.length}
        </p>
        <h2 className="text-2xl font-semibold">{currentStop.name}</h2>
        <div className="flex items-center justify-center gap-1 text-sm text-[#A1A1AA]">
          <MapPin size={14} />
          <span>{currentStop.location}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="w-full aspect-[3/4] bg-[#09090B] border border-[#27272A] rounded-3xl relative overflow-hidden flex flex-col items-center justify-center text-[#27272A]">
          <div className="absolute inset-8 border border-[#27272A]/30 rounded-lg pointer-events-none">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[#F4F4F5]/20 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#F4F4F5]/20 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[#F4F4F5]/20 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[#F4F4F5]/20 rounded-br-lg" />
          </div>
          
          <Camera size={64} className="mb-4 opacity-20" />
          <p className="text-xs font-mono uppercase tracking-widest opacity-40">Frame Landmark</p>
          
          <div className="absolute bottom-8 px-6 text-center">
            <p className="text-sm italic text-[#A1A1AA]">{currentStop.imageHint}</p>
          </div>
        </div>

        <input 
          type="file" 
          accept="image/*" 
          capture="environment" 
          className="hidden" 
          id="camera-input"
          onChange={handleCapture}
          ref={fileInputRef}
        />
        
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="w-20 h-20 rounded-full bg-[#F4F4F5] flex items-center justify-center border-4 border-black ring-2 ring-[#F4F4F5]/30 active:scale-90 transition-transform"
        >
          <div className="w-14 h-14 rounded-full border-2 border-black/10" />
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
          className="absolute inset-0 bg-[#137fec] blur-3xl rounded-full"
        />
        <Loader2 size={48} className="animate-spin text-[#137fec] relative z-10" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-medium">Analyzing Artifact...</h3>
        <p className="text-sm text-[#A1A1AA] font-mono uppercase tracking-widest">Consulting the Void</p>
      </div>
    </div>
  );

  const renderLore = () => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full"
    >
      <div className="flex gap-4 mb-8">
        <div className="w-24 h-24 shrink-0 rounded bg-[#09090B] border border-[#27272A] overflow-hidden">
          {capturedImage && <img src={capturedImage} alt="Captured" className="w-full h-full object-cover grayscale" />}
        </div>
        <div className="flex flex-col justify-center">
          <h2 className="text-xl font-semibold">{currentStop.name}</h2>
          <p className="text-xs font-mono text-[#A1A1AA] uppercase">{currentStop.era}</p>
        </div>
      </div>

      <div className="flex-1 space-y-6">
        <p className="text-lg font-serif leading-relaxed italic text-[#F4F4F5]">
          "{lore}"
        </p>
        
        <div className="h-16 bg-[#09090B] rounded-lg border border-[#27272A] flex items-center px-4 gap-4">
          <button 
            onClick={() => {
              if (audioRef.current) {
                if (isPlaying) audioRef.current.pause();
                else audioRef.current.play();
                setIsPlaying(!isPlaying);
              }
            }}
            className="w-10 h-10 rounded-full bg-[#137fec] flex items-center justify-center text-white"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          
          <div className="flex-1 flex items-center gap-1 h-6">
            {[...Array(24)].map((_, i) => (
              <motion.div 
                key={i}
                animate={isPlaying ? { height: [4, Math.random() * 20 + 4, 4] } : { height: 4 }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.05 }}
                className={cn("w-1 rounded-full", i < 12 ? "bg-[#137fec]" : "bg-[#27272A]")}
              />
            ))}
          </div>
          
          {audioUrl && (
            <audio 
              ref={audioRef} 
              src={audioUrl} 
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
          )}
        </div>
      </div>

      <div className="mt-auto pt-8">
        <Button onClick={nextStop} variant="outline" className="w-full">
          Next Destination <ArrowRight size={18} />
        </Button>
      </div>
    </motion.div>
  );

  const renderSummary = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-8"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#137fec]/10 text-[#137fec] mb-4">
          <Sparkles size={32} />
        </div>
        <h2 className="text-3xl font-bold font-serif italic">Journey Complete</h2>
        <p className="text-[#A1A1AA]">The alchemist has woven your path into history.</p>
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-serif">{STOPS.length}</p>
            <p className="text-[10px] font-mono uppercase text-[#A1A1AA]">Stops</p>
          </div>
          <div className="border-x border-[#27272A]">
            <p className="text-2xl font-serif">45m</p>
            <p className="text-[10px] font-mono uppercase text-[#A1A1AA]">Time</p>
          </div>
          <div>
            <p className="text-2xl font-serif">2.4</p>
            <p className="text-[10px] font-mono uppercase text-[#A1A1AA]">KM</p>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <h3 className="text-sm font-mono uppercase tracking-widest text-[#A1A1AA]">Captured Memories</h3>
        <div className="grid grid-cols-2 gap-2">
          {STOPS.map((s, i) => (
            <div key={i} className="aspect-square bg-[#09090B] border border-[#27272A] rounded-lg flex items-center justify-center text-[#27272A]">
              <Camera size={24} className="opacity-20" />
            </div>
          ))}
        </div>
      </div>

      <Button onClick={() => window.location.reload()} className="w-full mt-4">
        Finish Journey <CheckCircle size={18} />
      </Button>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#000000] text-[#F4F4F5] font-sans selection:bg-[#137fec]/30">
      {/* Header */}
      <header className="h-14 border-b border-[#27272A] flex items-center justify-between px-4 sticky top-0 bg-black/80 backdrop-blur-md z-50">
        {step > 0 && step < 4 ? (
          <button 
            onClick={() => setStep(prev => (prev - 1) as any)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#09090B] border border-[#27272A]"
          >
            <ArrowLeft size={16} />
          </button>
        ) : <div className="w-8" />}
        
        <h1 className="text-lg font-semibold tracking-tight">LensLore</h1>
        
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#09090B] border border-[#27272A]">
          <User size={16} className="text-[#A1A1AA]" />
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
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#137fec]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#137fec]/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
