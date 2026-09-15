// portfolio-quotes — live prices for the private portfolio workspace.
//
// Proxied rather than fetched from the browser for two reasons: the page CSP
// allows connect-src only to this Supabase origin, and the symbol list is
// itself sensitive (it reveals holdings), so the request must be behind the
// owner gate like everything else.
//
// Degrades quietly: any symbol that cannot be priced is simply absent from the
// response and the UI keeps showing its snapshot price.
import { createClient } from "npm:@supabase/supabase-js@2";

const OWNER_USER_ID = Deno.env.get("OWNER_USER_ID") ?? "";

const ALLOWED_ORIGINS = new Set([
  "https://haydns.ai",
  "https://hrsonnad.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

// CoinGecko ids for the crypto we hold. Anything not listed is treated as an
// equity symbol.
const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", LTC: "litecoin",
  SOL: "solana", DOGE: "dogecoin", USDC: "usd-coin", USDT: "tether",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://haydns.ai";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json",
               "Cache-Control": "no-store" },
  });
}

async function equityQuote(sym: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
      `?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === "number" && p > 0 ? p : null;
  } catch { return null; }
}

async function cryptoQuotes(syms: string[]): Promise<Record<string, number>> {
  const ids = syms.map((s) => COIN_IDS[s]).filter(Boolean);
  if (!ids.length) return {};
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}` +
      `&vs_currencies=usd`,
    );
    if (!r.ok) return {};
    const j = await r.json();
    const out: Record<string, number> = {};
    for (const s of syms) {
      const id = COIN_IDS[s];
      const p = id && j[id]?.usd;
      if (typeof p === "number" && p > 0) out[s] = p;
    }
    return out;
  } catch { return {}; }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405, origin);

  // --- auth: real token, real user, and that user must be the owner ---
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "unauthorized" }, 401, origin);

  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "unauthorized" }, 401, origin);
  if (!OWNER_USER_ID || u.user.id !== OWNER_USER_ID) {
    return json({ error: "forbidden" }, 403, origin);
  }

  let symbols: string[] = [];
  try {
    const body = await req.json();
    symbols = Array.isArray(body?.symbols) ? body.symbols : [];
  } catch { /* empty */ }

  symbols = symbols
    .filter((s) => typeof s === "string" && /^[A-Z0-9.\-]{1,12}$/.test(s))
    .slice(0, 80);
  if (!symbols.length) return json({ quotes: {}, as_of: new Date().toISOString() }, 200, origin);

  const cryptoSyms = symbols.filter((s) => COIN_IDS[s]);
  const equitySyms = symbols.filter((s) => !COIN_IDS[s]);

  const [crypto, equities] = await Promise.all([
    cryptoQuotes(cryptoSyms),
    Promise.all(equitySyms.map(async (s) => [s, await equityQuote(s)] as const)),
  ]);

  const quotes: Record<string, number> = { ...crypto };
  for (const [s, p] of equities) if (p !== null) quotes[s] = p;

  return json({
    quotes,
    as_of: new Date().toISOString(),
    missing: symbols.filter((s) => !(s in quotes)),
  }, 200, origin);
});
