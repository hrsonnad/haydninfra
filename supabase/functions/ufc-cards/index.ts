import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GROK_API_KEY = Deno.env.get('GROK_API_KEY');
const GROK_URL = 'https://api.x.ai/v1/chat/completions';
const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';

// grok-4-1-fast-non-reasoning: fast enrichment tasks (card mode)
// grok-4-1-fast-reasoning: deep analysis (fight mode)
const MODEL_ENRICH = 'grok-4-1-fast-non-reasoning';
const MODEL_ANALYZE = 'grok-4-1-fast-reasoning';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function askGrok(system: string, user: string, model: string): Promise<string> {
  const res = await fetch(GROK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Grok ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  return content.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
}

async function fetchESPN(): Promise<any[]> {
  const now = new Date();
  const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
  const url = `${ESPN_URL}?dates=${fmt(now)}-${fmt(future)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN API ${res.status}`);
  const data = await res.json();
  return data.events ?? [];
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
      // ── ESPN only — no AI needed, fully accurate ──────────
      const espnEvents = await fetchESPN();

      const events = espnEvents.slice(0, 4).map((e: any) => {
        const name: string = e.name ?? '';
        const comp0 = e.competitions?.[0] ?? {};
        const venue = comp0.venue ?? {};
        const city = venue.address?.city ?? '';
        const rawState = venue.address?.state ?? '';
        const state = rawState === 'None' ? '' : rawState;
        const broadcast = comp0.broadcast ?? (/UFC \d+/.test(name) ? 'ESPN+ PPV' : 'ESPN+');

        // Subtitle: "Fighter A vs Fighter B" from part after ": " in event name
        const colonIdx = name.indexOf(': ');
        const subtitle = colonIdx >= 0 ? name.substring(colonIdx + 2) : '';

        return {
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          title: name,
          subtitle,
          date: (e.date ?? '').split('T')[0],
          venue: venue.fullName ?? '',
          location: [city, state].filter(Boolean).join(', '),
          broadcast,
        };
      });

      json = JSON.stringify({ events });

    } else if (mode === 'card') {
      // ── ESPN for accurate fighter data + Grok for enrichment ──
      const eventParam = url.searchParams.get('event') ?? '';
      const espnEvents = await fetchESPN();

      // Flexible event name matching
      const espnEvent = espnEvents.find((e: any) => {
        const eName = (e.name ?? '').toLowerCase();
        const param = eventParam.toLowerCase();
        return eName === param || eName.includes(param) || param.includes(eName);
      }) ?? espnEvents[0];

      if (!espnEvent) throw new Error('Event not found');

      const comp0 = espnEvent.competitions?.[0] ?? {};
      const venue = comp0.venue ?? {};
      const city = venue.address?.city ?? '';
      const rawState = venue.address?.state ?? '';
      const state = rawState === 'None' ? '' : rawState;
      const eventDate = (espnEvent.date ?? '').split('T')[0];

      // ESPN orders fights prelim→main; reverse so main event is first
      const competitions: any[] = [...(espnEvent.competitions ?? [])].reverse();

      const fightList = competitions.map((comp: any, i: number) => {
        // Sort competitors by order field (1 = fighter1, 2 = fighter2)
        const sorted = [...(comp.competitors ?? [])].sort(
          (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
        );
        const f1 = sorted[0] ?? {};
        const f2 = sorted[1] ?? {};
        const rounds = comp.format?.regulation?.periods ?? 3;

        return {
          position: i + 1,
          rounds,
          weightClass: comp.type?.abbreviation ?? '',
          fighter1: {
            name: f1.athlete?.fullName ?? 'TBA',
            record: f1.records?.[0]?.summary ?? 'N/A',
            country: f1.athlete?.flag?.alt ?? '',
          },
          fighter2: {
            name: f2.athlete?.fullName ?? 'TBA',
            record: f2.records?.[0]?.summary ?? 'N/A',
            country: f2.athlete?.flag?.alt ?? '',
          },
        };
      });

      const enriched = await askGrok(
        `You are an authoritative UFC expert. Today is ${today}. Return ONLY valid JSON — no markdown, no commentary.`,
        `The following fight card for "${espnEvent.name}" is confirmed from ESPN (official source). Enrich each fight with your knowledge.

Event: ${espnEvent.name}
Date: ${eventDate}
Venue: ${venue.fullName ?? 'TBA'}${city ? ', ' + city : ''}${state ? ', ' + state : ''}

Confirmed fights (position 1 = main event, descending to lower card):
${fightList.map(f =>
  `${f.position}. ${f.fighter1.name} (${f.fighter1.record}, ${f.fighter1.country}) vs ${f.fighter2.name} (${f.fighter2.record}, ${f.fighter2.country}) | ${f.weightClass} | ${f.rounds} rounds`
).join('\n')}

Assign card_section: position 1=main_event, 2=co_main, 3-5=main_card, 6-9=prelim, 10+=early_prelim.
5-round fights (noted above) are typically title fights or main/co-main events.

Return:
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
        MODEL_ENRICH
      );

      json = enriched;

    } else if (mode === 'fight') {
      // ── Deep analysis — reasoning model ────────────────────
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
}`,
        MODEL_ANALYZE
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
