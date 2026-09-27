import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canonicalAppId, findProduct, type ProductId } from "@/lib/products";
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

export async function saveCountReset(
  scope: "all" | ProductId,
): Promise<{ ok: true; resetAt: string } | { ok: false; error: string; sql?: string }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY が未設定です。" };
  }

  const resetAt = new Date().toISOString();
  const row = {
    key: resetSettingsKey(scope),
    value: resetAt,
    updated_at: resetAt,
  };

  const { error } = await client.from(SETTINGS_TABLE).upsert(row, { onConflict: "key" });
  if (!error) return { ok: true, resetAt };

  try {
    await writeFileReset(scope, resetAt);
    return { ok: true, resetAt };
  } catch (fileErr) {
    const message = error.message || "system_settings への保存に失敗しました。";
    return {
      ok: false,
      error: `リセット起点の保存に失敗しました: ${message}${
        fileErr instanceof Error ? ` / ${fileErr.message}` : ""
      }`,
      sql: `create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.system_settings to service_role;`,
    };
  }
}
