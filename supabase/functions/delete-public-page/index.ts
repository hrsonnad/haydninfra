import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://ixxnhvqyxkuwyshzdnlc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
const GITHUB_REPO = 'hrsonnad/haydninfra';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  // Verify auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const jwt = authHeader.slice(7);

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { id } = await req.json();
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Fetch the page record to get path and title
  const pageRes = await fetch(
    `${SUPABASE_URL}/rest/v1/public_pages?id=eq.${id}&select=id,title,path`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const pages = await pageRes.json();
  if (!pages?.length) {
    return new Response(JSON.stringify({ error: 'Page not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const { path, title } = pages[0];

  const warnings: string[] = [];

  // Normalize path: paths are stored without .html, but the actual file has .html
  const filePath = path.endsWith('.html') ? path : `${path}.html`;

  // Delete file from GitHub if token is configured
  if (GITHUB_TOKEN) {
    try {
      // Get file SHA (required for deletion)
      const shaRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
        {
          headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (shaRes.ok) {
        const fileData = await shaRes.json();
        const sha = fileData.sha;

        // Delete the file
        const deleteRes = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `Remove ${title} page`,
              sha,
            }),
          }
        );

        if (!deleteRes.ok) {
          const err = await deleteRes.text();
          warnings.push(`GitHub file deletion failed: ${err}`);
        }
      } else if (shaRes.status === 404) {
        warnings.push(`File not found on GitHub at path: ${path}`);
      } else {
        const err = await shaRes.text();
        warnings.push(`GitHub API error: ${err}`);
      }
    } catch (e) {
      warnings.push(`GitHub API exception: ${e}`);
    }
  } else {
    warnings.push('GITHUB_TOKEN not set — file not deleted from repo');
  }

  // Delete DB record
  const dbRes = await fetch(
    `${SUPABASE_URL}/rest/v1/public_pages?id=eq.${id}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal',
      },
    }
  );

  if (!dbRes.ok) {
    const err = await dbRes.text();
    return new Response(JSON.stringify({ error: `DB delete failed: ${err}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ success: true, warnings }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
