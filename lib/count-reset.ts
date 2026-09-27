import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aliasesForReset, canonicalAppId, findProduct, type ProductId } from "@/lib/products";
import {
  GLOBAL_RESET_SCOPE,
  RESET_KEY_PREFIX,
} from "@/lib/count-reset-shared";

export {
  GLOBAL_RESET_SCOPE,
  RESET_KEY_PREFIX,
  RESET_CONFIRM_TEXT,
} from "@/lib/count-reset-shared";

export type CountResetMap = {
  all: Date | null;
  byApp: Partial<Record<ProductId, Date>>;
};

const SETTINGS_TABLE = "system_settings";
const FALLBACK_APP_ID = "__dashboard__";
const FALLBACK_EVENT_TYPE = "count_reset";

function parseResetDate(value: unknown): Date | null {
  if (value == null) return null;
  const raw = typeof value === "string" ? value : String(value);
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resetSettingsKey(scope: string) {
  return `${RESET_KEY_PREFIX}${scope}`;
}

export function laterDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export function laterIso(a: string | null | undefined, b: Date | null): string | null {
  const fromIso = a ? parseResetDate(a) : null;
  const latest = laterDate(fromIso, b);
  return latest ? latest.toISOString() : a ?? null;
}

export function effectiveResetAt(
  map: CountResetMap,
  appId: string | "all",
): Date | null {
  if (appId === "all") return map.all;
  const product = findProduct(appId);
  const id = product?.id;
  return laterDate(map.all, id ? map.byApp[id] ?? null : null);
}

export function rowPassesCountReset(
  appKey: string,
  createdAt: Date | null,
  map: CountResetMap,
): boolean {
  const product = appKey ? findProduct(appKey) : null;
  const reset = product ? effectiveResetAt(map, product.id) : map.all;
  if (!reset) return true;
  if (!createdAt) return false;
  return createdAt.getTime() >= reset.getTime();
}

export function resolveResetScope(appId: unknown): "all" | ProductId | null {
  if (appId == null || appId === "" || appId === "all") return "all";
  if (typeof appId !== "string") return null;
  const canonical = canonicalAppId(appId);
  return canonical === "all" ? null : canonical;
}

function emptyResetMap(): CountResetMap {
  return { all: null, byApp: {} };
}

async function resetFilePath() {
  const localDir = path.join(process.cwd(), ".data");
  try {
    await mkdir(localDir, { recursive: true });
    return path.join(localDir, "count-resets.json");
  } catch {
    return path.join(tmpdir(), "dashboard-count-resets.json");
  }
}

async function readFileResets(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(await resetFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeFileReset(scope: string, resetAt: string) {
  const file = await resetFilePath();
  const current = await readFileResets();
  current[scope] = resetAt;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(current, null, 2), "utf8");
}

function isMissingTable(message: string) {
  return /schema cache|could not find the table|does not exist|PGRST205/i.test(
    message,
  );
}

function applyReset(map: CountResetMap, scope: string, at: Date | null) {
  if (!at) return;
  if (scope === GLOBAL_RESET_SCOPE) {
    map.all = laterDate(map.all, at);
    return;
  }
  const product = findProduct(scope);
  if (product) {
    map.byApp[product.id] = laterDate(map.byApp[product.id] ?? null, at) ?? at;
  }
}

export async function getCountResetMap(): Promise<CountResetMap> {
  const client = getSupabaseAdmin();
  if (!client) return emptyResetMap();

  const map = emptyResetMap();

  const settings = await client
    .from(SETTINGS_TABLE)
    .select("key, value")
    .like("key", `${RESET_KEY_PREFIX}%`);

  if (!settings.error) {
    for (const row of settings.data ?? []) {
      const key = String(row.key ?? "");
      applyReset(map, key.slice(RESET_KEY_PREFIX.length), parseResetDate(row.value));
    }
  } else if (!isMissingTable(`${settings.error.message} ${settings.error.code ?? ""}`)) {
    console.error("[count-reset] load settings failed:", settings.error.message);
  }

  const events = await client
    .from("analytics_events")
    .select("metadata, created_at")
    .eq("app_id", FALLBACK_APP_ID)
    .eq("event_type", FALLBACK_EVENT_TYPE);

  if (!events.error) {
    for (const row of events.data ?? []) {
      const metadata = (row.metadata ?? {}) as { scope?: string; reset_at?: string };
      const scope = metadata.scope || GLOBAL_RESET_SCOPE;
      applyReset(map, scope, parseResetDate(metadata.reset_at) ?? parseResetDate(row.created_at));
    }
  }

  const fileStore = await readFileResets();
  for (const [scope, value] of Object.entries(fileStore)) {
    applyReset(map, scope, parseResetDate(value));
  }

  return map;
}

const SETTINGS_SQL = `create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.system_settings to service_role;`;

function allowEphemeralFileReset() {
  return process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production";
}

function formatMutationError(table: string, error: { message?: string; code?: string; details?: string; hint?: string } | null) {
  if (!error) return null;
  return JSON.stringify({
    table,
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

function isIgnorableColumnError(message: string) {
  return /schema cache|does not exist|column|42703|PGRST204/i.test(message);
}

export async function saveCountReset(
  scope: "all" | ProductId,
  client?: SupabaseClient | null,
): Promise<{ ok: true; resetAt: string } | { ok: false; error: string; sql?: string }> {
  const admin = client ?? getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing in production" };
  }

  const resetAt = new Date().toISOString();
  const row = {
    key: resetSettingsKey(scope),
    value: resetAt,
    updated_at: resetAt,
  };

  const settings = await admin.from(SETTINGS_TABLE).upsert(row, { onConflict: "key" });
  if (!settings.error) {
    if (allowEphemeralFileReset()) {
      try {
        await writeFileReset(scope, resetAt);
      } catch (fileErr) {
        console.error("[count-reset] local file fallback failed:", fileErr);
      }
    }
    return { ok: true, resetAt };
  }

  console.error("[count-reset] system_settings upsert failed:", settings.error);
  let persisted = false;

  const eventInsert = await admin.from("analytics_events").insert({
    app_id: FALLBACK_APP_ID,
    event_type: FALLBACK_EVENT_TYPE,
    metadata: { scope, reset_at: resetAt },
  });
  if (!eventInsert.error) {
    persisted = true;
  } else {
    console.error("[count-reset] analytics_events reset insert failed:", eventInsert.error);
  }

  if (allowEphemeralFileReset()) {
    try {
      await writeFileReset(scope, resetAt);
      persisted = true;
    } catch (fileErr) {
      console.error("[count-reset] local file fallback failed:", fileErr);
    }
  }

  if (persisted) {
    return { ok: true, resetAt };
  }

  return {
    ok: false,
    error: formatMutationError(SETTINGS_TABLE, settings.error) ?? settings.error.message,
    sql: SETTINGS_SQL,
  };
}

export type DeleteResult = { table: string; deleted: number | null; error: string | null };

async function deleteMatchingRows(
  client: SupabaseClient,
  table: string,
  columns: string[],
  aliases: string[] | null,
): Promise<DeleteResult> {
  if (!aliases) {
    const { error, count } = await client
      .from(table)
      .delete({ count: "exact" })
      .gte("created_at", "1970-01-01T00:00:00.000Z");
    if (error) {
      console.error(`[count-reset] DELETE ${table}`, error);
    }
    return {
      table,
      deleted: count ?? null,
      error: formatMutationError(table, error),
    };
  }

  let deleted = 0;
  let lastError: string | null = null;
  for (const column of columns) {
    const { error, count } = await client
      .from(table)
      .delete({ count: "exact" })
      .in(column, aliases);
    if (error) {
      const packed = formatMutationError(table, error);
      console.error(`[count-reset] DELETE ${table}.${column}`, error);
      if (isIgnorableColumnError(`${error.message} ${error.code ?? ""}`)) {
        continue;
      }
      lastError = packed;
      continue;
    }
    deleted += count ?? 0;
  }
  return { table, deleted, error: lastError };
}

async function resetProfileCredits(
  client: SupabaseClient,
  aliases: string[] | null,
): Promise<DeleteResult> {
  const payloads: Record<string, unknown>[] = [
    { free_pro_credits: 1, has_used_pro_trial: false, free_credits: 1 },
    { free_pro_credits: 1, free_credits: 1 },
    { free_pro_credits: 1 },
  ];

  let lastError: string | null = null;
  for (const payload of payloads) {
    let query = client.from("users_profiles").update(payload, { count: "exact" });
    query = aliases
      ? query.in("app_name", aliases)
      : query.gte("created_at", "1970-01-01T00:00:00.000Z");
    const { error, count } = await query;
    if (!error) {
      return { table: "users_profiles", deleted: count ?? null, error: null };
    }
    console.error("[count-reset] UPDATE users_profiles", error);
    lastError = formatMutationError("users_profiles", error);
    if (isIgnorableColumnError(`${error.message} ${error.code ?? ""}`)) {
      continue;
    }
    break;
  }

  if (aliases) {
    const retry = await client
      .from("users_profiles")
      .update({ free_pro_credits: 1 }, { count: "exact" })
      .in("app_id", aliases);
    if (!retry.error) {
      return { table: "users_profiles", deleted: retry.count ?? null, error: null };
    }
    console.error("[count-reset] UPDATE users_profiles app_id", retry.error);
    lastError = formatMutationError("users_profiles", retry.error);
  }

  return { table: "users_profiles", deleted: 0, error: lastError };
}

export async function executeCountReset(
  scope: "all" | ProductId,
  client: SupabaseClient,
): Promise<{
  ok: boolean;
  resetAt?: string;
  error?: string;
  sql?: string;
  deleted: DeleteResult[];
}> {
  const saved = await saveCountReset(scope, client);
  if (!saved.ok) {
    return { ok: false, error: saved.error, sql: saved.sql, deleted: [] };
  }

  const aliases = aliasesForReset(scope);
  let deleted: DeleteResult[] = [];
  try {
    deleted = await Promise.all([
      deleteMatchingRows(client, "analytics_events", ["app_id", "app_name"], aliases),
      deleteMatchingRows(client, "app_logs", ["app_name", "app_id"], aliases),
      resetProfileCredits(client, aliases),
    ]);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[count-reset] mutation threw:", err);
    deleted = [{ table: "reset_deletes", deleted: 0, error }];
  }

  const mutationErrors = deleted.filter((row) => row.error).map((row) => row.error as string);
  if (mutationErrors.length > 0) {
    return {
      ok: false,
      resetAt: saved.resetAt,
      error: mutationErrors.join("\n"),
      deleted,
    };
  }

  return {
    ok: true,
    resetAt: saved.resetAt,
    deleted,
  };
}
