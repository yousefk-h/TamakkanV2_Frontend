"use client";

import { useEffect, useState } from "react";

/** Returns `value`, but only after it has stopped changing for `delayMs` - a server-bound search box's one real
 * requirement: don't fire a request on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
