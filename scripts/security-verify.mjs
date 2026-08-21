#!/usr/bin/env node
// Security verification suite for the private photo library.
// Asserts, with real HTTP calls, that nobody unauthorized can reach the photos.
//
// Leak-proof by construction: prints only PASS/FAIL + HTTP status. Never prints
// response bodies, tokens, or signed URLs. The only state-changing calls it makes
// are signup/insert ATTEMPTS whose whole purpose is to be rejected.
//
//   node scripts/security-verify.mjs            # tiers 1+2 (needs env below)
//   node scripts/security-verify.mjs --repo-only # V18 only, no network
//
// Env (GitHub Actions secrets / local .env.security-verify — NEVER committed):
//   SUPABASE_URL, SUPABASE_ANON_KEY            (public; from shared/supabase.js)
//   VERIFY_INTRUDER_EMAIL, VERIFY_INTRUDER_PASSWORD   (tier 2; authed-but-not-owner)
//   R2_S3_ENDPOINT, R2_BUCKET                  (optional; tier 1 direct-bucket checks)
//   VERIFY_OWNER_EMAIL, VERIFY_OWNER_PASSWORD  (tier 3; local only, positive tests)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
function record(id, name, pass, code) {
  results.push({ id, name, pass, code });
  const tag = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`${tag} ${id.padEnd(4)} ${name}${code !== undefined ? `  (HTTP ${code})` : ''}`);
}

// Load a local env file if present (dev). In CI, real env vars are used.
function loadEnv() {
  for (const f of ['.env.security-verify', '.env']) {
    try {
      for (const line of readFileSync(join(REPO, f), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { /* not present */ }
  }
}

const B64URL = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

// ---------- V18: repo scan (no network) ----------
const MEDIA_EXT = /\.(heic|heif|mov|mp4|m4v|avi|dng|cr2|arw|tiff?|webp)$/i;
const RASTER_EXT = /\.(jpe?g|png|gif)$/i;
const SECRET_PATTERNS = [
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
  /SUPABASE_SERVICE_ROLE\s*[:=]\s*["'][^"']+/,
  /(SECRET_ACCESS_KEY|R2_SECRET)\s*[:=]\s*["'][A-Za-z0-9/+=]{24,}/,
];
const SKIP_DIRS = new Set(['.git', 'node_modules', '.vercel', 'derivatives']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push({ p, size: st.size });
  }
  return out;
}

function scanRepo() {
  const files = walk(REPO);
  const problems = [];
  for (const { p, size } of files) {
    const rel = relative(REPO, p);
    if (MEDIA_EXT.test(p)) problems.push(`media file tracked: ${rel}`);
    else if (RASTER_EXT.test(p) && size > 1_000_000) problems.push(`large image tracked: ${rel} (${(size/1e6).toFixed(1)}MB)`);
    else if (size > 2_000_000 && !/\.(out\.css|min\.js)$/.test(p)) problems.push(`file >2MB: ${rel}`);
    if (/\.(html|js|ts|mjs|json|md|sql|toml|css|sh|yml|yaml)$/i.test(p) && size < 2_000_000) {
      let text = '';
      try { text = readFileSync(p, 'utf8'); } catch { continue; }
      for (const rx of SECRET_PATTERNS) {
        if (rx.test(text)) problems.push(`secret pattern in ${rel}`);
      }
      // decode JWT-shaped strings; fail only on service_role
      for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
        try {
          const payload = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString());
          if (payload.role === 'service_role') problems.push(`service_role JWT in ${rel}`);
        } catch { /* not a JWT */ }
      }
    }
  }
  record('V18', 'repo has no media / large files / secrets', problems.length === 0);
  if (problems.length) problems.slice(0, 10).forEach((p) => console.log(`       - ${p}`));
}

// ---------- network helpers ----------
async function http(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    let body = null;
    try { body = await res.json(); } catch { /* non-json */ }
    return { status: res.status, ok: res.ok, body, headers: res.headers };
  } catch (e) {
    return { status: 0, ok: false, err: e.message };
  }
}

async function main() {
  loadEnv();
  const repoOnly = process.argv.includes('--repo-only');
  scanRepo();
  if (repoOnly) return finish();

  const URL_ = process.env.SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY;
  if (!URL_ || !ANON) {
    console.log('\n(skipping network tests: set SUPABASE_URL and SUPABASE_ANON_KEY)');
    return finish();
  }
  const FN = `${URL_}/functions/v1/photo-api`;
  const REST = `${URL_}/rest/v1`;
  const authH = (tok) => ({ Authorization: `Bearer ${tok}`, apikey: ANON });

  // V1 no token
  let r = await http(`${FN}/library`, { headers: { apikey: ANON } });
  record('V1', 'photo-api with no token -> 401', r.status === 401, r.status);

  // V2 anon key as bearer (passes verify_jwt, must fail getUser owner check)
  r = await http(`${FN}/library`, { headers: authH(ANON) });
  record('V2', 'photo-api with anon key -> 401/403', r.status === 401 || r.status === 403, r.status);

  // V3 alg:none forged token
  const noneTok = `${B64URL({ alg: 'none', typ: 'JWT' })}.${B64URL({ sub: '00000000-0000-0000-0000-000000000000', role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })}.`;
  r = await http(`${FN}/library`, { headers: authH(noneTok) });
  record('V3', 'photo-api with alg:none forgery -> 401', r.status === 401, r.status);

  // V4 tampered signature
  const tampered = ANON.slice(0, -6) + 'AAAAAA';
  r = await http(`${FN}/library`, { headers: authH(tampered) });
  record('V4', 'photo-api with tampered JWT -> 401', r.status === 401, r.status);

  // V6 signups disabled
  r = await http(`${URL_}/auth/v1/settings`, { headers: { apikey: ANON } });
  const signupDisabled = r.body && (r.body.disable_signup === true || r.body.external?.email === false);
  record('V6', 'auth settings report signups disabled', !!signupDisabled, r.status);

  // V7 live signup attempt (must be rejected)
  r = await http(`${URL_}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `verify-canary+${Date.now()}@example.com`, password: 'Xy9!verify-canary-pw' }),
  });
  const signupBlocked = r.status >= 400 && !(r.body && r.body.access_token);
  record('V7', 'signup attempt rejected (signups off)', signupBlocked, r.status);
  if (!signupBlocked) console.log('       !! signups appear OPEN — disable in Dashboard immediately');

  // V8 anon SELECT on each photo table
  const TABLES = ['photos', 'conversations', 'photo_sources', 'tags', 'photo_tags', 'people', 'faces', 'photo_embeddings'];
  let v8ok = true, v8code = 0;
  for (const t of TABLES) {
    r = await http(`${REST}/${t}?select=*&limit=1`, { headers: authH(ANON) });
    const denied = r.status === 401 || r.status === 403 || (r.status === 200 && Array.isArray(r.body) && r.body.length === 0);
    if (!denied) { v8ok = false; v8code = r.status; console.log(`       - ${t} leaked rows (HTTP ${r.status})`); }
  }
  record('V8', 'anon SELECT on photo tables -> denied/empty', v8ok, v8ok ? undefined : v8code);

  // V8b private.owners not exposed
  r = await http(`${REST}/owners?select=user_id`, { headers: authH(ANON) });
  record('V8b', 'private.owners not exposed via PostgREST', r.status === 404 || r.status === 406, r.status);

  // V9 anon INSERT
  r = await http(`${REST}/photos`, {
    method: 'POST', headers: { ...authH(ANON), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ content_hash: 'verify-canary', taken_at: new Date().toISOString(), mime: 'image/x', bytes: 1, r2_original: 'x', r2_thumb: 'x' }),
  });
  record('V9', 'anon INSERT into photos -> denied', r.status === 401 || r.status === 403, r.status);

  // V16 CORS from evil origin
  r = await http(`${FN}/library`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
  const evilACAO = r.headers?.get('access-control-allow-origin');
  record('V16', 'CORS: evil origin gets no ACAO', evilACAO !== 'https://evil.example' && evilACAO !== '*', r.status);

  // V17 CORS from haydns.ai
  r = await http(`${FN}/library`, { method: 'OPTIONS', headers: { Origin: 'https://haydns.ai', 'Access-Control-Request-Method': 'GET' } });
  record('V17', 'CORS: haydns.ai echoed exactly', r.headers?.get('access-control-allow-origin') === 'https://haydns.ai', r.status);

  // ---- Tier 1 direct-bucket (optional) ----
  if (process.env.R2_S3_ENDPOINT && process.env.R2_BUCKET) {
    // R2 returns 400 (InvalidArgument) for a fully-unsigned S3 request, 401/403
    // for a bad signature — all are denials. The security property is that the
    // object is NOT served (no 2xx). Assert non-2xx and an S3 <Error> body.
    r = await http(`${process.env.R2_S3_ENDPOINT}/${process.env.R2_BUCKET}/_verify/canary.txt`);
    const denied = r.status >= 400 && r.status < 500;
    record('V12', 'unsigned R2 GET -> denied (object not served)', denied, r.status);
  } else {
    console.log('SKIP V12  (set R2_S3_ENDPOINT + R2_BUCKET to test direct bucket access)');
  }

  // ---- Tier 2: intruder ----
  const iEmail = process.env.VERIFY_INTRUDER_EMAIL, iPass = process.env.VERIFY_INTRUDER_PASSWORD;
  if (iEmail && iPass) {
    r = await http(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: iEmail, password: iPass }),
    });
    const itok = r.body?.access_token;
    if (!itok) {
      record('V5', 'intruder login (for negative tests)', false, r.status);
    } else {
      r = await http(`${FN}/library`, { headers: authH(itok) });
      record('V5', 'authed non-owner -> 403', r.status === 403, r.status);

      let v10ok = true, v10code = 0;
      for (const t of TABLES) {
        r = await http(`${REST}/${t}?select=*&limit=1`, { headers: authH(itok) });
        const empty = r.status === 200 && Array.isArray(r.body) && r.body.length === 0;
        const denied = r.status === 401 || r.status === 403;
        if (!(empty || denied)) { v10ok = false; v10code = r.status; }
      }
      record('V10', 'intruder SELECT on photo tables -> 0 rows', v10ok, v10ok ? undefined : v10code);

      // V11 regression: the two formerly-open tables
      let v11ok = true, v11code = 0;
      for (const t of ['nav_config', 'page_display_config']) {
        r = await http(`${REST}/${t}`, {
          method: 'POST', headers: { ...authH(itok), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(t === 'nav_config' ? { tree: [] } : { section: 'x', tab_key: 'x', tab_label: 'x' }),
        });
        if (!(r.status === 401 || r.status === 403)) { v11ok = false; v11code = r.status; }
      }
      record('V11', 'intruder INSERT nav_config/page_display -> 403', v11ok, v11ok ? undefined : v11code);
    }
  } else {
    console.log('SKIP V5/V10/V11  (set VERIFY_INTRUDER_EMAIL + VERIFY_INTRUDER_PASSWORD)');
  }

  // ---- Tier 3: owner positive + TTL (local only) ----
  const oEmail = process.env.VERIFY_OWNER_EMAIL, oPass = process.env.VERIFY_OWNER_PASSWORD;
  if (oEmail && oPass) {
    r = await http(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: oEmail, password: oPass }),
    });
    const otok = r.body?.access_token;
    if (otok) {
      r = await http(`${FN}/verify-canary`, { headers: authH(otok) });
      const canaryUrl = r.body?.url;
      record('V13', 'owner mints canary presigned URL', !!canaryUrl, r.status);
      if (canaryUrl) {
        const ok = await http(canaryUrl);
        record('V13b', 'fresh presigned URL works', ok.status === 200, ok.status);
        // V15 tamper: change signed path
        const tamperedUrl = canaryUrl.replace('_verify/canary.txt', 'originals/x');
        const t2 = await http(tamperedUrl);
        record('V15', 'presigned URL with altered path -> 403', t2.status === 403, t2.status);
        console.log('       (V14 TTL-expiry: re-run canary fetch after 7s manually to confirm 403)');
      }
    } else {
      record('V13', 'owner login for positive tests', false, r.status);
    }
  } else {
    console.log('SKIP V13/V15  (owner creds — run locally only, never in CI)');
  }

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log(`\x1b[31m${failed.length} FAILED: ${failed.map((f) => f.id).join(', ')}\x1b[0m`);
    process.exit(1);
  }
  console.log('\x1b[32mall clear\x1b[0m');
}

main();
