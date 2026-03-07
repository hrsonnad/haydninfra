import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
const GITHUB_API = 'https://api.github.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const path = url.searchParams.get('path');

  if (!path || !path.startsWith('/')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid path' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const ghRes = await fetch(GITHUB_API + path, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    const body = await ghRes.text();
    return new Response(body, {
      status: ghRes.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
