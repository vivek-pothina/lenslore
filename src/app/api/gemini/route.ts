import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: NextRequest) {
  try {
    const { image, vibe, location, groupSize = 1 } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    if (!image || !vibe || !location) {
      return NextResponse.json(
        { error: "Missing required fields: image, vibe, location" },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = "gemini-3-flash-preview";

    const prompt = `You are a theatrical narrator for an immersive scavenger hunt called "The Urban Alchemist". 
    The current vibe is "${vibe}". 
    The location is "${location}". 
    The group size is ${groupSize} explorer${groupSize > 1 ? 's' : ''}.
    Analyze this photo taken by the user at the location. 
    Generate a short, immersive 3-sentence lore piece about what they've found. 
    Make it sound mysterious and atmospheric. 
    ${groupSize > 1 ? 'Address the group appropriately.' : ''}
    Do not use markdown, just plain text.`;

    const result = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: image } }
          ]
        }
      ]
    });

    const generatedText = result.text || "The artifact remains silent, but its presence is felt in the marrow of your bones.";
    
    return NextResponse.json({ lore: generatedText });
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { lore: "The shadows refuse to speak today. Proceed to the next coordinate." },
      { status: 200 }
    );
  }
}
