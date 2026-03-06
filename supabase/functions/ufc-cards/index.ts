import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GROK_API_KEY = Deno.env.get('GROK_API_KEY');
const GROK_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-4-1-fast-reasoning';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function askGrok(system: string, user: string): Promise<string> {
  const res = await fetch(GROK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Grok ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  // Strip markdown code fences if present
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
    let cache = 900; // 15 min default

    if (mode === 'events') {
      json = await askGrok(
        `You are a UFC scheduling expert with real-time knowledge. Today is ${today}. Return ONLY valid JSON — no markdown, no preamble, no commentary.`,
        `List the next 4 upcoming UFC events from today (${today}) onwards, ordered by date ascending. Include both numbered PPV events and UFC Fight Night events. Return:
{
  "events": [
    {
      "id": "ufc-311",
      "title": "UFC 311",
      "subtitle": "Makhachev vs Moicano",
      "date": "2025-01-18",
      "venue": "Intuit Dome",
      "location": "Inglewood, CA",
      "broadcast": "ESPN+ PPV"
    }
  ]
}`
      );

    } else if (mode === 'card') {
      const event = url.searchParams.get('event') ?? '';
      json = await askGrok(
        `You are an authoritative UFC expert with current, accurate fight card knowledge. Today is ${today}. Return ONLY valid JSON.`,
        `Give me the complete fight card for "${event}", including all fights from main event down through prelims. For each fight provide accurate fighter names, records, and current betting odds. Return:
{
  "event": {
    "title": "UFC 311",
    "date": "2025-01-18",
    "venue": "Intuit Dome",
    "location": "Inglewood, CA"
  },
  "fights": [
    {
      "id": "makhachev-vs-moicano",
      "card_section": "main_event",
      "weight_class": "Lightweight",
      "is_title_fight": true,
      "title_description": "UFC Lightweight Championship",
      "fighter1": {
        "name": "Islam Makhachev",
        "nickname": "The Machine",
        "record": "26-1",
        "rank": "C",
        "country_flag": "🇷🇺",
        "country": "Russia"
      },
      "fighter2": {
        "name": "Renato Moicano",
        "nickname": "Money",
        "record": "21-5-1",
        "rank": "#5",
        "country_flag": "🇧🇷",
        "country": "Brazil"
      },
      "odds": {
        "fighter1": "-800",
        "fighter2": "+580",
        "draw": "+3000"
      },
      "preview": "The dominant champion defends against the hard-hitting Brazilian stepping in on short notice."
    }
  ]
}`
      );

    } else if (mode === 'fight') {
      const f1 = url.searchParams.get('f1') ?? '';
      const f2 = url.searchParams.get('f2') ?? '';
      cache = 1800; // 30 min for deep dives

      json = await askGrok(
        `You are an elite UFC analyst and journalist with deep knowledge of fighter histories, styles, and recent news. Today is ${today}. Return ONLY valid JSON.`,
        `Give me a comprehensive breakdown of the fight between ${f1} and ${f2}. Be specific and detailed with accurate records, fight history, and current news. Return:
{
  "fighter1": {
    "name": "${f1}",
    "style": "One sentence describing their complete fighting style and approach",
    "strengths": ["Specific strength 1", "Specific strength 2", "Specific strength 3"],
    "weaknesses": ["Specific weakness 1", "Specific weakness 2"],
    "last_5_fights": [
      { "opponent": "Fighter Name", "result": "W", "method": "KO/TKO R2", "date": "2024-10" }
    ],
    "recent_news": [
      "Specific recent headline or development about this fighter",
      "Another recent fact or news item"
    ]
  },
  "fighter2": {
    "name": "${f2}",
    "style": "One sentence describing their complete fighting style and approach",
    "strengths": ["Specific strength 1", "Specific strength 2", "Specific strength 3"],
    "weaknesses": ["Specific weakness 1", "Specific weakness 2"],
    "last_5_fights": [
      { "opponent": "Fighter Name", "result": "W", "method": "Unanimous Decision", "date": "2024-08" }
    ],
    "recent_news": [
      "Specific recent headline or development about this fighter",
      "Another recent fact or news item"
    ]
  },
  "head_to_head": {
    "previous_meetings": 0,
    "history": null
  },
  "key_factors": [
    "Specific factor 1 that will determine the fight outcome",
    "Specific factor 2",
    "Specific factor 3"
  ],
  "prediction": {
    "winner": "Fighter Name",
    "method": "Decision",
    "round": null,
    "confidence": "high",
    "reasoning": "2-3 sentences of detailed, specific reasoning for this prediction."
  },
  "why_watch": "1-2 sentences on what makes this fight uniquely compelling and unmissable."
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
