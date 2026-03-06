import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GROK_API_KEY = Deno.env.get('GROK_API_KEY');
const GROK_URL = 'https://api.x.ai/v1/chat/completions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!GROK_API_KEY) {
    return new Response(JSON.stringify({ error: 'GROK_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    const grokRes = await fetch(GROK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-2-latest',
        messages: [
          {
            role: 'system',
            content: `You are a news aggregator. Today is ${today}. Return ONLY valid JSON — no markdown, no commentary.`,
          },
          {
            role: 'user',
            content: `Give me the 10 most recent and significant Tesla news stories from the past 7 days. For each article return:
- title (string): the headline
- source (string): publication name
- date (string): ISO date e.g. "2024-01-15"
- summary (string): 2-3 sentence factual summary
- url (string): the original article URL if known, otherwise ""
- sentiment (string): one of "positive", "neutral", "negative"

Return as JSON: { "articles": [ ...array of 10 objects... ] }`,
          },
        ],
      }),
    });

    if (!grokRes.ok) {
      const err = await grokRes.text();
      throw new Error(`Grok API error ${grokRes.status}: ${err}`);
    }

    const grokData = await grokRes.json();
    const content = grokData.choices?.[0]?.message?.content ?? '';

    // Strip markdown fences if present
    const jsonStr = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(jsonStr);

    return new Response(JSON.stringify(parsed), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900', // cache 15 min
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
