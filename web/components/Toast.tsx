"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "error";
interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
}

const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});

/** Small, non-blocking notices ("Copied", "Meera joined your group"). Announced to screen readers. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, tone: Tone = "info") => {
    const id = ++seq.current;
    setItems((cur) => [...cur.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), tone === "error" ? 6000 : 4000);
  }, []);

  const icon: Record<Tone, IconName> = useMemo(() => ({ info: "bolt", success: "check", error: "alert" }), []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 md:top-auto md:bottom-6 md:right-6 md:left-auto md:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="toast-in pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-surface shadow-[var(--shadow-lg)]"
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                t.tone === "error" ? "bg-danger text-white" : t.tone === "success" ? "bg-accent text-white" : "bg-band text-white"
              }`}
            >
              <Icon name={icon[t.tone]} size={15} />
            </span>
            {t.text}
            <button
              className="ml-1 rounded-full p-1 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
              onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
