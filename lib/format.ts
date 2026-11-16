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

/** A chat message's own time-of-day, e.g. "9:30 AM" - the viewer's local
 * time (not the fixed-UTC convention above): a message timestamp is
 * inherently about "when did I see/send this", which only means something
 * in the viewer's own clock. Safe here because every caller is a client-only
 * chat UI that fetches its data after mount, not something server-rendered. */
export const formatMessageTime = (iso: string) =>
  new Date(asUtcIso(iso)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** A chat date separator - "Today"/"Yesterday" in the viewer's own local
 * calendar day, falling back to a plain date further back. `today` is
 * passed in (rather than read via `new Date()` inside) so a list of
 * messages rendered in one pass agrees on what "today" means even if the
 * render straddles midnight mid-scroll. */
export function formatDaySeparator(iso: string, today: Date = new Date()): string {
  const date = new Date(asUtcIso(iso));
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { year: diffDays > 300 ? "numeric" : undefined, month: "short", day: "numeric" });
}

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
