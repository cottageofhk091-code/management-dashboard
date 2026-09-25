"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * タブフォーカス・可視化・定期ポーリングで SSR データを再取得し、
 * 各アプリの生成回数・クレジット消費をほぼリアルタイムに反映する。
 */
export function LiveRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let last = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - last < 1500) return;
      last = now;
      router.refresh();
    };

    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refresh, intervalMs);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [router, intervalMs]);

  return null;
}
