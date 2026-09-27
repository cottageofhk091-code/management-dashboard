"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { RESET_CONFIRM_TEXT } from "@/lib/count-reset-shared";

export function ResetCountsButton({
  appId,
  appName,
}: {
  appId: string;
  appName: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAll = appId === "all";
  const buttonLabel = isAll
    ? "全アプリのカウントをリセット"
    : `${appName} のカウントをリセット`;
  const message = isAll
    ? "本当に対象の全アプリの集計カウント（分析数・登録ログ）をリセットしますか？この操作は取り消せません。"
    : `本当に ${appName} の集計カウントをリセットしますか？この操作は取り消せません。`;

  const canSubmit =
    acknowledged && confirmText.trim() === RESET_CONFIRM_TEXT && !pending;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setConfirmText("");
    setAcknowledged(false);
    setError(null);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/reset-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          app_id: isAll ? "all" : appId,
          confirm: RESET_CONFIRM_TEXT,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error || `リセットに失敗しました（${res.status}）。`);
        return;
      }
      setOpen(false);
      setConfirmText("");
      setAcknowledged(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "リセットに失敗しました。");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100"
      >
        {buttonLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              カウントリセットの確認
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{message}</p>
            <p className="mt-2 text-xs text-zinc-400">
              生データは残し、この時刻以降の集計だけを表示します。
            </p>

            <label className="mt-4 flex items-start gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>リセットの影響を理解し、取り消せないことを確認しました。</span>
            </label>

            <label className="mt-3 block text-sm text-zinc-700">
              確認のため <span className="font-mono font-semibold">{RESET_CONFIRM_TEXT}</span>{" "}
              と入力してください
              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-rose-400"
                placeholder={RESET_CONFIRM_TEXT}
                autoComplete="off"
              />
            </label>

            {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-rose-300"
              >
                {pending ? "リセット中..." : "リセットする"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
