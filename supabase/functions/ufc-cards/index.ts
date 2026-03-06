import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GROK_API_KEY = Deno.env.get('GROK_API_KEY');
const GROK_URL = 'https://api.x.ai/v1/chat/completions';

// grok-2-latest for schedule/card lookups (has live web search support)
// grok-4-1-fast-reasoning for deep fight analysis (reasoning-heavy)
const MODEL_SEARCH = 'grok-2-latest';
const MODEL_REASON = 'grok-4-1-fast-reasoning';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function askGrok(system: string, user: string, useSearch = false): Promise<string> {
  const model = useSearch ? MODEL_SEARCH : MODEL_REASON;
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (useSearch) {
    body.search_parameters = { mode: 'on' };
  }

  const res = await fetch(GROK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Grok ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  return content.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  if (!GROK_API_KEY) {
    return new Response(JSON.stringify({ error: 'GROK_API_KEY not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? 'events';
  const today = new Date().toISOString().split('T')[0];

  try {
    let json: string;
    let cache = 900;

    if (mode === 'events') {
      json = await askGrok(
        `You are a UFC scheduling expert. Use live web search to find accurate, current UFC event data. Today is ${today}. Return ONLY valid JSON — no markdown, no commentary.`,
        `Search the web right now for the next 4 upcoming UFC events on or after ${today}, ordered by date. Use ufc.com or ESPN as your source. Return exact official event names and dates — do not guess. Return:
{
  "events": [
    {
      "id": "ufc-326",
      "title": "UFC 326",
      "subtitle": "Fighter A vs Fighter B",
      "date": "2026-03-07",
      "venue": "Venue Name",
      "location": "City, State",
      "broadcast": "ESPN+ PPV"
    }
  ]
}`,
        true
      );

    } else if (mode === 'card') {
      const event = url.searchParams.get('event') ?? '';
      json = await askGrok(
        `You are an authoritative UFC expert. Use live web search to get the accurate, confirmed fight card. Today is ${today}. Return ONLY valid JSON.`,
        `Search the web right now for the confirmed fight card for "${event}". Use ufc.com, ESPN, or MMAFighting as sources. List only confirmed bouts — do not invent fights. Include all fights from main event through early prelims. Return:
{
  "event": { "title": string, "date": string, "venue": string, "location": string },
  "fights": [{
    "id": string,
    "card_section": "main_event"|"co_main"|"main_card"|"prelim"|"early_prelim",
    "weight_class": string,
    "is_title_fight": boolean,
    "title_description": string|null,
    "fighter1": { "name": string, "nickname": string|null, "record": string, "rank": string|null, "country_flag": string, "country": string },
    "fighter2": { "name": string, "nickname": string|null, "record": string, "rank": string|null, "country_flag": string, "country": string },
    "odds": { "fighter1": string, "fighter2": string, "draw": string|null },
    "preview": string
  }]
}`,
        true
      );

    } else if (mode === 'fight') {
      const f1 = url.searchParams.get('f1') ?? '';
      const f2 = url.searchParams.get('f2') ?? '';
      cache = 1800;

      json = await askGrok(
        `You are an elite UFC analyst with deep knowledge of fighter histories, styles, and recent news. Today is ${today}. Return ONLY valid JSON.`,
        `Give me a comprehensive breakdown of the fight between ${f1} and ${f2}. Be specific with accurate records, fight history, and current news. Return:
{
  "fighter1": {
    "name": "${f1}",
    "style": "One sentence describing their complete fighting style",
    "strengths": ["Strength 1", "Strength 2", "Strength 3"],
    "weaknesses": ["Weakness 1", "Weakness 2"],
    "last_5_fights": [
      { "opponent": "Name", "result": "W", "method": "KO/TKO R2", "date": "2025-10" }
    ],
    "recent_news": ["Recent headline 1", "Recent headline 2"]
  },
  "fighter2": {
    "name": "${f2}",
    "style": "One sentence describing their complete fighting style",
    "strengths": ["Strength 1", "Strength 2", "Strength 3"],
    "weaknesses": ["Weakness 1", "Weakness 2"],
    "last_5_fights": [
      { "opponent": "Name", "result": "W", "method": "Unanimous Decision", "date": "2025-08" }
    ],
    "recent_news": ["Recent headline 1", "Recent headline 2"]
  },
  "head_to_head": { "previous_meetings": 0, "history": null },
  "key_factors": ["Factor 1", "Factor 2", "Factor 3"],
  "prediction": {
    "winner": "Fighter Name",
    "method": "Decision",
    "round": null,
    "confidence": "high",
    "reasoning": "2-3 sentences of specific reasoning."
  },
  "why_watch": "1-2 sentences on what makes this fight compelling."
}`
      );

    } else {
      return new Response(JSON.stringify({ error: 'Invalid mode' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(json, {
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${cache}`,
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
