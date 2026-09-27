import { revalidatePath, revalidateTag } from "next/cache";
import { connection } from "next/server";
import { RESET_CONFIRM_TEXT, executeCountReset, resolveResetScope } from "@/lib/count-reset";
import {
  MISSING_SERVICE_ROLE_ERROR,
  createServiceRoleClient,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function bustDashboardCache() {
  revalidatePath("/dashboard");
  revalidatePath("/api/dashboard/stats");
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidateTag("dashboard-metrics", { expire: 0 });
}

export async function POST(request: Request) {
  await connection();

  const admin = createServiceRoleClient();
  if (!admin) {
    console.error(MISSING_SERVICE_ROLE_ERROR);
    return Response.json(
      { ok: false, error: MISSING_SERVICE_ROLE_ERROR },
      { status: 500, headers: noStoreHeaders },
    );
  }

  let body: { app_id?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as { app_id?: unknown; confirm?: unknown };
  } catch {
    return Response.json(
      { ok: false, error: "リクエストが不正です。" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  if (String(body.confirm ?? "").trim() !== RESET_CONFIRM_TEXT) {
    return Response.json(
      { ok: false, error: `確認のため ${RESET_CONFIRM_TEXT} と入力してください。` },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const scope = resolveResetScope(body.app_id);
  if (!scope) {
    return Response.json(
      { ok: false, error: "app_id が不正です。" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const result = await executeCountReset(scope, admin);
  if (result.resetAt) {
    bustDashboardCache();
  }
  if (!result.ok) {
    console.error("[reset-counts] failed:", result.error, result.deleted);
    return Response.json(result, { status: 500, headers: noStoreHeaders });
  }

  return Response.json(
    {
      ok: true,
      app_id: scope,
      reset_at: result.resetAt,
      deleted: result.deleted,
    },
    { headers: noStoreHeaders },
  );
}
