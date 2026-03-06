import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GROK_API_KEY = Deno.env.get('GROK_API_KEY');
const GROK_URL = 'https://api.x.ai/v1/chat/completions';
const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://ixxnhvqyxkuwyshzdnlc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MODEL_ENRICH = 'grok-4-1-fast-non-reasoning';
const MODEL_ANALYZE = 'grok-4-1-fast-reasoning';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/* ── Cache helpers ──────────────────────────────────────── */
async function cacheGet(key: string): Promise<any | null> {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/grok_cache?cache_key=eq.${encodeURIComponent(key)}&expires_at=gt.${new Date().toISOString()}&select=response`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length > 0 ? rows[0].response : null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, response: any, ttlHours: number): Promise<void> {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const expires = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
    await fetch(`${SUPABASE_URL}/rest/v1/grok_cache`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ cache_key: key, response, expires_at: expires }),
    });
  } catch { /* best effort */ }
}

/* ── Grok helper ────────────────────────────────────────── */
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

/* ── ESPN fetch ─────────────────────────────────────────── */
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

/* ── ESPN data extractors ───────────────────────────────── */
function extractEvent(e: any) {
  const name: string = e.name ?? '';
  const shortName: string = e.shortName ?? '';
  const venue0 = e.venues?.[0] ?? {};
  const comp0 = e.competitions?.[0] ?? {};
  const venueComp = comp0.venue ?? venue0;
  const city = venueComp.address?.city ?? '';
  const rawState = venueComp.address?.state ?? '';
  const state = rawState === 'None' ? '' : rawState;
  const country = venueComp.address?.country ?? '';

  // Get broadcast from highest-billed fight (last competition)
  const lastComp = e.competitions?.[e.competitions.length - 1] ?? {};
  const broadcast = lastComp.broadcast
    ?? lastComp.broadcasts?.[0]?.names?.[0]
    ?? (/UFC \d+/.test(name) ? 'ESPN+ PPV' : 'ESPN+');

  const colonIdx = name.indexOf(': ');
  const subtitle = colonIdx >= 0 ? name.substring(colonIdx + 2) : '';

  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: name,
    shortName,
    subtitle,
    date: (e.date ?? '').split('T')[0],
    startTime: e.date ?? '',
    venue: venueComp.fullName ?? '',
    location: [city, state || country].filter(Boolean).join(', '),
    broadcast,
  };
}

function extractFight(comp: any, position: number) {
  const sorted = [...(comp.competitors ?? [])].sort(
    (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
  );
  const f1 = sorted[0] ?? {};
  const f2 = sorted[1] ?? {};
  const rounds = comp.format?.regulation?.periods ?? 3;
  const statusDetail = comp.status?.type?.detail ?? '';
  const shortDetail = comp.status?.type?.shortDetail ?? '';
  const broadcast = comp.broadcast ?? comp.broadcasts?.[0]?.names?.[0] ?? '';

  return {
    position,
    rounds,
    weightClass: comp.type?.abbreviation ?? '',
    startTime: comp.date ?? comp.startDate ?? '',
    statusDetail,
    shortDetail,
    broadcast,
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
}

/* ── Kalshi market data ─────────────────────────────────── */
async function fetchKalshiMarkets(): Promise<any[]> {
  try {
    const res = await fetch(
      `${KALSHI_API}/markets?series_ticker=KXUFCFIGHT&status=open&limit=200`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.markets ?? [];
  } catch {
    return [];
  }
}

function normalizeLastName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .pop() ?? '';
}

function matchKalshiMarket(
  markets: any[],
  fighter1Name: string,
  fighter2Name: string,
): any | null {
  const f1Last = normalizeLastName(fighter1Name);
  const f2Last = normalizeLastName(fighter2Name);
  if (!f1Last || !f2Last) return null;

  for (const m of markets) {
    const ticker = (m.ticker ?? '').toLowerCase();
    const yesTitle = (m.yes_sub_title ?? '').toLowerCase();
    const noTitle = (m.no_sub_title ?? '').toLowerCase();

    // Match by ticker suffix (first 3 chars of each last name)
    const f1Abbr = f1Last.slice(0, 3);
    const f2Abbr = f2Last.slice(0, 3);
    const tickerMatch = ticker.includes(f1Abbr) && ticker.includes(f2Abbr);

    // Match by sub_title containing last names
    const titleMatch = (yesTitle.includes(f1Last) || yesTitle.includes(f2Last)) &&
                       (noTitle.includes(f1Last) || noTitle.includes(f2Last));

    if (tickerMatch || titleMatch) return m;
  }
  return null;
}

function kalshiToOdds(
  market: any,
  fighter1Name: string,
  fighter2Name: string,
): { fighter1: string; fighter2: string; draw: null; source: string; f1Prob: number; f2Prob: number } {
  // Determine which fighter is "yes" and which is "no"
  const yesTitle = (market.yes_sub_title ?? '').toLowerCase();
  const f1Last = normalizeLastName(fighter1Name);

  // Get mid-market probability from last price, falling back to mid of bid/ask
  let yesProb: number;
  const lastPrice = parseFloat(market.last_price_dollars ?? '0');
  const yesBid = parseFloat(market.yes_bid_dollars ?? '0');
  const yesAsk = parseFloat(market.yes_ask_dollars ?? '0');

  if (lastPrice > 0) {
    yesProb = lastPrice;
  } else if (yesBid > 0 && yesAsk > 0) {
    yesProb = (yesBid + yesAsk) / 2;
  } else {
    yesProb = yesBid || yesAsk || 0.5;
  }

  const noProb = 1 - yesProb;

  // Map yes/no to fighter1/fighter2
  const f1IsYes = yesTitle.includes(f1Last);
  const f1Prob = f1IsYes ? yesProb : noProb;
  const f2Prob = f1IsYes ? noProb : yesProb;

  return {
    fighter1: probToAmericanOdds(f1Prob),
    fighter2: probToAmericanOdds(f2Prob),
    draw: null,
    source: 'kalshi',
    f1Prob: Math.round(f1Prob * 100),
    f2Prob: Math.round(f2Prob * 100),
  };
}

function probToAmericanOdds(prob: number): string {
  if (prob <= 0 || prob >= 1) return prob >= 1 ? '-10000' : '+10000';
  if (prob >= 0.5) {
    const odds = Math.round(-(prob / (1 - prob)) * 100);
    return String(odds);
  } else {
    const odds = Math.round(((1 - prob) / prob) * 100);
    return `+${odds}`;
  }
}

/* ── Main handler ───────────────────────────────────────── */
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
      // ── ESPN only — no AI needed ────────────────────────────
      const espnEvents = await fetchESPN();
      const events = espnEvents.slice(0, 6).map(extractEvent);
      json = JSON.stringify({ events });

    } else if (mode === 'card') {
      // ── ESPN data + cached Grok enrichment ──────────────────
      const eventParam = url.searchParams.get('event') ?? '';
      const espnEvents = await fetchESPN();

      const espnEvent = espnEvents.find((e: any) => {
        const eName = (e.name ?? '').toLowerCase();
        const param = eventParam.toLowerCase();
        return eName === param || eName.includes(param) || param.includes(eName);
      }) ?? espnEvents[0];

      if (!espnEvent) throw new Error('Event not found');

      const eventInfo = extractEvent(espnEvent);

      // ESPN orders fights prelim→main; reverse so main event is first
      const competitions: any[] = [...(espnEvent.competitions ?? [])].reverse();
      const fightList = competitions.map((comp: any, i: number) => extractFight(comp, i + 1));

      // Check cache first
      const cacheKey = `card:${eventInfo.title}`;
      const cached = await cacheGet(cacheKey);

      let enrichedData: any;
      if (cached) {
        enrichedData = cached;
      } else {
        const enrichedStr = await askGrok(
          `You are an authoritative UFC expert. Today is ${today}. Return ONLY valid JSON — no markdown, no commentary.`,
          `The following fight card for "${espnEvent.name}" is confirmed from ESPN (official source). Enrich each fight with your knowledge.

Event: ${eventInfo.title}
Date: ${eventInfo.date}
Start Time: ${eventInfo.startTime}
Venue: ${eventInfo.venue}, ${eventInfo.location}
Broadcast: ${eventInfo.broadcast}

Confirmed fights (position 1 = main event, descending to lower card):
${fightList.map(f =>
  `${f.position}. ${f.fighter1.name} (${f.fighter1.record}, ${f.fighter1.country}) vs ${f.fighter2.name} (${f.fighter2.record}, ${f.fighter2.country}) | ${f.weightClass} | ${f.rounds} rounds | ${f.shortDetail || 'Time TBA'}`
).join('\n')}

Assign card_section: position 1=main_event, 2=co_main, 3-5=main_card, 6-9=prelim, 10+=early_prelim.
5-round fights are typically title fights or main/co-main events.

IMPORTANT: Use the EXACT fighter names and records from the ESPN data above. Do not change or correct them.

Return:
{
  "fights": [{
    "id": "kebab-case-unique-id",
    "card_section": "main_event"|"co_main"|"main_card"|"prelim"|"early_prelim",
    "weight_class": "Full Weight Class Name",
    "is_title_fight": boolean,
    "title_description": "e.g. UFC Lightweight Championship"|null,
    "fighter1": { "name": "exact ESPN name", "nickname": string|null, "record": "exact ESPN record", "rank": "#1"|"C"|null, "country_flag": "emoji flag", "country": "Country Name" },
    "fighter2": { "name": "exact ESPN name", "nickname": string|null, "record": "exact ESPN record", "rank": "#1"|"C"|null, "country_flag": "emoji flag", "country": "Country Name" },
    "odds": { "fighter1": "-150", "fighter2": "+130", "draw": null },
    "preview": "1-2 sentence preview of the fight for fans"
  }]
}`,
          MODEL_ENRICH
        );
        enrichedData = JSON.parse(enrichedStr);
        await cacheSet(cacheKey, enrichedData, 6); // cache for 6 hours
      }

      // Fetch Kalshi market data for real odds
      const kalshiMarkets = await fetchKalshiMarkets();

      // Merge ESPN timing data + Kalshi odds into enriched fights
      const fights = (enrichedData.fights ?? []).map((fight: any, idx: number) => {
        const espnFight = fightList[idx];
        if (espnFight) {
          fight.rounds = espnFight.rounds;
          fight.start_time = espnFight.startTime;
          fight.status_detail = espnFight.statusDetail;
          fight.short_detail = espnFight.shortDetail;
          fight.fight_broadcast = espnFight.broadcast;
        }

        // Overlay Kalshi real-time odds if available
        const f1Name = fight.fighter1?.name ?? '';
        const f2Name = fight.fighter2?.name ?? '';
        if (kalshiMarkets.length && f1Name && f2Name) {
          const matched = matchKalshiMarket(kalshiMarkets, f1Name, f2Name);
          if (matched) {
            fight.odds = kalshiToOdds(matched, f1Name, f2Name);
          }
        }

        return fight;
      });

      json = JSON.stringify({
        event: eventInfo,
        fights,
      });

    } else if (mode === 'fight') {
      // ── Deep analysis with caching ──────────────────────────
      const f1 = url.searchParams.get('f1') ?? '';
      const f2 = url.searchParams.get('f2') ?? '';
      cache = 1800;

      // Check cache
      const cacheKey = `fight:${[f1, f2].sort().join('|')}`;
      const cached = await cacheGet(cacheKey);

      if (cached) {
        json = JSON.stringify(cached);
      } else {
        const rawJson = await askGrok(
          `You are an elite UFC analyst with deep knowledge of fighter histories, styles, and recent news. Today is ${today}. Return ONLY valid JSON.`,
          `Give me a comprehensive breakdown of the fight between ${f1} and ${f2}. Be specific with accurate records, fight history, and current news. Return:
{
  "fighter1": {
    "name": "${f1}",
    "style": "One sentence describing their complete fighting style",
    "stance": "Orthodox|Southpaw|Switch",
    "age": number,
    "height": "6'1\\"" or similar,
    "reach": "74\\"" or similar,
    "strengths": ["Strength 1", "Strength 2", "Strength 3"],
    "weaknesses": ["Weakness 1", "Weakness 2"],
    "stats": {
      "sig_strikes_per_min": number,
      "sig_strike_accuracy": "50%",
      "takedown_avg": number,
      "takedown_accuracy": "45%",
      "sub_avg": number,
      "knockdown_avg": number
    },
    "last_5_fights": [
      { "opponent": "Name", "result": "W", "method": "KO/TKO R2", "date": "2025-10" }
    ],
    "recent_news": ["Recent headline 1", "Recent headline 2"],
    "win_streak": number|null,
    "finish_rate": "70%"
  },
  "fighter2": {
    "name": "${f2}",
    "style": "One sentence describing their complete fighting style",
    "stance": "Orthodox|Southpaw|Switch",
    "age": number,
    "height": "5'11\\"" or similar,
    "reach": "72\\"" or similar,
    "strengths": ["Strength 1", "Strength 2", "Strength 3"],
    "weaknesses": ["Weakness 1", "Weakness 2"],
    "stats": {
      "sig_strikes_per_min": number,
      "sig_strike_accuracy": "48%",
      "takedown_avg": number,
      "takedown_accuracy": "40%",
      "sub_avg": number,
      "knockdown_avg": number
    },
    "last_5_fights": [
      { "opponent": "Name", "result": "W", "method": "Unanimous Decision", "date": "2025-08" }
    ],
    "recent_news": ["Recent headline 1", "Recent headline 2"],
    "win_streak": number|null,
    "finish_rate": "65%"
  },
  "head_to_head": { "previous_meetings": 0, "history": null },
  "key_factors": ["Factor 1", "Factor 2", "Factor 3", "Factor 4"],
  "prediction": {
    "winner": "Fighter Name",
    "method": "Decision|KO/TKO|Submission",
    "round": null|number,
    "confidence": "high"|"medium"|"low",
    "reasoning": "3-4 sentences of specific reasoning with references to stats and tendencies."
  },
  "why_watch": "2-3 sentences on what makes this fight compelling for fans."
}`,
          MODEL_ANALYZE
        );
        const parsed = JSON.parse(rawJson);
        await cacheSet(cacheKey, parsed, 24); // cache for 24 hours
        json = JSON.stringify(parsed);
      }

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
