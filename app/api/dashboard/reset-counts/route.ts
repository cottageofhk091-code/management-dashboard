import { connection } from "next/server";
import { RESET_CONFIRM_TEXT, resolveResetScope, saveCountReset } from "@/lib/count-reset";
import { isSupabaseAdminConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  await connection();

  if (!isSupabaseAdminConfigured) {
    return Response.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY が未設定です。" },
      { status: 503 },
    );
  }

  let body: { app_id?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as { app_id?: unknown; confirm?: unknown };
  } catch {
    return Response.json({ ok: false, error: "リクエストが不正です。" }, { status: 400 });
  }

  if (String(body.confirm ?? "").trim() !== RESET_CONFIRM_TEXT) {
    return Response.json(
      { ok: false, error: `確認のため ${RESET_CONFIRM_TEXT} と入力してください。` },
      { status: 400 },
    );
  }

  const scope = resolveResetScope(body.app_id);
  if (!scope) {
    return Response.json({ ok: false, error: "app_id が不正です。" }, { status: 400 });
  }

  const result = await saveCountReset(scope);
  if (!result.ok) {
    return Response.json(result, { status: 500 });
  }

  return Response.json({
    ok: true,
    app_id: scope,
    reset_at: result.resetAt,
  });
}
