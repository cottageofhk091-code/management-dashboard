export const GLOBAL_RESET_SCOPE = "all";
export const RESET_KEY_PREFIX = "dashboard.count_reset.";
export const RESET_CONFIRM_TEXT = "RESET";

export const SETTINGS_INIT_SQL = `create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table if exists public.system_settings enable row level security;
grant select, insert, update on public.system_settings to service_role;`;

export const SETTINGS_INIT_MESSAGE =
  "データベースの初期化が必要です。Supabase の SQL Editor で次の SQL を実行してください。";

function looksLikeJsonBlob(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function extractErrorText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    if (!looksLikeJsonBlob(value)) return value;
    try {
      return extractErrorText(JSON.parse(value));
    } catch {
      return "";
    }
  }
  if (typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  const nested = [record.message, record.error, record.details, record.hint]
    .map((part) => (typeof part === "string" ? part : ""))
    .filter(Boolean)
    .join(" ");
  if (nested) return nested;
  const table = typeof record.table === "string" ? record.table : "";
  const code = typeof record.code === "string" ? record.code : "";
  return [table, code].filter(Boolean).join(" ");
}

export function formatResetErrorForUi(input: {
  error?: string | null;
  hint?: string | null;
  sql?: string | null;
  code?: string | null;
  status?: number;
}): string {
  const raw = [input.error, input.hint, input.code].filter(Boolean).join("\n");
  const text = extractErrorText(input.error ?? "") || raw;

  if (
    input.code === "SETTINGS_TABLE_MISSING" ||
    /PGRST205|system_settings/i.test(`${text}\n${raw}`)
  ) {
    return [SETTINGS_INIT_MESSAGE, input.sql || SETTINGS_INIT_SQL].join("\n\n");
  }

  if (/missing in production/i.test(text)) {
    return "本番環境の SUPABASE_SERVICE_ROLE_KEY が未設定です。Vercel の環境変数を確認してください。";
  }

  if (/permission denied|42501/i.test(text)) {
    return "データの削除に失敗しました。service_role に DELETE / UPDATE 権限があるか確認してください。";
  }

  if (text && !looksLikeJsonBlob(text)) return text;
  if (input.status) return `リセットに失敗しました（${input.status}）。`;
  return "リセットに失敗しました。";
}
