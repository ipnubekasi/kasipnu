"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { friendlyError, type FriendlyError } from "@/lib/errors";

/**
 * Peringatan ketika meninggalkan formulir yang belum disimpan: menutup tab,
 * memuat ulang, tombol kembali peramban, dan klik tautan di dalam aplikasi.
 */
export function useUnsavedWarning(dirty: boolean, message = "Perubahan belum disimpan. Tinggalkan halaman ini?") {
  React.useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.skipUnsaved !== undefined) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}

/**
 * Menjalankan satu aksi tulis: mencegah klik ganda, menampilkan umpan balik,
 * dan menyegarkan data halaman setelah berhasil.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<FriendlyError | null>(null);
  const busy = React.useRef(false);

  const run = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async <T = any,>(
      fn: () => PromiseLike<unknown>,
      opts: { success?: string | ((d: T) => string); onSuccess?: (d: T) => void; refresh?: boolean; toastError?: boolean } = {},
    ): Promise<T | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        const res = (await fn()) as { data?: T; error?: unknown };
        if (res && typeof res === "object" && "error" in res && res.error) throw res.error;
        const data = (res && typeof res === "object" && "data" in res ? res.data : res) as T;
        if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(data) : opts.success);
        opts.onSuccess?.(data);
        if (opts.refresh !== false) router.refresh();
        return data;
      } catch (e) {
        const f = friendlyError(e as Error);
        setError(f);
        if (opts.toastError !== false) toast.error(f.message, { description: f.hint });
        return undefined;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending, error, clearError: () => setError(null) };
}

/** Memperbarui parameter URL (filter) tanpa kehilangan parameter lain. */
export function useUrlParams() {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const set = React.useCallback(
    (changes: Record<string, string | null | undefined>, opts: { resetPage?: boolean } = { resetPage: true }) => {
      const sp = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === undefined || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      if (opts.resetPage !== false && !("hal" in changes)) sp.delete("hal");
      const q = sp.toString();
      startTransition(() => router.replace(`${window.location.pathname}${q ? `?${q}` : ""}`, { scroll: false }));
    },
    [router],
  );
  return { set, isPending };
}
