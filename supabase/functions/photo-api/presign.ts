// SigV4 query-string presigner for R2 GETs — hand-rolled on Web Crypto, no deps.
// The signing key is derived once per request batch; each URL costs one HMAC.

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw", key instanceof Uint8Array ? key.buffer as ArrayBuffer : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

async function sha256hex(data: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(data));
  return hex(new Uint8Array(d));
}

function hex(b: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// RFC 3986 strict encoding (SigV4 requirement)
function uriEncode(s: string, encodeSlash = true): string {
  let out = encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  if (!encodeSlash) out = out.replace(/%2F/g, "/");
  return out;
}

export interface Presigner {
  sign(key: string, expiresSec: number, extraParams?: Record<string, string>): Promise<string>;
}

export async function makePresigner(
  accountId: string, accessKeyId: string, secretKey: string, bucket: string,
): Promise<Presigner> {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;

  // key derivation chain — once per presigner
  let k: ArrayBuffer = await hmac(enc.encode("AWS4" + secretKey), dateStamp);
  k = await hmac(k, "auto");
  k = await hmac(k, "s3");
  const signingKey = await hmac(k, "aws4_request");

  return {
    async sign(key: string, expiresSec: number, extraParams: Record<string, string> = {}) {
      const path = `/${bucket}/` + key.split("/").map((seg) => uriEncode(seg)).join("/");
      const params: Record<string, string> = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": `${accessKeyId}/${scope}`,
        "X-Amz-Date": amzDate,
        "X-Amz-Expires": String(expiresSec),
        "X-Amz-SignedHeaders": "host",
        ...extraParams,
      };
      const canonicalQuery = Object.keys(params).sort()
        .map((p) => `${uriEncode(p)}=${uriEncode(params[p])}`).join("&");
      const canonicalRequest =
        `GET\n${path}\n${canonicalQuery}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
      const stringToSign =
        `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256hex(canonicalRequest)}`;
      const sig = hex(await hmac(signingKey, stringToSign));
      return `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${sig}`;
    },
  };
}
