export const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("");

/** The backend's datetimes are naive-UTC with no "Z"/offset suffix (see
 * the backend's `app.utils.time.utcnow` - Mongo has no timezone concept).
 * `new Date(...)` on a string with no timezone designator parses it as the
 * *browser's local time*, not UTC - appending "Z" when it's missing is what
 * makes every timestamp from this API actually mean UTC once parsed, instead
 * of silently drifting by the viewer's local offset. */
export function asUtcIso(iso: string): string {
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
}

// A fixed locale/timezone, not the runtime default: the server and the
// browser rarely agree on locale, and `toLocaleDateString()` with no
// arguments silently picks up whichever one the current environment has -
// different results between the server-rendered HTML and the client's first
// render is exactly what causes a hydration mismatch.
export const formatDate = (iso: string) => new Date(asUtcIso(iso)).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export const formatDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Same fixed UTC timezone as `formatDate`, for the same reason - avoids a
 * server/client hydration mismatch on the runtime's local timezone. Used for
 * a scheduled class's date + time together (e.g. "Aug 20, 2026, 5:30 PM"). */
export const formatDateTime = (iso: string) =>
  new Date(asUtcIso(iso)).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/** Accepts every shape YouTube URLs actually come in - watch?v=, youtu.be/,
 * and an existing embed/ link - since a topic's YouTube URL is admin-entered
 * free text (see ProgramBuilder), not a guaranteed single format. */
export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1) || null;
    if (parsed.hostname.endsWith("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) return v;
      const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
      if (embedMatch) return embedMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}
