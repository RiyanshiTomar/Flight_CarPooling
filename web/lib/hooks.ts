"use client";

import { useSyncExternalStore } from "react";
import { service } from "./services";

const noSubscribe = () => () => {};

/** false during server render and hydration, true afterwards. For values like "today" that must not be baked into HTML. */
export function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

function onStorage(cb: () => void) {
  window.addEventListener("storage", cb); // login/logout in another tab
  return () => window.removeEventListener("storage", cb);
}

/** null while unknown (server render), then whether someone is logged in on this device. */
export function useHasSession(): boolean | null {
  return useSyncExternalStore(onStorage, () => !!service.auth.current(), () => null);
}
