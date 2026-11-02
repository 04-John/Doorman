// True on phone-sized screens. Pages switch to their mobile app layout below this width;
// desktop layouts stay exactly as they are above it.
import { useSyncExternalStore } from "react";

export const MOBILE_QUERY = "(max-width: 640px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
