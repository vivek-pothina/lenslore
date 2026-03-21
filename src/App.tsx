import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  Camera,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Minus,
  CheckCircle,
  MapPin,
  Sparkles,
  Share2,
  Compass,
  Navigation,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useCompletion } from "@ai-sdk/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { themes } from "./theme";
import {
  type Vibe,
  type TransitMode,
  type JourneyConfig,
  type Itinerary,
  type StopProgress,
  type JourneyProgress,
  type NearbySpot,
  type AppStep,
  CITIES,
  MEALS,
} from "./lib/types";
import { saveToSession, loadFromSession, clearSession } from "./lib/session";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { AudioPlayer } from "@/components/audio-player";
import { CameraView } from "@/components/camera-view";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function parseJsonFromStream(text: string): Itinerary | null {
  if (!text) return null;
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  if (!cleaned.startsWith("{")) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return null;
  }
}

function stopIcon(type: string) {
  return type === "restaurant" ? "🍽️" : type === "activity" ? "⚔️" : "📍";
}

function mapsUrl(s: { coordinates: string; address: string; name: string }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${s.coordinates || encodeURIComponent(`${s.name}, ${s.address}`)}`;
}

export default function App() {
  const [step, setStep] = useState<AppStep>(
    () => loadFromSession<AppStep>("step") || "welcome"
  );
  const [config, setConfig] = useState<JourneyConfig>(
    () =>
      loadFromSession<JourneyConfig>("config") || {
        vibe: "Cyberpunk",
        city: "",
        groupSize: 1,
        numStops: 4,
        transitMode: "transit",
        meals: [],
        customPrompt: "",
      }
  );
  const [itinerary, setItinerary] = useState<Itinerary | null>(
    () => loadFromSession<Itinerary>("itinerary")
  );
  const [progress, setProgress] = useState<JourneyProgress>(
    () =>
      loadFromSession<JourneyProgress>("progress") || {
        currentStopIndex: 0,
        stopProgress: [],
        startTime: null,
        completedAt: null,
      }
  );
  const [copied, setCopied] = useState(false);
  const [explorationSpot, setExplorationSpot] = useState<NearbySpot | null>(null);
  const [explorationLore, setExplorationLore] = useState("");
  const [explorationAudioUrl, setExplorationAudioUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = themes[config.vibe];
  const stop = itinerary?.stops[progress.currentStopIndex];
  const sp = progress.stopProgress[progress.currentStopIndex];
  const isLast = itinerary
    ? progress.currentStopIndex >= itinerary.stops.length - 1
    : false;

  const sharedConfig = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("j");
    if (!p) return null;
    try {
      return JSON.parse(atob(p)) as JourneyConfig;
    } catch {
      return null;
    }
  }, []);

  useMemo(() => {
    if (sharedConfig) {
      setConfig(sharedConfig);
      setStep("planning");
      saveToSession("config", sharedConfig);
      saveToSession("step", "planning");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const geoQuery = useQuery({
    queryKey: ["geo"],
    queryFn: (): Promise<string> =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const r = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`
              );
              const d = await r.json();
              const city = d.city || d.locality || "";
              resolve(
                CITIES.find((c) =>
                  c.toLowerCase().includes(city.toLowerCase().split(" ")[0])
                ) || city || "New York City"
              );
            } catch {
              resolve("New York City");
            }
          },
          () => reject(new Error("denied")),
          { timeout: 8000 }
        );
      }),
    enabled: false,
    retry: 0,
  });

  const detectCity = useCallback(() => {
    geoQuery.refetch().then((r) => {
      if (r.data) updateConfig({ city: r.data });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    completion,
    isLoading: streaming,
    error: streamError,
    complete: completeItinerary,
  } = useCompletion({
    api: "/api/itinerary",
    streamProtocol: "text",
    onFinish: (_prompt: string, text: string) => {
      console.log("[useCompletion] onFinish, text length:", text.length);
      console.log("[useCompletion] raw text:", text.slice(0, 500));
      const parsed = parseJsonFromStream(text);
      console.log("[useCompletion] parsed:", parsed);
      if (parsed) {
        setItinerary(parsed);
        saveToSession("itinerary", parsed);
      }
    },
    onError: (err: Error) => {
      console.error("[useCompletion] error:", err);
    },
  });

  const streamedItinerary = useMemo(
    () => {
      const p = parseJsonFromStream(completion);
      if (p) console.log("[streamedItinerary] parsed stops:", p.stops?.length);
      return p;
    },
    [completion]
  );

  const generateItinerary = useCallback(() => {
    clearSession();
    setItinerary(null);
    setProgress({
      currentStopIndex: 0,
      stopProgress: [],
      startTime: null,
      completedAt: null,
    });
    saveToSession("config", config);
    completeItinerary("", { body: { ...config } });
    setStep("planning");
    saveToSession("step", "planning");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, completeItinerary]);

  const loreMutation = useMutation({
    mutationFn: async (p: { image: string; location: string }) => {
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: p.image ? p.image.split(",")[1] : "",
          vibe: config.vibe,
          location: p.location,
          groupSize: config.groupSize,
        }),
      });
      if (!r.ok) throw new Error();
      return r.json() as Promise<{ lore: string }>;
    },
    onSuccess: (data) => {
      setProgress((prev) => {
        const next = [...prev.stopProgress];
        next[prev.currentStopIndex] = {
          ...next[prev.currentStopIndex],
          lore: data.lore,
        };
        const u = { ...prev, stopProgress: next };
        saveToSession("progress", u);
        return u;
      });
      ttsMutation.mutate(data.lore);
      setStep("lore");
      saveToSession("step", "lore");
    },
    onError: () => {
      setProgress((prev) => {
        const next = [...prev.stopProgress];
        next[prev.currentStopIndex] = {
          ...next[prev.currentStopIndex],
          lore: "The artifact reveals its secrets only to the worthy. The echoes of this place linger in your memory.",
        };
        const u = { ...prev, stopProgress: next };
        saveToSession("progress", u);
        return u;
      });
      setStep("lore");
      saveToSession("step", "lore");
    },
  });

  const ttsMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error();
      return r.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      setProgress((prev) => {
        const next = [...prev.stopProgress];
        next[prev.currentStopIndex] = {
          ...next[prev.currentStopIndex],
          audioUrl: url,
        };
        const u = { ...prev, stopProgress: next };
        saveToSession("progress", u);
        return u;
      });
    },
  });

  const finalLoreMutation = useMutation({
    mutationFn: async () => {
      const images = progress.stopProgress
        .filter((s) => s.capturedImage)
        .map((s) => s.capturedImage!.split(",")[1]);
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          vibe: config.vibe,
          adventureLog: true,
          transitMode: config.transitMode,
          stops: itinerary?.stops.map((s) => ({
            name: s.name,
            description: s.description,
          })),
        }),
      });
      if (!r.ok) throw new Error();
      return r.json() as Promise<{ lore: string }>;
    },
    onSuccess: (data) => {
      saveToSession("finalLore", data.lore);
      setProgress((prev) => {
        const u = { ...prev, completedAt: Date.now() };
        saveToSession("progress", u);
        return u;
      });
    },
  });

  const updateConfig = useCallback((p: Partial<JourneyConfig>) => {
    setConfig((prev) => {
      const n = { ...prev, ...p };
      saveToSession("config", n);
      return n;
    });
  }, []);

  const handleCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !stop) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        const b64 = reader.result as string;
        setProgress((prev) => {
          const next = [...prev.stopProgress];
          next[prev.currentStopIndex] = {
            ...next[prev.currentStopIndex],
            capturedImage: b64,
            arrived: true,
          };
          const u = { ...prev, stopProgress: next };
          saveToSession("progress", u);
          return u;
        });
        setStep("analyzing");
        saveToSession("step", "analyzing");
        loreMutation.mutate({ image: b64, location: stop.name });
      };
      reader.readAsDataURL(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop]
  );

  const handleCameraCollect = useCallback(
    (image: string, lore: string) => {
      if (!stop) return;
      setProgress((prev) => {
        const next = [...prev.stopProgress];
        next[prev.currentStopIndex] = {
          ...next[prev.currentStopIndex],
          capturedImage: image,
          arrived: true,
          lore,
        };
        const u = { ...prev, stopProgress: next };
        saveToSession("progress", u);
        return u;
      });
      ttsMutation.mutate(lore);
      setStep("lore");
      saveToSession("step", "lore");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop]
  );

  const exploreLoreMutation = useMutation({
    mutationFn: async (spot: NearbySpot) => {
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vibe: config.vibe,
          location: spot.name,
          groupSize: config.groupSize,
        }),
      });
      if (!r.ok) throw new Error();
      return r.json() as Promise<{ lore: string }>;
    },
    onSuccess: (data) => {
      setExplorationLore(data.lore);
      explorationTtsMutation.mutate(data.lore);
    },
  });

  const explorationTtsMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error();
      return r.blob();
    },
    onSuccess: (blob) => {
      setExplorationAudioUrl(URL.createObjectURL(blob));
    },
  });

  const exploreSpot = useCallback(
    (spot: NearbySpot) => {
      setExplorationSpot(spot);
      setExplorationLore("");
      setExplorationAudioUrl(null);
      setStep("exploration");
      saveToSession("step", "exploration");
      exploreLoreMutation.mutate(spot);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const backFromExploration = useCallback(() => {
    setStep("lore");
    saveToSession("step", "lore");
  }, []);

  const startJourney = useCallback(() => {
    if (!itinerary) return;
    const sp: StopProgress[] = itinerary.stops.map((s) => ({
      stopId: s.id,
      arrived: false,
      capturedImage: null,
      lore: "",
      audioUrl: null,
    }));
    const u: JourneyProgress = {
      currentStopIndex: 0,
      stopProgress: sp,
      startTime: Date.now(),
      completedAt: null,
    };
    setProgress(u);
    saveToSession("progress", u);
    setStep("hunt");
    saveToSession("step", "hunt");
  }, [itinerary]);

  const nextStop = useCallback(() => {
    if (!itinerary) return;
    if (progress.currentStopIndex < itinerary.stops.length - 1) {
      setProgress((prev) => {
        const u = { ...prev, currentStopIndex: prev.currentStopIndex + 1 };
        saveToSession("progress", u);
        return u;
      });
      setStep("hunt");
      saveToSession("step", "hunt");
    } else {
      finalLoreMutation.mutate();
      setStep("log");
      saveToSession("step", "log");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary, progress.currentStopIndex]);

  const endJourney = useCallback(() => {
    finalLoreMutation.mutate();
    setStep("log");
    saveToSession("step", "log");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = useCallback(() => {
    const map: Record<AppStep, AppStep> = {
      planning: "welcome",
      preview: "welcome",
      hunt: "preview",
      analyzing: "hunt",
      lore: "hunt",
      exploration: "lore",
      log: "welcome",
      welcome: "welcome",
    };
    const to = map[step];
    setStep(to);
    saveToSession("step", to);
  }, [step]);

  const shareUrl = useMemo(() => {
    try {
      return `${window.location.origin}?j=${btoa(JSON.stringify(config))}`;
    } catch {
      return window.location.origin;
    }
  }, [config]);

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl]);

  const resetJourney = useCallback(() => {
    sessionStorage.clear();
    const fresh: JourneyConfig = {
      vibe: "Cyberpunk",
      city: "",
      groupSize: 1,
      numStops: 4,
      transitMode: "transit",
      meals: [],
      customPrompt: "",
    };
    setConfig(fresh);
    setItinerary(null);
    setProgress({
      currentStopIndex: 0,
      stopProgress: [],
      startTime: null,
      completedAt: null,
    });
    setStep("welcome");
    saveToSession("step", "welcome");
  }, []);

  const elapsed = useMemo(() => {
    if (!progress.startTime) return "0m";
    const end = progress.completedAt || Date.now();
    const m = Math.round((end - progress.startTime) / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }, [progress.startTime, progress.completedAt]);

  const parsed = streamedItinerary || itinerary;
  const finalLore = loadFromSession<string>("finalLore") || "";

  const fieldStyle = {
    backgroundColor: t.surface,
    borderColor: t.border,
    color: t.foreground,
  };

  // --- Renders ---

  const renderWelcome = () => (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col gap-8"
    >
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          Begin Your Quest
        </h2>
        <p className="text-sm" style={{ color: t.muted }}>
          Configure your urban adventure.
        </p>
      </div>

      <div className="space-y-6">
        <fieldset className="space-y-3">
          <label
            className="block text-xs font-mono uppercase tracking-widest"
            style={{ color: t.muted }}
          >
            Vibe
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["Cyberpunk", "Noir", "Fantasy", "Historical"] as Vibe[]).map(
              (v) => {
                const vt = themes[v];
                const active = config.vibe === v;
                return (
                  <button
                    key={v}
                    onClick={() => updateConfig({ vibe: v })}
                    className="h-12 rounded-lg border transition-all text-sm font-medium"
                    style={{
                      backgroundColor: active ? vt.accentLight : vt.surface,
                      borderColor: active ? vt.accent : vt.border,
                      color: active ? vt.accent : vt.muted,
                    }}
                  >
                    {v}
                  </button>
                );
              }
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <label
            className="block text-xs font-mono uppercase tracking-widest"
            style={{ color: t.muted }}
          >
            City
          </label>
          <div className="flex gap-2">
            <select
              value={config.city}
              onChange={(e) => updateConfig({ city: e.target.value })}
              className="flex-1 h-12 rounded-lg border px-4 text-sm appearance-none cursor-pointer"
              style={fieldStyle}
            >
              <option value="">Select city...</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={detectCity}
              disabled={geoQuery.isFetching}
              className="h-12 px-4 rounded-lg border text-sm font-medium transition-all flex items-center gap-2"
              style={{
                backgroundColor: t.surface,
                borderColor: t.border,
                color: t.accent,
              }}
            >
              {geoQuery.isFetching ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Navigation size={16} />
              )}
              Detect
            </button>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Group", value: config.groupSize, set: (v: number) => updateConfig({ groupSize: Math.max(1, v) }) },
            { label: "Stops", value: config.numStops, set: (v: number) => updateConfig({ numStops: Math.max(1, Math.min(10, v)) }) },
          ].map((f) => (
            <fieldset key={f.label} className="space-y-3">
              <label
                className="block text-xs font-mono uppercase tracking-widest"
                style={{ color: t.muted }}
              >
                {f.label}
              </label>
              <div
                className="flex items-center justify-between rounded-lg border p-2 h-12"
                style={fieldStyle}
              >
                <button
                  onClick={() => f.set(f.value - 1)}
                  className="w-8 h-8 flex items-center justify-center rounded border"
                  style={{
                    backgroundColor: t.background,
                    borderColor: t.border,
                    color: t.muted,
                  }}
                >
                  <Minus size={14} />
                </button>
                <span className="font-medium tabular-nums">{f.value}</span>
                <button
                  onClick={() => f.set(f.value + 1)}
                  className="w-8 h-8 flex items-center justify-center rounded border"
                  style={{
                    backgroundColor: t.background,
                    borderColor: t.border,
                    color: t.muted,
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </fieldset>
          ))}
        </div>

        <fieldset className="space-y-3">
          <label
            className="block text-xs font-mono uppercase tracking-widest"
            style={{ color: t.muted }}
          >
            Travel Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["transit", "car"] as TransitMode[]).map((m) => (
              <button
                key={m}
                onClick={() => updateConfig({ transitMode: m })}
                className="h-12 rounded-lg border transition-all text-sm font-medium"
                style={{
                  backgroundColor:
                    config.transitMode === m ? t.accentLight : t.surface,
                  borderColor:
                    config.transitMode === m ? t.accent : t.border,
                  color: config.transitMode === m ? t.accent : t.muted,
                }}
              >
                {m === "transit" ? "🚇 Transit" : "🚗 Car"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <label
            className="block text-xs font-mono uppercase tracking-widest"
            style={{ color: t.muted }}
          >
            Fuel Up
          </label>
          <div className="flex flex-wrap gap-2">
            {MEALS.map((m) => {
              const active = config.meals.includes(m.value);
              return (
                <button
                  key={m.value}
                  onClick={() =>
                    updateConfig({
                      meals: active
                        ? config.meals.filter((x) => x !== m.value)
                        : [...config.meals, m.value],
                    })
                  }
                  className="h-10 px-4 rounded-lg border transition-all text-sm font-medium"
                  style={{
                    backgroundColor: active ? t.accentLight : t.surface,
                    borderColor: active ? t.accent : t.border,
                    color: active ? t.accent : t.muted,
                  }}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <label
            className="block text-xs font-mono uppercase tracking-widest"
            style={{ color: t.muted }}
          >
            Match My Vibe
          </label>
          <input
            type="text"
            value={config.customPrompt}
            onChange={(e) => updateConfig({ customPrompt: e.target.value })}
            placeholder="plan my adventure for today"
            className="w-full h-12 rounded-lg border px-4 text-sm placeholder:opacity-40"
            style={fieldStyle}
          />
        </fieldset>
      </div>

      <div className="mt-auto pt-4">
        <button
          onClick={generateItinerary}
          disabled={!config.city}
          className="w-full h-12 rounded-lg font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40"
          style={{
            backgroundColor: t.accent,
            color: "#fff",
            boxShadow: `0 0 20px ${t.accentGlow}`,
          }}
        >
          Forge My Path <Compass size={18} />
        </button>
      </div>
    </motion.div>
  );

  const VIBE_LOADING = {
    Cyberpunk: { title: "Channeling the void...", subtitle: "Data streams converging" },
    Noir: { title: "Reading between the lines...", subtitle: "The city reveals its secrets" },
    Fantasy: { title: "Consulting the ancient tomes...", subtitle: "Arcane knowledge takes form" },
    Historical: { title: "Consulting the archives...", subtitle: "Records are being unearthed" },
  } as const;

  const renderVibeLoading = (status: string, snippet?: string) => {
    const vl = VIBE_LOADING[config.vibe];

    const indicator = (
      <div className="flex items-center gap-3">
        <div className="relative">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="size-3 rounded-full"
            style={{ backgroundColor: t.accent, boxShadow: `0 0 12px ${t.accentGlow}` }}
          />
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: t.accent }}>{status}</p>
          <p className="text-xs" style={{ color: t.muted }}>{vl.subtitle}</p>
        </div>
      </div>
    );

    if (snippet) {
      return (
        <div className="space-y-6">
          {indicator}
          {renderStreamingDisplay(snippet)}
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest justify-center" style={{ color: t.muted }}>
            <Loader2 size={12} className="animate-spin" />
            <span>{snippet.length} chars received</span>
          </div>
        </div>
      );
    }

    if (config.vibe === "Noir") {
      return (
        <div className="flex flex-col items-center justify-center gap-6 py-8">
          <div className="relative">
            <div className="size-16 rounded-full border-2 flex items-center justify-center" style={{ borderColor: "#444" }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="size-8 rounded-full border-2 border-t-transparent"
                style={{ borderColor: "#d4a853", borderTopColor: "transparent" }}
              />
            </div>
            <div className="absolute inset-0 rounded-full" style={{ boxShadow: "0 0 20px rgba(212,168,83,0.1)" }} />
          </div>
          {indicator}
        </div>
      );
    }

    if (config.vibe === "Fantasy") {
      return (
        <div className="flex flex-col items-center justify-center gap-6 py-8">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="relative"
          >
            <Sparkles size={40} style={{ color: t.accent }} />
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 blur-2xl rounded-full"
              style={{ backgroundColor: t.accent }}
            />
          </motion.div>
          {indicator}
        </div>
      );
    }

    if (config.vibe === "Historical") {
      return (
        <div className="flex flex-col items-center justify-center gap-6 py-8">
          <div className="relative">
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Loader2 size={40} className="animate-spin" style={{ color: t.accent }} />
            </motion.div>
          </div>
          {indicator}
        </div>
      );
    }

    // Cyberpunk default
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-8">
        <div className="relative">
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 blur-3xl rounded-full"
            style={{ backgroundColor: t.accent }}
          />
          <Loader2 size={48} className="animate-spin relative z-10" style={{ color: t.accent }} />
        </div>
        {indicator}
      </div>
    );
  };

  const renderStreamingDisplay = (snippet: string) => {
    const cursor = (
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity }}
        className="inline-block w-2 h-4 ml-0.5 align-middle"
        style={{ backgroundColor: t.accent }}
      />
    );

    if (config.vibe === "Noir") {
      const noirCursor = (
        <span
          className="inline-block w-2 h-4 ml-0.5 align-middle"
          style={{
            backgroundColor: "#d4d4d4",
            boxShadow: "0 0 6px rgba(212,212,212,0.4)",
          }}
        >
          <motion.span
            className="block w-full h-full"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            style={{ backgroundColor: "#d4d4d4" }}
          />
        </span>
      );
      return (
        <div
          className="rounded-xl overflow-hidden relative"
          style={{
            backgroundColor: "#0a0a0a",
            border: "2px solid #333",
            boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.3)",
          }}
        >
          <div className="absolute inset-0 pointer-events-none z-10">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
              }}
            />
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(transparent 50%, rgba(255,255,255,0.02) 50%)",
                backgroundSize: "100% 4px",
              }}
              animate={{ backgroundPositionY: ["0px", "4px"] }}
              transition={{ duration: 0.1, repeat: Infinity }}
            />
          </div>
          <div
            className="absolute inset-0 pointer-events-none z-10 rounded-xl"
            style={{
              boxShadow: "inset 0 0 80px 20px rgba(0,0,0,0.4)",
              borderRadius: "inherit",
            }}
          />
          <div className="p-5 font-mono text-xs leading-relaxed max-h-[50vh] overflow-y-auto relative z-0">
            <div
              className="text-[10px] mb-3 tracking-widest uppercase"
              style={{ color: "#666" }}
            >
              INTERCEPTING SIGNAL...
            </div>
            <pre
              className="whitespace-pre-wrap break-words"
              style={{
                color: "#d4d4d4",
                textShadow: "0 0 8px rgba(212,168,83,0.15)",
              }}
            >
              {snippet}
            </pre>
            {noirCursor}
          </div>
        </div>
      );
    }

    if (config.vibe === "Fantasy") {
      return (
        <div
          className="rounded-xl overflow-hidden relative"
          style={{
            backgroundColor: "#1a1520",
            border: "2px solid #3d2f50",
            boxShadow: "0 0 30px rgba(168,85,247,0.08)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23a855f7' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div
            className="flex items-center gap-2 px-4 py-2 border-b"
            style={{ borderColor: "#3d2f50" }}
          >
            <Sparkles size={12} style={{ color: "#a855f7" }} />
            <span
              className="text-[10px] font-serif italic"
              style={{ color: "#9b8ec4" }}
            >
              The enchanted quill writes...
            </span>
          </div>
          <div className="p-5 max-h-[50vh] overflow-y-auto relative">
            <pre
              className="whitespace-pre-wrap break-words font-serif text-sm leading-relaxed italic"
              style={{ color: "#e8e0f0" }}
            >
              {snippet}
            </pre>
            <span
              className="inline-block w-1.5 h-5 ml-0.5 align-middle rounded-full"
              style={{
                backgroundColor: "#a855f7",
                animation: "blink 0.8s step-end infinite",
                boxShadow: "0 0 8px rgba(168,85,247,0.5)",
              }}
            />
          </div>
          <div
            className="h-1"
            style={{
              background:
                "linear-gradient(90deg, transparent, #a855f740, transparent)",
            }}
          />
        </div>
      );
    }

    if (config.vibe === "Historical") {
      return (
        <div
          className="rounded-lg overflow-hidden relative"
          style={{
            backgroundColor: "#1a170f",
            border: "1px solid #3d3520",
            boxShadow: "inset 0 0 40px rgba(0,0,0,0.3)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%23d97706' fill-opacity='1' d='M1 3h1v1H1V3zm2-2h1v1H3V1z'%3E%3C/path%3E%3C/svg%3E")`,
            }}
          />
          <div
            className="flex items-center justify-between px-4 py-2 border-b"
            style={{ borderColor: "#3d352020" }}
          >
            <span
              className="text-[10px] font-mono uppercase tracking-[0.2em]"
              style={{ color: "#b8a88a" }}
            >
              Telegram
            </span>
            <span
              className="text-[10px] font-mono tabular-nums"
              style={{ color: "#b8a88a60" }}
            >
              {new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="p-5 max-h-[50vh] overflow-y-auto">
            <div
              className="text-[10px] font-mono uppercase tracking-widest mb-3 pb-2"
              style={{
                color: "#d97706",
                borderBottom: "1px dashed #3d352030",
              }}
            >
              URGENT DISPATCH — STOP —
            </div>
            <pre
              className="whitespace-pre-wrap break-words font-serif text-sm leading-relaxed"
              style={{ color: "#f0e6d0" }}
            >
              {snippet}
            </pre>
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="inline-block w-1.5 h-4 ml-0.5 align-middle"
              style={{ backgroundColor: "#d97706" }}
            />
          </div>
          <div
            className="px-4 py-2 border-t flex items-center justify-between"
            style={{ borderColor: "#3d352020" }}
          >
            <span className="text-[9px] font-mono" style={{ color: "#b8a88a40" }}>
              CLASSIFIED
            </span>
            <div
              className="size-6 rounded-full border flex items-center justify-center"
              style={{ borderColor: "#d9770640" }}
            >
              <span
                className="text-[8px] font-bold"
                style={{ color: "#d9770660" }}
              >
                UA
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Cyberpunk (default)
    return (
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#0a0a0f", borderColor: t.border }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2 border-b"
          style={{ borderColor: t.border }}
        >
          <div className="flex gap-1.5">
            <div className="size-2 rounded-full bg-red-500/60" />
            <div className="size-2 rounded-full bg-yellow-500/60" />
            <div className="size-2 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[10px] font-mono uppercase" style={{ color: t.muted }}>
            oracle.stream
          </span>
        </div>
        <div className="p-4 font-mono text-xs leading-relaxed max-h-[50vh] overflow-y-auto">
          <pre
            className="whitespace-pre-wrap break-words"
            style={{ color: `${t.foreground}cc` }}
          >
            {snippet}
          </pre>
          {cursor}
        </div>
      </div>
    );
  };

  const renderPlanning = () => {
    const hasContent = parsed && (parsed.title || parsed.summary || parsed.stops?.length);
    const isThinking = streaming && !hasContent && completion.length > 0;
    const showSpinner = streaming && !hasContent && !isThinking;
    const showContent = hasContent;

    const streamingSnippet = completion.length > 0 ? completion.slice(-400) : "";

    return (
      <motion.div
        key="planning"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex flex-col gap-8"
      >
        {showSpinner && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6">
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 blur-3xl rounded-full"
                style={{ backgroundColor: t.accent }}
              />
              <Compass
                size={48}
                className="relative z-10 animate-spin"
                style={{ color: t.accent }}
              />
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-medium" style={{ color: t.accent }}>
                Consulting the Oracle...
              </p>
              <p className="text-sm font-mono uppercase" style={{ color: t.muted }}>
                Forging your path
              </p>
            </div>
          </div>
        )}

        {isThinking && (
          <div className="pt-4">
            {renderVibeLoading(
              config.vibe === "Cyberpunk"
                ? "The Oracle is speaking..."
                : config.vibe === "Noir"
                  ? "Intercepting transmissions..."
                  : config.vibe === "Fantasy"
                    ? "The enchanted quill stirs..."
                    : "The telegraph arrives...",
              streamingSnippet
            )}
          </div>
        )}

        {streamError && (
          <div className="rounded-lg border p-4" style={{ backgroundColor: "#2a0a0a", borderColor: "#ff4444" }}>
            <p className="text-sm text-red-400 break-words">{streamError.message}</p>
          </div>
        )}

        {showContent && (
          <>
            <div className="text-center space-y-2 pt-4">
              {streaming && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Loader2 size={14} className="animate-spin" style={{ color: t.accent }} />
                  <span className="text-xs font-mono uppercase" style={{ color: t.muted }}>
                    Channeling...
                  </span>
                </div>
              )}
              {!streaming && (
                <Sparkles size={24} className="mx-auto" style={{ color: t.accent }} />
              )}
              <h2
                className="text-2xl font-bold font-serif italic"
                style={{ color: t.accent }}
              >
                {parsed.title}
              </h2>
              {parsed.summary && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm italic"
                  style={{ color: t.muted }}
                >
                  {parsed.summary}
                </motion.p>
              )}
            </div>

            {parsed.stops && parsed.stops.length > 0 && (
              <div className="space-y-3">
                <div
                  className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest"
                  style={{ color: t.muted }}
                >
                  <span>Stops</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: t.border }} />
                  <span>{parsed.stops.length}</span>
                </div>
                <AnimatePresence>
                  {parsed.stops.map((s, i) => (
                    <motion.div
                      key={s.id || i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="rounded-lg border p-4"
                      style={{ backgroundColor: t.surface, borderColor: t.border }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-lg mt-0.5">{stopIcon(s.type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{s.name}</p>
                          {s.description && (
                            <p
                              className="text-xs mt-1 line-clamp-2"
                              style={{ color: t.muted }}
                            >
                              {s.description}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[10px] font-mono uppercase shrink-0 mt-1 px-2 py-0.5 rounded"
                          style={{ backgroundColor: t.accentLight, color: t.accent }}
                        >
                          {s.type}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {!streaming && parsed.stops.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3 pt-2"
              >
                <button
                  onClick={handleShare}
                  className="w-full h-12 rounded-lg border font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  style={fieldStyle}
                >
                  <Share2 size={16} />
                  {copied ? "Link Copied!" : "Share Quest Link"}
                </button>
                <button
                  onClick={startJourney}
                  className="w-full h-12 rounded-lg font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: t.accent,
                    color: "#fff",
                    boxShadow: `0 0 20px ${t.accentGlow}`,
                  }}
                >
                  Begin Adventure <ArrowRight size={18} />
                </button>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    );
  };

  const renderHunt = () => {
    if (!stop || !itinerary) return null;
    return (
      <motion.div
        key="hunt"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full"
      >
        <div className="text-center space-y-2 mb-6">
          <p
            className="text-xs font-mono uppercase tracking-widest"
            style={{ color: t.muted }}
          >
            Stop {progress.currentStopIndex + 1} of{" "}
            {itinerary.stops.length}
          </p>
          <h2 className="text-2xl font-semibold">{stop.name}</h2>
          <div
            className="flex items-center justify-center gap-1 text-sm"
            style={{ color: t.muted }}
          >
            <MapPin size={14} />
            <span>{stop.address}</span>
          </div>
        </div>

        <div className="mb-6">
          <div
            className="flex justify-between text-xs mb-2"
            style={{ color: t.muted }}
          >
            <span>Quest Progress</span>
            <span>
              {progress.currentStopIndex + 1}/{itinerary.stops.length}
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: t.border }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: t.accent }}
              initial={{ width: 0 }}
              animate={{
                width: `${((progress.currentStopIndex + 1) / itinerary.stops.length) * 100}%`,
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <div
          className="rounded-xl border p-5 mb-6"
          style={{ backgroundColor: t.surface, borderColor: t.border }}
        >
          <p
            className="text-sm italic leading-relaxed mb-3"
            style={{ color: t.muted }}
          >
            &ldquo;{stop.description}&rdquo;
          </p>
          <a
            href={mapsUrl(stop)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium no-underline"
            style={{ color: t.accent }}
          >
            <Navigation size={14} />
            Open in Maps
          </a>
        </div>

        <CameraView
          vibe={config.vibe}
          theme={t}
          stopName={stop.name}
          stopAddress={stop.address}
          onCollect={handleCameraCollect}
        />
      </motion.div>
    );
  };

  const renderAnalyzing = () => (
    <div key="analyzing" className="flex-1 flex flex-col items-center justify-center">
      {renderVibeLoading(`Decoding ${stop?.name || "the artifact"}...`)}
    </div>
  );

  const renderLore = () => {
    if (!stop) return null;
    return (
      <motion.div
        key="lore"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full"
      >
        <div className="flex gap-4 mb-6">
          <div
            className="w-24 h-24 shrink-0 rounded overflow-hidden border"
            style={{ borderColor: t.border }}
          >
            {sp?.capturedImage ? (
              <img
                src={sp.capturedImage}
                alt="Captured"
                className="w-full h-full object-cover grayscale"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: t.surface }}
              >
                <Camera
                  size={24}
                  style={{ color: t.muted, opacity: 0.3 }}
                />
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="text-xl font-semibold">{stop.name}</h2>
            <p
              className="text-xs font-mono uppercase"
              style={{ color: t.accent }}
            >
              {stopIcon(stop.type)} {stop.type}
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-6">
          <p className="text-lg font-serif leading-relaxed italic">
            &ldquo;{sp?.lore || "The oracle speaks..."}&rdquo;
          </p>

          {ttsMutation.isPending && !sp?.audioUrl && (
            <div
              className="rounded-xl border p-4 flex items-center gap-4"
              style={{ backgroundColor: "rgba(9,9,11,0.6)", borderColor: t.border }}
            >
              <div
                className="size-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: t.accentLight }}
              >
                <Loader2 size={16} className="animate-spin" style={{ color: t.accent }} />
              </div>
              <div className="flex-1 space-y-2">
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: t.border }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${t.accent}40, transparent)`,
                      width: "60%",
                    }}
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-mono" style={{ color: t.muted }}>
                    Conjouring voice...
                  </span>
                  <span className="text-[10px] font-mono tabular-nums" style={{ color: t.accent, opacity: 0.5 }}>
                    0:00
                  </span>
                </div>
              </div>
            </div>
          )}

          {sp?.audioUrl && (
            <AudioPlayer
              src={sp.audioUrl}
              accent={t.accent}
              border={t.border}
            />
          )}

          {stop.nearbySpots && stop.nearbySpots.length > 0 && (
            <Collapsible className="pt-2">
              <CollapsibleTrigger
                className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest w-full py-2"
                style={{ color: t.muted }}
              >
                <ChevronRight size={12} className="transition-transform [[data-open]>&]:rotate-90" />
                Explore Nearby ({stop.nearbySpots.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0">
                {stop.nearbySpots.map((spot, i) => (
                  <motion.div
                    key={spot.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <button
                      onClick={() => exploreSpot(spot)}
                      className="w-full text-left rounded-lg border p-3 transition-all active:scale-[0.99]"
                      style={{
                        backgroundColor: t.surface,
                        borderColor: t.border,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base">{stopIcon(spot.type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{spot.name}</p>
                          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: t.muted }}>
                            {spot.shortDescription}
                          </p>
                        </div>
                        <ChevronRight size={14} className="shrink-0" style={{ color: t.muted }} />
                      </div>
                    </button>
                  </motion.div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        {!isLast && itinerary && (
          <div
            className="mb-4 p-4 rounded-lg border"
            style={{ backgroundColor: t.surface, borderColor: t.border }}
          >
            <div
              className="flex items-center gap-2 text-sm mb-2"
              style={{ color: t.muted }}
            >
              <MapPin size={14} />
              <span>Next Destination</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {itinerary.stops[progress.currentStopIndex + 1]?.name}
                </p>
                <p className="text-xs" style={{ color: t.muted }}>
                  {
                    itinerary.stops[progress.currentStopIndex + 1]
                      ?.address
                  }
                </p>
              </div>
              <a
                href={mapsUrl(
                  itinerary.stops[progress.currentStopIndex + 1]
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline no-underline"
                style={{ color: t.accent }}
              >
                Navigate
              </a>
            </div>
          </div>
        )}

        <div className="mt-auto pt-2 space-y-2">
          <button
            onClick={nextStop}
            className="w-full h-12 rounded-lg font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{
              backgroundColor: t.accent,
              color: "#fff",
              boxShadow: `0 0 20px ${t.accentGlow}`,
            }}
          >
            {isLast ? (
              <>
                Complete Journey <Sparkles size={18} />
              </>
            ) : (
              <>
                Next Destination <ArrowRight size={18} />
              </>
            )}
          </button>
          <button
            onClick={endJourney}
            className="w-full h-10 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
            style={{ color: t.muted }}
          >
            End Journey Early
          </button>
        </div>
      </motion.div>
    );
  };

  const renderExploration = () => {
    if (!explorationSpot) return null;
    return (
      <motion.div
        key="exploration"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full"
      >
        <div className="flex gap-4 mb-6">
          <div
            className="w-24 h-24 shrink-0 rounded overflow-hidden border flex items-center justify-center text-3xl"
            style={{ backgroundColor: t.surface, borderColor: t.border }}
          >
            {stopIcon(explorationSpot.type)}
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="text-xl font-semibold">{explorationSpot.name}</h2>
            <p className="text-xs font-mono uppercase" style={{ color: t.accent }}>
              {stopIcon(explorationSpot.type)} {explorationSpot.type}
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-6">
          {!explorationLore && exploreLoreMutation.isPending && (
            <div className="py-4">
              {renderVibeLoading("Unearthing secrets...")}
            </div>
          )}

          {explorationLore && (
            <p className="text-lg font-serif leading-relaxed italic">
              &ldquo;{explorationLore}&rdquo;
            </p>
          )}

          {explorationTtsMutation.isPending && !explorationAudioUrl && explorationLore && (
            <div
              className="rounded-xl border p-4 flex items-center gap-4"
              style={{ backgroundColor: "rgba(9,9,11,0.6)", borderColor: t.border }}
            >
              <div
                className="size-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: t.accentLight }}
              >
                <Loader2 size={16} className="animate-spin" style={{ color: t.accent }} />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: t.border }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${t.accent}40, transparent)`,
                      width: "60%",
                    }}
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                <span className="text-[10px] font-mono" style={{ color: t.muted }}>
                  Conjouring voice...
                </span>
              </div>
            </div>
          )}

          {explorationAudioUrl && (
            <AudioPlayer
              src={explorationAudioUrl}
              accent={t.accent}
              border={t.border}
            />
          )}
        </div>

        <div className="mt-auto pt-2 space-y-2">
          <a
            href={mapsUrl({
              coordinates: "",
              address: explorationSpot.name,
              name: explorationSpot.name,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 rounded-lg border font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2 no-underline"
            style={{
              backgroundColor: t.surface,
              borderColor: t.accent,
              color: t.accent,
            }}
          >
            <Navigation size={18} />
            Navigate Here
          </a>
          <button
            onClick={backFromExploration}
            className="w-full h-12 rounded-lg font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{
              backgroundColor: t.accent,
              color: "#fff",
              boxShadow: `0 0 20px ${t.accentGlow}`,
            }}
          >
            <ArrowLeft size={18} />
            Back to {stop?.name || "Quest"}
          </button>
        </div>
      </motion.div>
    );
  };

  const renderLog = () => (
    <motion.div
      key="log"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-6"
    >
      <div className="text-center space-y-2">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
          style={{ backgroundColor: t.accentLight, color: t.accent }}
        >
          <Sparkles size={32} />
        </div>
        <h2 className="text-3xl font-bold font-serif italic">
          Adventure Complete
        </h2>
        <p style={{ color: t.muted }}>
          {itinerary?.title || "Your quest has been chronicled."}
        </p>
      </div>

      <div
        className="rounded-xl border p-6"
        style={{ backgroundColor: t.surface, borderColor: t.border }}
      >
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-serif">
              {itinerary?.stops.length || 0}
            </p>
            <p
              className="text-[10px] font-mono uppercase"
              style={{ color: t.muted }}
            >
              Stops
            </p>
          </div>
          <div
            className="border-x"
            style={{ borderColor: t.border }}
          >
            <p className="text-2xl font-serif">{elapsed}</p>
            <p
              className="text-[10px] font-mono uppercase"
              style={{ color: t.muted }}
            >
              Time
            </p>
          </div>
          <div>
            <p className="text-2xl font-serif">
              {progress.stopProgress.filter((s) => s.arrived).length}
            </p>
            <p
              className="text-[10px] font-mono uppercase"
              style={{ color: t.muted }}
            >
              Conquered
            </p>
          </div>
        </div>
      </div>

      {progress.stopProgress.some((s) => s.capturedImage) && (
        <div className="space-y-3">
          <h3
            className="text-sm font-mono uppercase tracking-widest"
            style={{ color: t.muted }}
          >
            Captured Artifacts
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {progress.stopProgress.map(
              (sp, i) =>
                sp.capturedImage && (
                  <div
                    key={i}
                    className="aspect-square rounded-lg overflow-hidden border"
                    style={{ borderColor: t.border }}
                  >
                    <img
                      src={sp.capturedImage}
                      alt={itinerary?.stops[i]?.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )
            )}
          </div>
        </div>
      )}

      {finalLore && (
        <div className="space-y-3">
          <h3
            className="text-sm font-mono uppercase tracking-widest"
            style={{ color: t.muted }}
          >
            The Chronicle
          </h3>
          <div
            className="rounded-xl border p-5"
            style={{ backgroundColor: t.surface, borderColor: t.border }}
          >
            <p className="text-base font-serif leading-relaxed italic whitespace-pre-line">
              {finalLore}
            </p>
          </div>
        </div>
      )}

      {finalLoreMutation.isPending && !finalLore && (
        <div className="py-4">
          {renderVibeLoading("Inscribing your legend...")}
        </div>
      )}

      <button
        onClick={handleShare}
        className="w-full h-12 rounded-lg border font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        style={fieldStyle}
      >
        <Share2 size={16} />
        {copied ? "Link Copied!" : "Share Adventure"}
      </button>

      <button
        onClick={resetJourney}
        className="w-full h-12 rounded-lg font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        style={{
          backgroundColor: t.accent,
          color: "#fff",
          boxShadow: `0 0 20px ${t.accentGlow}`,
        }}
      >
        New Quest <Compass size={18} />
      </button>
    </motion.div>
  );

  return (
    <div
      className="min-h-screen font-sans"
      style={{ backgroundColor: t.background, color: t.foreground }}
    >
      <header
        className="h-14 border-b flex items-center justify-between px-4 sticky top-0 z-50"
        style={{
          borderColor: t.border,
          backgroundColor: `${t.background}cc`,
          backdropFilter: "blur(12px)",
        }}
      >
        {step !== "welcome" ? (
          <button
            onClick={goBack}
            className="w-8 h-8 flex items-center justify-center rounded-full border"
            style={{ backgroundColor: t.surface, borderColor: t.border }}
          >
            <ArrowLeft size={16} />
          </button>
        ) : (
          <div className="w-8" />
        )}
        <h1
          className="text-lg font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-newsreader)" }}
        >
          LensLore
        </h1>
        <div className="w-8" />
      </header>

      <main className="max-w-[450px] mx-auto px-6 py-8 h-[calc(100vh-3.5rem)] overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === "welcome" && renderWelcome()}
          {step === "planning" && renderPlanning()}
          {step === "hunt" && renderHunt()}
          {step === "analyzing" && renderAnalyzing()}
          {step === "lore" && renderLore()}
          {step === "exploration" && renderExploration()}
          {step === "log" && renderLog()}
        </AnimatePresence>
      </main>

      <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1]">
        <div
          className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full"
          style={{ backgroundColor: t.glowColor }}
        />
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full"
          style={{ backgroundColor: t.glowColor }}
        />
      </div>
    </div>
  );
}
