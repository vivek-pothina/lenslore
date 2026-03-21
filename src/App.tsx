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
  Volume2,
  Eye,
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
  type RouteHighlight,
  type NarrationSnippet,
  CITIES,
  MEALS,
} from "./lib/types";
import { saveToSession, loadFromSession, clearSession } from "./lib/session";
import { calculateDistance } from "./lib/geo";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { AudioPlayer } from "@/components/audio-player";

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

function highlightIcon(type: string) {
  switch (type) {
    case "monument": return "🏛️";
    case "statue": return "🗿";
    case "mural": return "🎨";
    case "park": return "🌳";
    case "building": return "🏢";
    default: return "📍";
  }
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
  const [discoveredSecrets, setDiscoveredSecrets] = useState<string[]>(
    () => loadFromSession<string[]>("discoveredSecrets") || []
  );
  const [activeSecret, setActiveSecret] = useState<{
    name: string;
    loreSnippet: string;
    lookDirection: string;
    audioUrl?: string;
  } | null>(() => loadFromSession("activeSecret") || null);

  // Guided tour state
  const [activeHighlight, setActiveHighlight] = useState<{
    name: string;
    type: string;
    narration: NarrationSnippet;
    audioUrl?: string;
  } | null>(() => loadFromSession("activeHighlight") || null);
  const [discoveredHighlights, setDiscoveredHighlights] = useState<string[]>(
    () => loadFromSession<string[]>("discoveredHighlights") || []
  );
  const [lastHighlightTimestamp, setLastHighlightTimestamp] = useState<number>(0);
  const [arrivalNotification, setArrivalNotification] = useState<string | null>(null);
  const [isStopArrived, setIsStopArrived] = useState(false);

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
    mutationFn: async (p: { images: string[]; location: string }) => {
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: p.images,
          vibe: config.vibe,
          location: p.location,
          groupSize: config.groupSize,
        }),
      });
      if (!r.ok) throw new Error();
      return r.json() as Promise<{ lore: string }>;
    },
    onSuccess: (data) => {
      if (data.lore === "INVALID_LOCATION") {
        alert("The Oracle is confused. This doesn't look like the right place. Please try again.");
        setProgress((prev) => {
          const next = [...prev.stopProgress];
          next[prev.currentStopIndex] = { ...next[prev.currentStopIndex], capturedImage: null, arrived: false };
          return { ...prev, stopProgress: next };
        });
        setStep("hunt");
        saveToSession("step", "hunt");
        return;
      }
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

  const secretTtsMutation = useMutation({
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
      setActiveSecret((prev) => {
        if (!prev) return null;
        const next = { ...prev, audioUrl: url };
        saveToSession("activeSecret", next);
        return next;
      });
    },
  });

  // Highlight TTS mutation
  const highlightTtsMutation = useMutation({
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
      setActiveHighlight((prev) => {
        if (!prev) return null;
        const next = { ...prev, audioUrl: url };
        saveToSession("activeHighlight", next);
        return next;
      });
    },
  });

  // Main GPS geofencing effect - handles stop auto-arrival AND route highlights
  React.useEffect(() => {
    if (step !== "hunt" || !itinerary) return;

    const isWalking = config.transitMode === "transit";
    const highlightRadius = isWalking ? 50 : 100; // meters
    const stopRadius = isWalking ? 80 : 150; // meters
    const rateLimitMs = 60000; // 1 highlight per minute

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLon = pos.coords.longitude;

        // 1. Check main stop auto-arrival
        if (stop && !isStopArrived) {
          const [stopLat, stopLon] = stop.coordinates.split(",").map(Number);
          if (!isNaN(stopLat) && !isNaN(stopLon)) {
            const stopDistance = calculateDistance(userLat, userLon, stopLat, stopLon);
            if (stopDistance < stopRadius) {
              setIsStopArrived(true);
              setArrivalNotification(stop.name);
              saveToSession("isStopArrived", true);
              // Auto-dismiss arrival notification after 4 seconds
              setTimeout(() => setArrivalNotification(null), 4000);
            }
          }
        }

        // 2. Check route highlights (new system)
        if (itinerary.routeHighlights && !activeHighlight) {
          const now = Date.now();
          if (now - lastHighlightTimestamp > rateLimitMs) {
            for (const highlight of itinerary.routeHighlights) {
              if (discoveredHighlights.includes(highlight.name)) continue;
              if (activeSecret) break; // Don't interrupt active secret

              const [hLat, hLon] = highlight.coordinates.split(",").map(Number);
              if (isNaN(hLat) || isNaN(hLon)) continue;

              const distance = calculateDistance(userLat, userLon, hLat, hLon);
              if (distance < highlightRadius) {
                setDiscoveredHighlights(prev => {
                  const next = [...prev, highlight.name];
                  saveToSession("discoveredHighlights", next);
                  return next;
                });
                setLastHighlightTimestamp(now);

                const hData = {
                  name: highlight.name,
                  type: highlight.type,
                  narration: highlight.narration,
                };
                setActiveHighlight(hData);
                saveToSession("activeHighlight", hData);
                highlightTtsMutation.mutate(highlight.narration.script);
                break; // Only trigger one at a time
              }
            }
          }
        }

        // 3. Legacy routeSecrets support (backward compatibility)
        if (itinerary.routeSecrets && !activeSecret && !activeHighlight) {
          for (const secret of itinerary.routeSecrets) {
            if (discoveredSecrets.includes(secret.name)) continue;

            const [sLat, sLon] = secret.coordinates.split(",").map(Number);
            if (isNaN(sLat) || isNaN(sLon)) continue;

            const distance = calculateDistance(userLat, userLon, sLat, sLon);
            if (distance < 50) {
              setDiscoveredSecrets(prev => {
                const next = [...prev, secret.name];
                saveToSession("discoveredSecrets", next);
                return next;
              });
              const sData = { name: secret.name, loreSnippet: secret.loreSnippet, lookDirection: secret.lookDirection };
              setActiveSecret(sData);
              saveToSession("activeSecret", sData);
              secretTtsMutation.mutate(secret.loreSnippet);
              break;
            }
          }
        }
      },
      (err) => console.warn("GPS watch err:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [step, itinerary, stop, config.transitMode, discoveredSecrets, activeSecret, discoveredHighlights, activeHighlight, lastHighlightTimestamp, isStopArrived, secretTtsMutation, highlightTtsMutation]);

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
      const files = Array.from(e.target.files || []).slice(0, 3);
      if (files.length === 0 || !stop) return;
      const base64Promises = files.map(file => {
         return new Promise<string>((resolve) => {
           const reader = new FileReader();
           reader.onloadend = () => resolve(reader.result as string);
           reader.readAsDataURL(file);
         });
      });
      Promise.all(base64Promises).then(b64Array => {
        const b64 = b64Array[0];
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
        loreMutation.mutate({ images: b64Array.map(b => b.split(",")[1]), location: stop.name });
      });
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
    },
  });

  const exploreSpot = useCallback(
    (spot: NearbySpot) => {
      setExplorationSpot(spot);
      setExplorationLore("");
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
    setIsStopArrived(false);
    saveToSession("isStopArrived", false);
    setDiscoveredHighlights([]);
    saveToSession("discoveredHighlights", []);
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
      setIsStopArrived(false);
      saveToSession("isStopArrived", false);
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
      narration: "hunt",
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
    setIsStopArrived(false);
    setDiscoveredHighlights([]);
    setActiveHighlight(null);
    setDiscoveredSecrets([]);
    setActiveSecret(null);
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
          <div className="space-y-6 pt-4">
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
                <p className="text-sm font-medium" style={{ color: t.accent }}>
                  The Oracle is speaking...
                </p>
                <p className="text-xs" style={{ color: t.muted }}>
                  Manifesting your adventure
                </p>
              </div>
            </div>

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
                  {streamingSnippet}
                </pre>
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  className="inline-block w-2 h-4 ml-0.5 align-middle"
                  style={{ backgroundColor: t.accent }}
                />
              </div>
            </div>

            <div
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest justify-center"
              style={{ color: t.muted }}
            >
              <Loader2 size={12} className="animate-spin" />
              <span>{completion.length} chars received</span>
            </div>
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

        {/* GPS Arrival indicator */}
        {isStopArrived && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border p-4 mb-6 flex items-center gap-3"
            style={{ backgroundColor: t.accentLight + '20', borderColor: t.accent }}
          >
            <CheckCircle size={20} style={{ color: t.accent }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: t.accent }}>
                You&apos;ve arrived!
              </p>
              <p className="text-xs" style={{ color: t.muted }}>
                GPS confirms you&apos;re at this location
              </p>
            </div>
          </motion.div>
        )}

        {/* Narration button (when stop has pre-generated narration) */}
        {stop.narration && (
          <button
            onClick={() => {
              setStep("lore");
              saveToSession("step", "lore");
              if (stop.narration?.script) {
                ttsMutation.mutate(stop.narration.script);
              }
            }}
            className="w-full h-12 rounded-lg font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2 border mb-6"
            style={{
              backgroundColor: t.surface,
              borderColor: t.accent,
              color: t.accent,
            }}
          >
            <Volume2 size={16} />
            {stop.narration.lookDirection
              ? `View Narration — Look ${stop.narration.lookDirection.toUpperCase()}`
              : "View Narration"}
          </button>
        )}

        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div
            className="w-full aspect-[3/4] rounded-3xl relative overflow-hidden flex flex-col items-center justify-center border"
            style={{ backgroundColor: t.surface, borderColor: t.border }}
          >
            <div
              className="absolute inset-8 border rounded-lg pointer-events-none"
              style={{ borderColor: `${t.muted}20` }}
            >
              {["tl", "tr", "bl", "br"].map((c) => (
                <div
                  key={c}
                  className={`absolute w-8 h-8 ${
                    c === "tl"
                      ? "top-0 left-0 rounded-tl-lg border-t-2 border-l-2"
                      : c === "tr"
                        ? "top-0 right-0 rounded-tr-lg border-t-2 border-r-2"
                        : c === "bl"
                          ? "bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2"
                          : "bottom-0 right-0 rounded-br-lg border-b-2 border-r-2"
                  }`}
                  style={{ borderColor: `${t.muted}30` }}
                />
              ))}
            </div>
            <Camera
              size={48}
              style={{ color: t.muted, opacity: 0.3 }}
            />
            <p
              className="text-xs font-mono uppercase tracking-widest mt-3"
              style={{ color: t.muted, opacity: 0.5 }}
            >
              Capture Artifact
            </p>
          </div>

          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleCapture}
            ref={fileInputRef}
          />

          <div className="flex items-center justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-full flex items-center justify-center border-4 active:scale-90 transition-transform"
              style={{
                backgroundColor: t.foreground,
                borderColor: t.background,
                boxShadow: `0 0 20px ${t.accentGlow}`,
              }}
            >
              <div
                className="w-14 h-14 rounded-full border-2"
                style={{ borderColor: `${t.background}30` }}
              />
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderAnalyzing = () => (
    <div
      key="analyzing"
      className="flex-1 flex flex-col items-center justify-center gap-6"
    >
      <div className="relative">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 blur-3xl rounded-full"
          style={{ backgroundColor: t.accent }}
        />
        <Loader2
          size={48}
          className="animate-spin relative z-10"
          style={{ color: t.accent }}
        />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-medium">Reading the Signs...</h3>
        <p
          className="text-sm font-mono uppercase tracking-widest"
          style={{ color: t.muted }}
        >
          {stop?.name}
        </p>
      </div>
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

          {/* Pre-generated narration with trivia */}
          {stop.narration && (
            <div className="space-y-3">
              {stop.narration.lookDirection && (
                <div className="flex items-center gap-2 text-sm" style={{ color: t.accent }}>
                  <Eye size={14} />
                  <span className="font-medium">Look {stop.narration.lookDirection.toUpperCase()}</span>
                </div>
              )}
              {stop.narration.trivia && (
                <div className="rounded-lg border p-3" style={{ backgroundColor: t.accentLight + '15', borderColor: t.accentLight }}>
                  <p className="text-xs font-medium mb-1" style={{ color: t.accent }}>Trivia</p>
                  <p className="text-xs leading-relaxed" style={{ color: t.muted }}>
                    {stop.narration.trivia}
                  </p>
                </div>
              )}
            </div>
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
              boxShadow: `0 0 15px ${t.accentGlow}`,
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="flex flex-col h-full"
      >
        <div className="flex gap-4 mb-6">
          <div
            className="w-16 h-16 shrink-0 rounded-xl flex items-center justify-center text-2xl border"
            style={{
              backgroundColor: t.accentLight,
              borderColor: t.accent,
            }}
          >
            {stopIcon(explorationSpot.type)}
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="text-xl font-semibold">{explorationSpot.name}</h2>
            <span
              className="text-[10px] font-mono uppercase px-2 py-0.5 rounded w-fit mt-1"
              style={{
                backgroundColor: t.accentLight,
                color: t.accent,
              }}
            >
              {explorationSpot.type}
            </span>
          </div>
        </div>

        <div
          className="rounded-xl border p-5 mb-6"
          style={{ backgroundColor: t.surface, borderColor: t.border }}
        >
          <p
            className="text-sm italic leading-relaxed"
            style={{ color: t.muted }}
          >
            &ldquo;{explorationSpot.shortDescription}&rdquo;
          </p>
        </div>

        <div className="flex-1">
          {exploreLoreMutation.isPending && !explorationLore && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="relative">
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 blur-3xl rounded-full"
                  style={{ backgroundColor: t.accent }}
                />
                <Loader2
                  size={32}
                  className="animate-spin relative z-10"
                  style={{ color: t.accent }}
                />
              </div>
              <p
                className="text-sm font-mono uppercase"
                style={{ color: t.muted }}
              >
                Uncovering secrets...
              </p>
            </div>
          )}

          {explorationLore && (
            <div className="space-y-4">
              <p className="text-base font-serif leading-relaxed italic">
                &ldquo;{explorationLore}&rdquo;
              </p>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 space-y-2">
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
            <Navigation size={16} />
            Navigate Here
          </a>
          <button
            onClick={backFromExploration}
            className="w-full h-12 rounded-lg font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{
              backgroundColor: t.accent,
              color: "#fff",
              boxShadow: `0 0 15px ${t.accentGlow}`,
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
        <div className="flex items-center justify-center gap-3 py-8">
          <Loader2
            size={24}
            className="animate-spin"
            style={{ color: t.accent }}
          />
          <span style={{ color: t.muted }}>Inscribing your legend...</span>
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

  const renderSecretModal = () => {
    if (!activeSecret) return null;
    return (
      <motion.div
        key="secret-modal"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed inset-4 z-[100] flex flex-col items-center justify-center pointer-events-auto"
      >
        <div 
          className="absolute inset-[-100vh] bg-black/60 backdrop-blur-sm -z-10" 
          onClick={() => {
            setActiveSecret(null);
            saveToSession("activeSecret", null);
          }} 
        />
        <div 
          className="w-full max-w-sm rounded-2xl border p-6 flex flex-col gap-6 shadow-2xl relative overflow-hidden"
          style={{ backgroundColor: t.surface, borderColor: t.border }}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, transparent, ${t.accent}, transparent)` }} />
          
          <div className="text-center space-y-2 relative z-10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-2 bg-black/20" style={{ color: t.accent }}>
              <Compass size={24} className="animate-pulse" />
            </div>
            <p className="text-xs font-mono uppercase tracking-widest" style={{ color: t.accent }}>
              Secret Discovered
            </p>
            <h3 className="text-xl font-semibold font-serif italic border-b pb-4" style={{ borderColor: t.border }}>
              Look {activeSecret.lookDirection.toUpperCase()}
            </h3>
          </div>

          <div className="relative z-10">
            <p className="text-sm leading-relaxed italic" style={{ color: t.foreground }}>
              &ldquo;{activeSecret.loreSnippet}&rdquo;
            </p>
          </div>

          <div className="flex flex-col gap-3 relative z-10">
            {activeSecret.audioUrl ? (
              <div className="h-12 rounded-lg flex items-center justify-center gap-3 border" style={{ borderColor: t.accentLight, backgroundColor: t.accentLight + '20' }}>
                <audio autoPlay src={activeSecret.audioUrl} onEnded={() => {
                  setTimeout(() => {
                    setActiveSecret(null);
                    saveToSession("activeSecret", null);
                  }, 3000);
                }} />
                <div className="flex gap-1 h-4">
                  {[...Array(12)].map((_, i) => (
                    <motion.div key={i} animate={{ height: [2, Math.random() * 12 + 4, 2] }} transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.05 }} className="w-1 rounded-full" style={{ backgroundColor: t.accent }} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 h-12 text-xs" style={{ color: t.muted }}>
                <Loader2 size={14} className="animate-spin" /> Whispering...
              </div>
            )}
            <button
              onClick={() => {
                setActiveSecret(null);
                saveToSession("activeSecret", null);
              }}
              className="w-full h-12 rounded-lg font-medium transition-all active:scale-[0.98] border"
              style={{ backgroundColor: t.background, borderColor: t.border }}
            >
              Continue Journey
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderHighlightModal = () => {
    if (!activeHighlight) return null;
    return (
      <motion.div
        key="highlight-modal"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed inset-4 z-[100] flex flex-col items-center justify-center pointer-events-auto"
      >
        <div
          className="absolute inset-[-100vh] bg-black/60 backdrop-blur-sm -z-10"
          onClick={() => {
            setActiveHighlight(null);
            saveToSession("activeHighlight", null);
          }}
        />
        <div
          className="w-full max-w-sm rounded-2xl border p-6 flex flex-col gap-5 shadow-2xl relative overflow-hidden"
          style={{ backgroundColor: t.surface, borderColor: t.border }}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, transparent, ${t.accent}, transparent)` }} />

          <div className="text-center space-y-2 relative z-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-2 bg-black/20 text-3xl">
              {highlightIcon(activeHighlight.type)}
            </div>
            <p className="text-xs font-mono uppercase tracking-widest" style={{ color: t.accent }}>
              Point of Interest
            </p>
            <h3 className="text-lg font-semibold">{activeHighlight.name}</h3>
            <div className="flex items-center justify-center gap-2 text-sm" style={{ color: t.muted }}>
              <Eye size={14} />
              <span className="font-medium">Look {activeHighlight.narration.lookDirection.toUpperCase()}</span>
            </div>
          </div>

          <div className="relative z-10 space-y-3">
            <p className="text-sm leading-relaxed italic" style={{ color: t.foreground }}>
              &ldquo;{activeHighlight.narration.script}&rdquo;
            </p>
            {activeHighlight.narration.trivia && (
              <div className="rounded-lg border p-3" style={{ backgroundColor: t.accentLight + '15', borderColor: t.accentLight }}>
                <p className="text-xs font-medium mb-1" style={{ color: t.accent }}>Trivia</p>
                <p className="text-xs leading-relaxed" style={{ color: t.muted }}>
                  {activeHighlight.narration.trivia}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 relative z-10">
            {activeHighlight.audioUrl ? (
              <div className="h-12 rounded-lg flex items-center justify-center gap-3 border" style={{ borderColor: t.accentLight, backgroundColor: t.accentLight + '20' }}>
                <Volume2 size={16} style={{ color: t.accent }} />
                <audio autoPlay src={activeHighlight.audioUrl} onEnded={() => {
                  setTimeout(() => {
                    setActiveHighlight(null);
                    saveToSession("activeHighlight", null);
                  }, 3000);
                }} />
                <div className="flex gap-1 h-4">
                  {[...Array(12)].map((_, i) => (
                    <motion.div key={i} animate={{ height: [2, Math.random() * 12 + 4, 2] }} transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.05 }} className="w-1 rounded-full" style={{ backgroundColor: t.accent }} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 h-12 text-xs" style={{ color: t.muted }}>
                <Loader2 size={14} className="animate-spin" /> Narrating...
              </div>
            )}
            <button
              onClick={() => {
                setActiveHighlight(null);
                saveToSession("activeHighlight", null);
              }}
              className="w-full h-12 rounded-lg font-medium transition-all active:scale-[0.98] border"
              style={{ backgroundColor: t.background, borderColor: t.border }}
            >
              Continue Journey
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

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

      <AnimatePresence>
        {renderSecretModal()}
        {renderHighlightModal()}
      </AnimatePresence>

      {/* Arrival notification */}
      <AnimatePresence>
        {arrivalNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[90] px-6 py-3 rounded-xl border shadow-lg flex items-center gap-3"
            style={{ backgroundColor: t.surface, borderColor: t.accent }}
          >
            <CheckCircle size={20} style={{ color: t.accent }} />
            <div>
              <p className="text-sm font-medium">Arrived!</p>
              <p className="text-xs" style={{ color: t.muted }}>{arrivalNotification}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
