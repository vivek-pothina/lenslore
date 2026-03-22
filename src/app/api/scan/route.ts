import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

interface BBoxResult {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  label: string;
}

interface ScanResponse {
  landmarkDetected: boolean;
  landmarkName: string;
  lore: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null; // normalized 0-1
}

type ScanMode = "detect" | "scan";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeDetection(input: unknown): { label: string; box: [number, number, number, number] } | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Partial<BBoxResult>;
  if (!Array.isArray(row.box_2d) || row.box_2d.length !== 4) return null;

  const raw = row.box_2d.map((n) => Number(n));
  if (raw.some((n) => Number.isNaN(n) || !Number.isFinite(n))) return null;

  let [ymin, xmin, ymax, xmax] = raw as [number, number, number, number];
  ymin = clamp(ymin, 0, 1000);
  xmin = clamp(xmin, 0, 1000);
  ymax = clamp(ymax, 0, 1000);
  xmax = clamp(xmax, 0, 1000);

  // Ensure box direction is valid and not degenerate.
  if (ymax <= ymin || xmax <= xmin) return null;
  const minSpan = 20; // 2% of frame in 0-1000 coordinates
  if (ymax - ymin < minSpan || xmax - xmin < minSpan) return null;

  const label = typeof row.label === "string" && row.label.trim().length > 0
    ? row.label.trim()
    : "Detected Object";

  return { label, box: [ymin, xmin, ymax, xmax] };
}

export async function POST(request: NextRequest) {
  console.log("[/api/scan] Request received");

  try {
    const { image, vibe, expectedLocation, mode } = await request.json();
    const scanMode: ScanMode = mode === "detect" ? "detect" : "scan";
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });
    if (!image || !vibe) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const ai = new GoogleGenAI({ apiKey });

    // STEP 1: Detect target with explicit fallback chain for demo reliability.
    const detectPrompt = `Look at this image and detect the single most prominent real-world object or landmark.

Priority order (STRICT):
1. The actual place/landmark that best matches this expected context: "${expectedLocation || ""}"
   - Buildings, landmarks, monuments, murals, statues, architectural features.
2. If #1 is not visible, detect a red parking sign OR red parking garage entrance logo/sign.
3. If #1 and #2 are not visible, detect a soda can, sparkling water can, or similar drink can.
4. If #1-#3 are not visible, detect a coffee mug.
5. If #1-#4 are not visible, detect a steel glass.
6. If none of the above are visible, return [].

Return a JSON array with exactly ONE entry for the best detected item:
{"box_2d": [ymin, xmin, ymax, xmax], "label": "specific name/brand of the object"}

The box_2d coordinates MUST be normalized to 0-1000 integers where:
- ymin: top edge (0=top of image, 1000=bottom)
- xmin: left edge (0=left, 1000=right)
- ymax: bottom edge
- xmax: right edge

Be PRECISE with the bounding box and choose only one target:
- Tight fit around the object (not whole scene)
- Avoid tiny noisy boxes
- Keep coordinates inside 0..1000

If no valid target from the priority list is visible, return: []

Examples:
[{"box_2d": [50, 100, 900, 800], "label": "Empire State Building"}]
[{"box_2d": [220, 180, 760, 540], "label": "Red Parking Sign"}]
[{"box_2d": [280, 360, 660, 560], "label": "Sparkling Water Can"}]
[{"box_2d": [300, 340, 700, 620], "label": "Coffee Mug"}]
[{"box_2d": [260, 420, 760, 610], "label": "Steel Glass"}]`;

    console.log("[/api/scan] Calling Gemini for detection...");

    const detectResult = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ parts: [{ text: detectPrompt }, { inlineData: { mimeType: "image/jpeg", data: image } }] }],
      config: { responseMimeType: "application/json", temperature: 0.1 },
    });

    const detectText = detectResult.text || "[]";
    console.log(`[/api/scan] Detection response: ${detectText.substring(0, 300)}`);

    let detections: BBoxResult[] = [];
    try {
      const cleaned = detectText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      detections = JSON.parse(cleaned);
    } catch {
      console.log("[/api/scan] Failed to parse detection JSON");
      detections = [];
    }

    if (!Array.isArray(detections) || detections.length === 0) {
      console.log("[/api/scan] No valid target detected");
      return NextResponse.json({
        landmarkDetected: false,
        landmarkName: "",
        lore: "",
        boundingBox: null,
      } as ScanResponse);
    }

    const bestSanitized = sanitizeDetection(detections[0]);
    if (!bestSanitized) {
      console.log("[/api/scan] Invalid bbox from model");
      return NextResponse.json({
        landmarkDetected: false,
        landmarkName: "",
        lore: "",
        boundingBox: null,
      } as ScanResponse);
    }

    const [ymin, xmin, ymax, xmax] = bestSanitized.box;
    const bbox = {
      x: xmin / 1000,
      y: ymin / 1000,
      width: (xmax - xmin) / 1000,
      height: (ymax - ymin) / 1000,
    };

    console.log(`[/api/scan] Detected: "${bestSanitized.label}" at box [${ymin},${xmin},${ymax},${xmax}]`);

    if (scanMode === "detect") {
      return NextResponse.json({
        landmarkDetected: true,
        landmarkName: bestSanitized.label,
        lore: "",
        boundingBox: bbox,
      } as ScanResponse);
    }

    // STEP 2: Generate lore for the detected object
    const lorePrompt = `You are narrating for a Pokemon Go-style urban scavenger hunt called "The Urban Alchemist". Theme: "${vibe}".

The player just scanned: "${bestSanitized.label}"

Write exactly 2-3 sentences of immersive, dramatic lore treating this mundane object as a legendary artifact.
${vibe === "Cyberpunk" ? "Use neon, chrome, circuits, megacorps, dystopian imagery." : vibe === "Noir" ? "Use shadows, secrets, rain, detective, film-noir imagery." : vibe === "Fantasy" ? "Use magic, enchantments, ancient runes, mythical power." : "Use historical depth, ancient legends, scholarly wonder."}
Plain text, no markdown.`;

    console.log("[/api/scan] Generating lore...");
    const loreResult = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ parts: [{ text: lorePrompt }] }],
    });

    const lore = loreResult.text || `${bestSanitized.label} radiates an ancient power, its surface gleaming with untold secrets.`;

    console.log(`[/api/scan] Success: name="${bestSanitized.label}", bbox=${JSON.stringify(bbox)}`);

    return NextResponse.json({
      landmarkDetected: true,
      landmarkName: bestSanitized.label,
      lore,
      boundingBox: bbox,
    } as ScanResponse);

  } catch (error) {
    console.error("[/api/scan] Fatal:", error);
    return NextResponse.json({
      landmarkDetected: false,
      landmarkName: "",
      lore: "",
      boundingBox: null,
    } as ScanResponse);
  }
}
