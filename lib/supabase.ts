import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const MISSING_SERVICE_ROLE_ERROR =
  "SUPABASE_SERVICE_ROLE_KEY is missing in production";

const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

function supabaseUrl() {
  return env("NEXT_PUBLIC_SUPABASE_URL");
}

function supabaseAnonKey() {
  return env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

function jwtRole(key: string): string | null {
  if (!key.startsWith("eyJ")) return null;
  try {
    const payloadPart = key.split(".")[1];
    if (!payloadPart) return null;
    const json = Buffer.from(payloadPart, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** service_role / secret のみ。publishable / anon は使わない。 */
export function resolveServiceRoleKey(): string | null {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (!key) return null;
  if (key.startsWith("sb_publishable_")) return null;
  const role = jwtRole(key);
  if (role && role !== "service_role") return null;
  return key;
}

export function isSupabaseAdminConfigured() {
  return Boolean(supabaseUrl() && resolveServiceRoleKey());
}

export const isSupabaseConfigured = Boolean(supabaseUrl() && supabaseAnonKey());

export function describeSupabaseDebug() {
  const key = resolveServiceRoleKey() ?? "";
  let keyKind = "missing";
  if (key.startsWith("sb_secret_")) keyKind = "sb_secret";
  else if (key.startsWith("eyJ")) keyKind = "jwt";
  else if (key) keyKind = `other:${key.slice(0, 8)}`;

  return {
    url: supabaseUrl(),
    adminConfigured: isSupabaseAdminConfigured(),
    hasServiceRoleEnv: Boolean(env("SUPABASE_SERVICE_ROLE_KEY")),
    hasSecretKeyEnv: Boolean(env("SUPABASE_SECRET_KEY")),
    jwtRole: jwtRole(key),
    keyKind,
    keyLength: key.length,
  };
}

export const supabase = createClient(
  supabaseUrl() || "https://placeholder.supabase.co",
  supabaseAnonKey() || "placeholder",
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  },
);

let adminClient: SupabaseClient | null = null;
let adminClientKey = "";

function buildServiceRoleClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema: "public" },
    global: {
      fetch: noStoreFetch,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  });
}

/**
 * リセット API 用。毎回 process.env から service_role / secret を読んで Admin クライアントを作る。
 * anon / publishable にはフォールバックしない。
 */
export function createServiceRoleClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = resolveServiceRoleKey();
  if (!url || !key) return null;
  return buildServiceRoleClient(url, key);
}

/**
 * ダッシュボード集計専用。anon キーは使わず service_role のみ。
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = resolveServiceRoleKey();
  if (!url || !key) return null;
  if (!adminClient || adminClientKey !== key) {
    adminClient = buildServiceRoleClient(url, key);
    adminClientKey = key;
  }
  return adminClient;
}
