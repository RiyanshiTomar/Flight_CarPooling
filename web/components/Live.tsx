"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { service, type LiveEvent, type LiveStatus } from "@/lib/services";
import { useToast } from "./Toast";

type Handler = (e: LiveEvent) => void;
interface LiveCtx {
  status: LiveStatus;
  add(h: Handler): () => void;
}

const Ctx = createContext<LiveCtx>({ status: "offline", add: () => () => {} });

/**
 * One live connection for the whole logged-in app. Pages register handlers with useLiveEvents().
 * Events that carry a note ("Meera joined your group") become a toast, unless the page
 * that is open already shows that group (it handles the event itself).
 */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const handlers = useRef(new Set<Handler>());
  const toast = useToast();

  useEffect(() => {
    if (!service.auth.current()) return;
    return service.live.subscribe(
      (e) => {
        handlers.current.forEach((h) => h(e));
        const onThisGroup = e.groupId && typeof window !== "undefined" && window.location.pathname === `/group/${e.groupId}`;
        if (e.note && !onThisGroup) toast(e.note);
      },
      setStatus,
    );
  }, [toast]);

  const add = useCallback((h: Handler) => {
    handlers.current.add(h);
    return () => {
      handlers.current.delete(h);
    };
  }, []);
  const value = useMemo(() => ({ status, add }), [status, add]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Run `handler` for every live event while the component is mounted. */
export function useLiveEvents(handler: Handler) {
  const { add } = useContext(Ctx);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => add((e) => ref.current(e)), [add]);
}

export const useLiveStatus = () => useContext(Ctx).status;
