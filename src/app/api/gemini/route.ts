import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: NextRequest) {
  try {
    const { image, images, vibe, location, groupSize = 1, adventureLog, mode, transitMode } =
      await request.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = "gemini-3-flash-preview";

    if (adventureLog && images?.length) {
      const systemPrompt = `You are "The Urban Alchemist", a D&D dungeon master narrating the conclusion of an urban adventure. Vibe: "${vibe}". Write a cohesive 4-paragraph adventure log in ${vibe} style. Reference each location from the photos. Make it feel like a legendary campaign recap. No markdown, plain text with paragraph breaks.`;

      const parts: any[] = [{ text: systemPrompt }];
      for (const img of images) {
        parts.push({
          inlineData: { mimeType: "image/jpeg", data: img },
        });
      }

      const result = await ai.models.generateContent({
        model,
        contents: [{ parts }],
      });

      return NextResponse.json({
        lore:
          result.text ||
          "Your adventure fades into legend, remembered only by the echoes in the alleyways.",
      });
    }

    // Guided narration mode - generates on-the-fly narration for nearby discoveries
    if (mode === "guided-narration" && location) {
      const isWalking = transitMode === "transit";
      const narrationLength = isWalking
        ? "4-5 sentences — the user is walking, so they have time for a richer narration"
        : "2-3 sentences — the user is in a moving vehicle, keep it brief";

      const prompt = `You are "The Urban Alchemist", a guided tour narrator for a ${vibe} urban adventure.
The user just passed by "${location}" in ${city || "the city"}.
Travel mode: ${transitMode || "transit"}.

Generate an on-the-fly narration about this place. ${narrationLength}.
Start with a direction cue (e.g., "Look to your left" or "On your right").
Describe what makes this place visually or historically notable.
If you know any trivia (movie filming location, historical event, celebrity connection, architectural fact), include it.
Keep the tone immersive and ${vibe}.

Return ONLY valid JSON, no markdown fences:
{
  "narration": {
    "script": "Your narration text with direction cue",
    "lookDirection": "left|right|up|down|around",
    "trivia": "1-sentence fun fact (optional, can be empty string)"
  }
}`;

      const result = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
      });

      const text = result.text || "";
      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return NextResponse.json(parsed);
      } catch {
        return NextResponse.json({
          narration: {
            script: text || `You pass by ${location}. Its presence lingers in the air.`,
            lookDirection: "around",
            trivia: "",
          },
        });
      }
    }

    if (!vibe || !location) {
      return NextResponse.json(
        { error: "Missing required fields: vibe, location" },
        { status: 400 }
      );
    }

    const parts: any[] = [];

    if ((images && images.length > 0) || image) {
      const prompt = `You are a theatrical narrator for an immersive scavenger hunt called "The Urban Alchemist". Vibe: "${vibe}". Location: "${location}". Group: ${groupSize} explorer${groupSize > 1 ? "s" : ""}. 
First, verify objectively if the visual evidence reasonably matches ${location}.
If it is clearly a photo of random garbage, an indoor bedroom, or a drastically incorrect famous landmark, abort the narration and reply EXACTLY AND ONLY with: "INVALID_LOCATION".
If the location is plausible, analyze the photo(s) and generate 3 sentences of immersive lore in the ${vibe} style. Mysterious and atmospheric. No markdown, plain text.`;

      parts.push({ text: prompt });

      if (images && images.length > 0) {
        for (const img of images) {
          parts.push({ inlineData: { mimeType: "image/jpeg", data: img } });
        }
      } else if (image) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: image } });
      }
    } else {
      const prompt = `You are a theatrical narrator for an immersive scavenger hunt called "The Urban Alchemist". Vibe: "${vibe}". Location: "${location}". Group: ${groupSize} explorer${groupSize > 1 ? "s" : ""}. Generate 3 sentences of immersive lore about this place in the ${vibe} style. Mysterious and atmospheric. No markdown, plain text.`;
      parts.push({ text: prompt });
    }

    const result = await ai.models.generateContent({
      model,
      contents: [{ parts }],
    });

    return NextResponse.json({
      lore:
        result.text ||
        "The artifact remains silent, but its presence is felt in the marrow of your bones.",
    });
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { lore: "The shadows refuse to speak today. Proceed to the next coordinate." },
      { status: 200 }
    );
  }
}
