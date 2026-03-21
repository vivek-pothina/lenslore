import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export async function POST(req: Request) {
  console.log('[itinerary] POST hit');

  const body = await req.json();
  const { vibe, city, numStops, transitMode, meals, groupSize, customPrompt } = body;

  console.log('[itinerary] config:', { vibe, city, numStops, transitMode, meals, groupSize, customPrompt });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[itinerary] GEMINI_API_KEY missing');
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500 });
  }
  console.log('[itinerary] API key present, length:', apiKey.length);

  const systemPrompt = `You are "The Urban Alchemist", a D&D dungeon master for real-world urban adventures. You craft immersive scavenger hunts in real cities. Your tone is ${vibe}.

${vibe === 'Cyberpunk' ? 'Neon-lit, dystopian, tech-noir language. Reference chrome, circuits, megacorps.' : ''}
${vibe === 'Noir' ? 'Shadowy, detective, 1940s film-noir. Reference rain, secrets, gumshoes.' : ''}
${vibe === 'Fantasy' ? 'Magical, medieval, high-fantasy. Reference quests, enchantments, ancient power.' : ''}
${vibe === 'Historical' ? 'Period-authentic, scholarly, antiquarian. Reference eras, legends, artifacts.' : ''}

Plan exactly ${numStops} stops in ${city} for ${groupSize} adventurer${groupSize > 1 ? 's' : ''}.
Travel by ${transitMode}.
${meals.length > 0 ? `Must include stops for: ${meals.join(', ')}.` : 'No meal stops required.'}
${customPrompt ? `Special request: "${customPrompt}"` : ''}

Each stop must be a REAL place with a REAL approximate address in ${city}. Mix landmark types: include Instagram-worthy spots, historical sites${meals.length > 0 ? ', and restaurants matching the meal preferences' : ''}.

Return ONLY valid JSON, no markdown fences, no explanation:
{
  "title": "dramatic adventure title",
  "summary": "2-sentence D&D-style adventure hook",
  "stops": [
    {
      "id": 1,
      "name": "Real Place Name",
      "type": "landmark|restaurant|activity",
      "description": "2-3 sentences of ${vibe} lore describing this as a quest destination",
      "address": "Approximate real address",
      "coordinates": "lat,lng",
      "nearbySpots": [
        { "name": "Nearby real place", "type": "landmark|restaurant|activity", "shortDescription": "1 sentence teaser in ${vibe} style" }
      ]
    }
  ],
  "routeSecrets": [
    {
      "name": "hidden spot name",
      "coordinates": "lat,lng",
      "lookDirection": "left|right|up|down|around",
      "loreSnippet": "1-2 sentences of thematic audio narration triggered when they walk past this exact coordinate. Start by telling them where to look based on lookDirection."
    }
  ]
}

IMPORTANT: Each stop MUST have 2-3 nearbySpots — real places within walking distance.
CRITICAL FOR AUTO-NARRATION: You MUST generate 2-3 \`routeSecrets\`. These are physical, real-world points of interest (statues, strange buildings, alleys, small parks) that exist ON THE WALKING PATH entirely *between* the main stops. You must provide their exact \`coordinates\` (\`lat,lng\`). The \`loreSnippet\` is an audio script that will auto-play the moment their GPS breaches a 40-meter radius of the coordinate. It should be mysterious and direct their gaze using \`lookDirection\`.`;

  try {
    console.log('[itinerary] calling streamText with gemini-3-flash-preview');
    const google = createGoogleGenerativeAI({ apiKey });
    const result = streamText({
      model: google('gemini-3-flash-preview'),
      system: systemPrompt,
      prompt: `Plan a ${vibe} urban adventure in ${city}.`,
    });
    console.log('[itinerary] streamText returned, streaming response');
    return result.toTextStreamResponse();
  } catch (err) {
    console.error('[itinerary] streamText error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
