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

export async function POST(request: NextRequest) {
  console.log("[/api/scan] Request received");

  try {
    const { image, vibe, expectedLocation } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });
    if (!image || !vibe) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const ai = new GoogleGenAI({ apiKey });

    // STEP 1: Object detection with bounding boxes
    const detectPrompt = `Look at this image and detect any beverage cans, soda cans, tin cans, or drink containers.
Also detect: coffee cups, water bottles, energy drinks, beer cans, juice boxes.

For each detected item, return a JSON array with bounding boxes. Each entry:
{"box_2d": [ymin, xmin, ymax, xmax], "label": "brand name + product"}

The box_2d coordinates should be normalized to 0-1000 where:
- ymin: top edge (0=top of image, 1000=bottom)
- xmin: left edge (0=left, 1000=right)
- ymax: bottom edge
- xmax: right edge

If you see NO cans or drink containers, return an empty array: []

Examples:
[{"box_2d": [200, 300, 600, 500], "label": "La Croix Lime Sparkling Water"}]
[{"box_2d": [100, 400, 500, 700], "label": "Coca-Cola Classic Can"}]
[]`;

    console.log("[/api/scan] Calling Gemini for detection...");

    const detectResult = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ parts: [{ text: detectPrompt }, { inlineData: { mimeType: "image/jpeg", data: image } }] }],
      config: { responseMimeType: "application/json" },
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
      console.log("[/api/scan] No cans detected");
      return NextResponse.json({
        landmarkDetected: false,
        landmarkName: "",
        lore: "",
        boundingBox: null,
      } as ScanResponse);
    }

    // Use first detection
    const best = detections[0];
    const [ymin, xmin, ymax, xmax] = best.box_2d;
    const bbox = {
      x: xmin / 1000,
      y: ymin / 1000,
      width: (xmax - xmin) / 1000,
      height: (ymax - ymin) / 1000,
    };

    console.log(`[/api/scan] Detected: "${best.label}" at box [${ymin},${xmin},${ymax},${xmax}]`);

    // STEP 2: Generate lore for the detected object
    const lorePrompt = `You are narrating for a Pokemon Go-style urban scavenger hunt called "The Urban Alchemist". Theme: "${vibe}".

The player just scanned: "${best.label}"

Write exactly 2-3 sentences of immersive, dramatic lore treating this mundane object as a legendary artifact.
${vibe === "Cyberpunk" ? "Use neon, chrome, circuits, megacorps, dystopian imagery." : vibe === "Noir" ? "Use shadows, secrets, rain, detective, film-noir imagery." : vibe === "Fantasy" ? "Use magic, enchantments, ancient runes, mythical power." : "Use historical depth, ancient legends, scholarly wonder."}
Plain text, no markdown.`;

    console.log("[/api/scan] Generating lore...");
    const loreResult = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ parts: [{ text: lorePrompt }] }],
    });

    const lore = loreResult.text || `${best.label} radiates an ancient power, its surface gleaming with untold secrets.`;

    console.log(`[/api/scan] Success: name="${best.label}", bbox=${JSON.stringify(bbox)}`);

    return NextResponse.json({
      landmarkDetected: true,
      landmarkName: best.label,
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
