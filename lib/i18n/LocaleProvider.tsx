"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ar } from "./messages/ar";
import { en, type Messages } from "./messages/en";
import { dirForLocale, LOCALE_COOKIE, type Locale } from "./locale";

const DICTIONARIES: Record<Locale, Messages> = { en, ar };

// Dot-path into the nested Messages object ("auth.login.title") - a plain
// string union of every leaf path, not just top-level keys, so `t()` stays
// typo-checked for every namespace depth without hand-writing one per level.
type DotPaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : DotPaths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];
export type MessageKey = DotPaths<Messages>;

function lookup(dict: Messages, path: string): string {
  const value = path.split(".").reduce<unknown>((node, segment) => {
    return typeof node === "object" && node !== null ? (node as Record<string, unknown>)[segment] : undefined;
  }, dict);
  // Falls back to the raw key rather than throwing: this is the seam where an
  // un-migrated string still lives as a hardcoded literal elsewhere, and a
  // missing key must never take down the page it's on.
  return typeof value === "string" ? value : path;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

interface I18nContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** `initialLocale` comes from the request's own cookie (read server-side in
 * `app/layout.tsx`), so the very first render already has the right language
 * - no flash of English before a client-side cookie read catches up. */
export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // 1 year, same as any other durable preference cookie on this app - not
    // sensitive, so no httpOnly/secure flags needed (nothing here is a session
    // credential). `path=/` so it applies regardless of which route set it.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // The root `<html lang dir>` attributes are set server-side from the same
    // cookie (see `app/layout.tsx`) so a fresh load never flashes the wrong
    // direction - but that only re-runs on a real navigation/refresh. Mutate
    // them directly too, so switching languages flips the whole page's
    // reading direction immediately, not on the next page load.
    document.documentElement.lang = next;
    document.documentElement.dir = dirForLocale(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dict = DICTIONARIES[locale];
    return {
      locale,
      dir: dirForLocale(locale),
      setLocale,
      t: (key, vars) => interpolate(lookup(dict, key), vars),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within a LocaleProvider");
  return ctx;
}
