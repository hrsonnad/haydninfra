// photo-api — the single backend surface for the private photo library.
// Auth on EVERY request: platform verify_jwt (coarse) + server-side getUser()
// (rejects the anon key, forged/alg:none tokens) + owner UUID pin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { makePresigner, Presigner } from "./presign.ts";

const OWNER_USER_ID = Deno.env.get("OWNER_USER_ID") ?? "";
const REQUIRE_AAL2 = Deno.env.get("REQUIRE_AAL2") === "true";
const R2 = {
  accountId: Deno.env.get("R2_ACCOUNT_ID") ?? "",
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") ?? "",
  secretKey: Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "",
  bucket: Deno.env.get("R2_BUCKET") ?? "haydns-photos",
};
const TTL = { thumb: 900, media: 3600, download: 120, canary: 5 };

const ALLOWED_ORIGINS = new Set([
  "https://haydns.ai",
  "https://hrsonnad.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function cors(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return { "Vary": "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const TIER_BITS: Record<string, number> = { library: 0, screenshot: 4, clutter: 8 };

async function fetchAllPhotos(cols: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("photos").select(cols)
      .order("taken_at", { ascending: false }).order("id", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function handleLibrary(origin: string | null): Promise<Response> {
  const rows = await fetchAllPhotos(
    "id, taken_at, width, height, is_video, has_live, tier, blurhash");
  const items = rows.map((r) => [
    r.id,
    Math.floor(new Date(r.taken_at as string).getTime() / 1000),
    r.width ?? 0,
    r.height ?? 0,
    (r.is_video ? 1 : 0) | (r.has_live ? 2 : 0) | (TIER_BITS[r.tier as string] ?? 0),
    r.blurhash ?? "",
  ]);
  const { data: facets, error } = await admin.rpc("api_library_facets");
  if (error) throw error;
  return json({ items, facets }, 200, origin);
}

async function handleSign(req: Request, origin: string | null, signer: Presigner): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "medium" ? "medium" : "thumb";
  const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 200) : [];
  if (!ids.length) return json({ error: "no ids" }, 400, origin);
  const { data, error } = await admin.from("photos")
    .select("id, r2_thumb, r2_medium, r2_poster, is_video").in("id", ids);
  if (error) throw error;
  const urls: Record<string, string> = {};
  for (const r of data ?? []) {
    const key = kind === "thumb"
      ? r.r2_thumb
      : (r.is_video ? (r.r2_poster ?? r.r2_thumb) : (r.r2_medium ?? r.r2_thumb));
    if (key) urls[r.id] = await signer.sign(key, TTL.thumb, {
      "response-cache-control": "private, max-age=86400, immutable",
    });
  }
  return json({ urls, expires_in: TTL.thumb }, 200, origin);
}

const MONTHS = ["january","february","march","april","may","june","july",
  "august","september","october","november","december"];

async function handleSearch(url: URL, origin: string | null): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!q) return json({ ids: [], chips: [] }, 200, origin);
  const chips: { type: string; label: string }[] = [];
  const sets: string[][] = [];

  const convMatch = q.match(/^conversation:(\S+)$/);
  if (convMatch) {
    const { data } = await admin.from("photo_sources").select("photo_id")
      .eq("conversation_id", convMatch[1]).limit(5000);
    return json({ ids: [...new Set((data ?? []).map((r) => r.photo_id))], chips: [] }, 200, origin);
  }
  const personMatch = q.match(/^person:(\d+)$/);
  if (personMatch) {
    const { data } = await admin.from("faces").select("photo_id")
      .eq("person_id", Number(personMatch[1])).limit(5000);
    return json({ ids: [...new Set((data ?? []).map((r) => r.photo_id))], chips: [] }, 200, origin);
  }

  // people by name
  const { data: people } = await admin.from("people").select("id, name")
    .ilike("name", `%${q}%`).limit(5);
  for (const p of people ?? []) {
    const { data } = await admin.from("faces").select("photo_id").eq("person_id", p.id).limit(5000);
    if (data?.length) {
      sets.push(data.map((r) => r.photo_id));
      chips.push({ type: "person", label: p.name as string });
    }
  }
  // tags
  const { data: tags } = await admin.from("photo_labels").select("id, name").ilike("name", `%${q}%`).limit(5);
  for (const t of tags ?? []) {
    const { data } = await admin.from("photo_tags").select("photo_id")
      .eq("tag_id", t.id).order("score", { ascending: false }).limit(5000);
    if (data?.length) {
      sets.push(data.map((r) => r.photo_id));
      chips.push({ type: "tag", label: t.name as string });
    }
  }
  // conversations by name
  const { data: convs } = await admin.from("conversations").select("id, name")
    .ilike("name", `%${q}%`).limit(5);
  for (const c of convs ?? []) {
    const { data } = await admin.from("photo_sources").select("photo_id")
      .eq("conversation_id", c.id).limit(5000);
    if (data?.length) {
      sets.push(data.map((r) => r.photo_id));
      chips.push({ type: "conversation", label: c.name as string });
    }
  }
  // dates: "2023", "june 2023", "june"
  const lower = q.toLowerCase();
  const ym = lower.match(/^([a-z]+)\s+(\d{4})$/);
  const yOnly = lower.match(/^(\d{4})$/);
  let range: [string, string] | null = null;
  if (yOnly) range = [`${yOnly[1]}-01-01`, `${Number(yOnly[1]) + 1}-01-01`];
  else if (ym && MONTHS.includes(ym[1])) {
    const m = MONTHS.indexOf(ym[1]) + 1;
    const y = Number(ym[2]);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    range = [`${y}-${String(m).padStart(2, "0")}-01`, next];
  }
  if (range) {
    const { data } = await admin.from("photos").select("id")
      .gte("taken_at", range[0]).lt("taken_at", range[1]).limit(10000);
    if (data?.length) {
      sets.push(data.map((r) => r.id));
      chips.push({ type: "date", label: q });
    }
  }
  // free text -> FTS over OCR/captions
  if (!sets.length || (!convMatch && !range)) {
    const { data } = await admin.rpc("api_fts", { q });
    if (data?.length) {
      sets.push(data.map((r: { id: string }) => r.id));
      chips.push({ type: "text", label: `text: "${q}"` });
    }
  }
  const ids = [...new Set(sets.flat())].slice(0, 5000);
  return json({ ids, chips }, 200, origin);
}

async function handlePhoto(id: string, origin: string | null, signer: Presigner): Promise<Response> {
  const { data: p, error } = await admin.from("photos").select("*").eq("id", id).single();
  if (error || !p) return json({ error: "not found" }, 404, origin);
  const [{ data: sources }, { data: ptags }, { data: faces }] = await Promise.all([
    admin.from("photo_sources")
      .select("sender, sent_at, conversation_id, conversations(name, kind)").eq("photo_id", id),
    admin.from("photo_tags").select("score, photo_labels(name, category)").eq("photo_id", id)
      .order("score", { ascending: false }),
    admin.from("faces").select("bbox, person_id, people(name)").eq("photo_id", id),
  ]);
  const urls: Record<string, string> = {
    thumb: await signer.sign(p.r2_thumb, TTL.thumb),
  };
  if (p.r2_medium) urls.medium = await signer.sign(p.r2_medium, TTL.media);
  if (p.r2_playback) urls.playback = await signer.sign(p.r2_playback, TTL.media);
  if (p.r2_poster) urls.poster = await signer.sign(p.r2_poster, TTL.thumb);
  if (p.r2_live) urls.live = await signer.sign(p.r2_live, TTL.media);
  if (p.mime === "image/gif") urls.full = await signer.sign(p.r2_original, TTL.media);
  const fname = `${(p.taken_at as string).slice(0, 10)}_${p.content_hash.slice(0, 8)}${extOf(p.r2_original)}`;
  urls.download = await signer.sign(p.r2_original, TTL.download, {
    "response-content-disposition": `attachment; filename="${fname}"`,
  });
  return json({
    photo: {
      id: p.id, taken_at: p.taken_at, mime: p.mime, is_video: p.is_video,
      has_live: p.has_live, width: p.width, height: p.height,
      duration_s: p.duration_s, bytes: p.bytes, tier: p.tier,
      tier_override: p.tier_override, camera: [p.camera_make, p.camera_model]
        .filter(Boolean).join(" ") || null,
      ocr_excerpt: p.ocr_text ? (p.ocr_text as string).slice(0, 400) : null,
    },
    sources, tags: ptags, faces, urls,
  }, 200, origin);
}

function extOf(key: string): string {
  const i = key.lastIndexOf(".");
  return i >= 0 ? key.slice(i) : "";
}

async function handlePeople(origin: string | null, signer: Presigner): Promise<Response> {
  const { data, error } = await admin.from("people")
    .select("id, name, face_count, hidden, cover_bbox, cover_key, cover_photo, photos!people_cover_photo_fkey(r2_thumb)")
    .eq("hidden", false).order("face_count", { ascending: false });
  if (error) throw error;
  const people = [];
  for (const p of data ?? []) {
    // Prefer the pre-cropped square face (faces/<sha1>.webp). Fall back to the
    // whole thumb + bbox for rows the covers stage has not reached yet — the
    // client crops those itself from cover_bbox.
    const cropKey = p.cover_key as string | null;
    const thumbKey = (p.photos as { r2_thumb?: string } | null)?.r2_thumb;
    const key = cropKey ?? thumbKey;
    people.push({
      id: p.id, name: p.name, face_count: p.face_count, cover_bbox: p.cover_bbox,
      cover_cropped: !!cropKey,
      cover_url: key ? await signer.sign(key, TTL.thumb) : null,
    });
  }
  return json({ people }, 200, origin);
}

async function handlePersonUpdate(id: string, req: Request, origin: string | null): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 60) || null;
  if (typeof body.hidden === "boolean") patch.hidden = body.hidden;
  if (!Object.keys(patch).length) return json({ error: "nothing to update" }, 400, origin);
  const { error } = await admin.from("people").update(patch).eq("id", Number(id));
  if (error) throw error;
  return json({ ok: true }, 200, origin);
}

async function handleTier(id: string, req: Request, origin: string | null): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (!["library", "screenshot", "clutter"].includes(body.tier)) {
    return json({ error: "bad tier" }, 400, origin);
  }
  const { error } = await admin.from("photos")
    .update({ tier: body.tier, tier_override: true }).eq("id", id);
  if (error) throw error;
  return json({ ok: true }, 200, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

  // ---- auth gate (all endpoints) ----
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json({ error: "unauthorized" }, 401, origin);
  if (!OWNER_USER_ID || user.id !== OWNER_USER_ID) return json({ error: "forbidden" }, 403, origin);
  if (REQUIRE_AAL2) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.aal !== "aal2") return json({ error: "mfa_required" }, 403, origin);
    } catch {
      return json({ error: "forbidden" }, 403, origin);
    }
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/photo-api\/?/, "");
  try {
    const signer = await makePresigner(R2.accountId, R2.accessKeyId, R2.secretKey, R2.bucket);
    if (req.method === "GET" && path === "library") return await handleLibrary(origin);
    if (req.method === "POST" && path === "sign") return await handleSign(req, origin, signer);
    if (req.method === "GET" && path === "search") return await handleSearch(url, origin);
    if (req.method === "GET" && path === "people") return await handlePeople(origin, signer);
    if (req.method === "GET" && path === "verify-canary") {
      return json({ url: await signer.sign("_verify/canary.txt", TTL.canary) }, 200, origin);
    }
    let m = path.match(/^photo\/([0-9a-f-]{36})\/tier$/);
    if (req.method === "POST" && m) return await handleTier(m[1], req, origin);
    m = path.match(/^photo\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && m) return await handlePhoto(m[1], origin, signer);
    m = path.match(/^people\/(\d+)$/);
    if (req.method === "POST" && m) return await handlePersonUpdate(m[1], req, origin);
    return json({ error: "not found" }, 404, origin);
  } catch (e) {
    console.error("photo-api error:", (e as Error).message);
    return json({ error: "internal" }, 500, origin);
  }
});
