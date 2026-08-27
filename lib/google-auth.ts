import { createSign } from "node:crypto";

/**
 * Minimal Google service-account OAuth2 client.
 * Reads GOOGLE_SERVICE_ACCOUNT_JSON and mints a scoped access token.
 * Caches until 60s before expiry to avoid re-signing on every warm request.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cached: { token: string; expiresAt: number; scope: string } | null = null;

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new GoogleAuthNotConfiguredError();
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing client_email or private_key");
  }
  return parsed;
}

export function googleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=+$/, "").replaceAll("+", "-").replaceAll("/", "_");
}

export async function getAccessToken(scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.scope === scope && cached.expiresAt - 60 > now) return cached.token;

  const sa = serviceAccount();
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const sig = b64url(signer.sign(sa.private_key.replaceAll("\\n", "\n")));
  const assertion = `${signingInput}.${sig}`;

  const res = await fetch(claims.aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: now + data.expires_in, scope };
  return data.access_token;
}

export class GoogleAuthNotConfiguredError extends Error {
  constructor() {
    super("Google service account not configured");
    this.name = "GoogleAuthNotConfiguredError";
  }
}
