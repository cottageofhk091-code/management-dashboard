import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isSupabaseAdminConfigured = Boolean(
  supabaseUrl && supabaseServiceRoleKey,
);

export function describeSupabaseDebug() {
  const key = supabaseServiceRoleKey;
  let keyKind = "missing";
  if (key.startsWith("sb_secret_")) keyKind = "sb_secret";
  else if (key.startsWith("sb_publishable_")) keyKind = "sb_publishable";
  else if (key.startsWith("eyJ")) keyKind = "jwt";
  else if (key) keyKind = `other:${key.slice(0, 8)}`;

  return {
    url: supabaseUrl,
    adminConfigured: isSupabaseAdminConfigured,
    keyKind,
    keyLength: key.length,
  };
}

const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  },
);

let adminClient: SupabaseClient | null = null;

/**
 * ダッシュボード集計専用。anon キーは使わず service_role のみ。
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseAdminConfigured) return null;
  if (!adminClient) {
    adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: noStoreFetch },
    });
  }
  return adminClient;
}
