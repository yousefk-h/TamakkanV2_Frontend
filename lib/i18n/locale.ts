/**
 * Localization scope (per product decision): UI chrome only - buttons, nav,
 * labels, error messages. Lesson/topic content (titles, transcripts, avatar
 * prompts) stays English-only for now, same as the vocabulary list's Arabic
 * field being a one-off content translation rather than a sign content
 * localization is in scope generally.
 *
 * Deliberately NOT next-intl/App Router locale segments (`app/[locale]/...`):
 * every route here sits behind a login (admin/student dashboards), so a
 * locale-prefixed URL buys nothing SEO-wise and would mean moving every
 * existing route - a large, purely mechanical, high-risk change for zero
 * behavioral gain. A cookie-selected locale read once per request (see
 * `app/layout.tsx`) is the same UX (persists across visits, no flash of the
 * wrong language) without the route restructure.
 */

import { brand } from "../branding";

export type Locale = "en" | "ar";

export const LOCALES: Locale[] = ["en", "ar"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = `${brand.id}_locale`;

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "ar";
}

export function dirForLocale(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
