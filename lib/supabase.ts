import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function makeClient(key: string): SupabaseClient {
  return createClient(supabaseUrl || "https://placeholder.supabase.co", key || "placeholder", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const supabase = makeClient(supabaseAnonKey);

/** ダッシュボード集計用。service_role があれば RLS をバイパスする */
export const supabaseAdmin = makeClient(supabaseServiceRoleKey || supabaseAnonKey);
