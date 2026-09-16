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

// CoinGecko ids for the coins we hold. Membership here is necessary but NOT
// sufficient to route a symbol to CoinGecko — the caller's asset_class must
// also say "crypto". Ticker namespaces collide: SOL is Solana and also
// NYSE:Emeren (~$1.50), and IBIT/ARKB are bitcoin ETFs that trade on an
// exchange and must be priced as equities even though they are bitcoin
// exposure. Routing on the symbol string alone gets both of those wrong.
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

  // Accepts either items:[{symbol, asset_class}] or the older symbols:[string].
  // Without an asset_class we fall back to the symbol-only routing, which is
  // what produced the CASH bug below, so callers should always send items.
  let items: { symbol: string; asset_class: string }[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.items)) {
      items = body.items.map((it: unknown) => {
        const o = it as Record<string, unknown>;
        return { symbol: String(o?.symbol ?? ""),
                 asset_class: String(o?.asset_class ?? "") };
      });
    } else if (Array.isArray(body?.symbols)) {
      items = body.symbols.map((s: unknown) => ({ symbol: String(s), asset_class: "" }));
    }
  } catch { /* empty */ }

  items = items
    .filter((it) => /^[A-Z0-9.\-]{1,12}$/.test(it.symbol))
    .slice(0, 80);

  // Cash is carried as unit-priced rows (qty = dollars, price = 1.00), so a
  // quote for it is never wanted — and "CASH" is a live NASDAQ ticker
  // (Pathward Financial, ~$78), which turned $611 of cash into $47,919.
  const skipped = items.filter((it) => it.asset_class === "cash").map((it) => it.symbol);
  const priceable = items.filter((it) => it.asset_class !== "cash");

  const symbols = priceable.map((it) => it.symbol);
  if (!symbols.length) {
    return json({ quotes: {}, as_of: new Date().toISOString(), skipped }, 200, origin);
  }

  const isCoin = (it: { symbol: string; asset_class: string }) =>
    !!COIN_IDS[it.symbol] && (it.asset_class === "crypto" || it.asset_class === "");
  const cryptoSyms = priceable.filter(isCoin).map((it) => it.symbol);
  const equitySyms = priceable.filter((it) => !isCoin(it)).map((it) => it.symbol);

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
    skipped,
  }, 200, origin);
});
