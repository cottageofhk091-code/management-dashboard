import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aliasesForReset, canonicalAppId, findProduct, type ProductId } from "@/lib/products";
import {
  GLOBAL_RESET_SCOPE,
  RESET_KEY_PREFIX,
  SETTINGS_INIT_MESSAGE,
  SETTINGS_INIT_SQL,
} from "@/lib/count-reset-shared";

export {
  GLOBAL_RESET_SCOPE,
  RESET_KEY_PREFIX,
  RESET_CONFIRM_TEXT,
  SETTINGS_INIT_SQL,
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

  try {
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
  } catch (err) {
    console.error("[count-reset] system_settings select threw:", err);
  }

  try {
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
  } catch (err) {
    console.error("[count-reset] analytics_events reset select threw:", err);
  }

  const fileStore = await readFileResets();
  for (const [scope, value] of Object.entries(fileStore)) {
    applyReset(map, scope, parseResetDate(value));
  }

  return map;
}

function allowEphemeralFileReset() {
  return process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production";
}

function isIgnorableColumnError(message: string) {
  return /PGRST204|42703|column .* does not exist|Could not find the .* column/i.test(
    message,
  );
}

function shortError(error: { message?: string; code?: string } | null) {
  if (!error) return null;
  return error.message || error.code || null;
}

function errorBlob(error: { message?: string; code?: string; details?: string; hint?: string } | null) {
  if (!error) return "";
  return `${error.message ?? ""} ${error.code ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
}

export async function saveCountReset(
  scope: "all" | ProductId,
  client?: SupabaseClient | null,
): Promise<{
  ok: true;
  resetAt: string;
  settingsMissing?: boolean;
} | {
  ok: false;
  error: string;
  sql?: string;
  code?: string;
}> {
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

  let settingsMissing = false;

  try {
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

    const blob = errorBlob(settings.error);
    console.error("[count-reset] system_settings upsert failed:", settings.error);
    if (isMissingTable(blob)) {
      settingsMissing = true;
    }
  } catch (err) {
    console.error("[count-reset] system_settings upsert threw:", err);
    settingsMissing = true;
  }

  try {
    const eventInsert = await admin.from("analytics_events").insert({
      app_id: FALLBACK_APP_ID,
      event_type: FALLBACK_EVENT_TYPE,
      metadata: { scope, reset_at: resetAt },
    });
    if (eventInsert.error) {
      console.error("[count-reset] analytics_events reset insert failed:", eventInsert.error);
    }
  } catch (err) {
    console.error("[count-reset] analytics_events reset insert threw:", err);
  }

  if (allowEphemeralFileReset()) {
    try {
      await writeFileReset(scope, resetAt);
    } catch (fileErr) {
      console.error("[count-reset] local file fallback failed:", fileErr);
    }
  }

  // system_settings が無くても DELETE フォールバックへ進む
  return { ok: true, resetAt, settingsMissing };
}

export type DeleteResult = { table: string; deleted: number | null; error: string | null };

async function deleteMatchingRows(
  client: SupabaseClient,
  table: string,
  columns: string[],
  aliases: string[] | null,
): Promise<DeleteResult> {
  try {
    if (!aliases) {
      const { error, count } = await client
        .from(table)
        .delete({ count: "exact" })
        .gte("created_at", "1970-01-01T00:00:00.000Z");
      if (error) {
        console.error(`[count-reset] DELETE ${table}`, error);
        if (isMissingTable(errorBlob(error))) {
          return { table, deleted: 0, error: shortError(error) };
        }
      }
      return {
        table,
        deleted: count ?? null,
        error: shortError(error),
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
        console.error(`[count-reset] DELETE ${table}.${column}`, error);
        const blob = errorBlob(error);
        if (isIgnorableColumnError(blob)) {
          continue;
        }
        lastError = shortError(error);
        continue;
      }
      deleted += count ?? 0;
    }
    return { table, deleted, error: lastError };
  } catch (err) {
    console.error(`[count-reset] DELETE ${table} threw:`, err);
    return {
      table,
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function resetProfileCredits(
  client: SupabaseClient,
  aliases: string[] | null,
): Promise<DeleteResult> {
  try {
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
      const blob = errorBlob(error);
      lastError = shortError(error);
      if (isMissingTable(blob) || isIgnorableColumnError(blob)) {
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
      lastError = shortError(retry.error);
      if (isMissingTable(errorBlob(retry.error))) {
        return { table: "users_profiles", deleted: 0, error: null };
      }
    }

    if (lastError && isMissingTable(lastError)) {
      return { table: "users_profiles", deleted: 0, error: null };
    }
    return { table: "users_profiles", deleted: 0, error: lastError };
  } catch (err) {
    console.error("[count-reset] UPDATE users_profiles threw:", err);
    return { table: "users_profiles", deleted: 0, error: null };
  }
}

export async function executeCountReset(
  scope: "all" | ProductId,
  client: SupabaseClient,
): Promise<{
  ok: boolean;
  resetAt?: string;
  error?: string;
  hint?: string;
  sql?: string;
  code?: string;
  deleted: DeleteResult[];
}> {
  let saved: Awaited<ReturnType<typeof saveCountReset>>;
  try {
    saved = await saveCountReset(scope, client);
  } catch (err) {
    console.error("[count-reset] saveCountReset threw:", err);
    saved = {
      ok: true,
      resetAt: new Date().toISOString(),
      settingsMissing: true,
    };
  }

  if (!saved.ok) {
    return { ok: false, error: saved.error, sql: saved.sql, code: saved.code, deleted: [] };
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

  const logErrors = deleted.filter(
    (row) => row.table !== "users_profiles" && row.error && !isMissingTable(row.error),
  );
  if (logErrors.length === 0) {
    return {
      ok: true,
      resetAt: saved.resetAt,
      deleted,
    };
  }

  if (logErrors.some((row) => /permission denied|42501/i.test(row.error ?? ""))) {
    return {
      ok: false,
      resetAt: saved.resetAt,
      error: "データの削除に失敗しました。service_role に DELETE / UPDATE 権限があるか確認してください。",
      deleted,
    };
  }

  if (saved.settingsMissing || logErrors.some((row) => isMissingTable(row.error ?? ""))) {
    return {
      ok: false,
      resetAt: saved.resetAt,
      code: "SETTINGS_TABLE_MISSING",
      error: SETTINGS_INIT_MESSAGE,
      hint: "Supabase で SQL を実行してください",
      sql: SETTINGS_INIT_SQL,
      deleted,
    };
  }

  return {
    ok: false,
    resetAt: saved.resetAt,
    error: "リセットに失敗しました。",
    deleted,
  };
}
