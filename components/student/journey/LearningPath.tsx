"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { LessonDayState } from "@/lib/api/types";

/** One real lesson/activity node - never one node per calendar day. A
 * day/week-slot that holds several lessons becomes that many separate
 * `PathNode`s, each gated and rendered independently. `kind: "checkin"` is
 * the one non-lesson node type (the schedule-policy end-of-week video task),
 * which opens a modal instead of linking anywhere. */
export interface PathNode {
  id: string;
  title: string;
  state: LessonDayState;
  kind?: "lesson" | "checkin";
  href?: string;
  day?: number;
  /** Real, already-loaded progress (e.g. "2 of 3 checkpoints done") for the
   * current node - never a fabricated fraction. Shown only when present. */
  progressLabel?: string;
  liveClassTitle?: string;
  groupLabel?: string;
}

/** Vertical, gently winding progression map - the Duolingo-style learning
 * path. Deliberately plain: a single column of connected circular nodes,
 * alternating a small horizontal offset for the "winding" feel via CSS only
 * (no animation library, respects `prefers-reduced-motion` through the
 * existing global rule that zeroes transition durations). */
export function LearningPath({
  nodes,
  compact = false,
  onLockedClick,
  onCheckinClick,
}: {
  nodes: PathNode[];
  compact?: boolean;
  onLockedClick?: (node: PathNode) => void;
  onCheckinClick?: (node: PathNode) => void;
}) {
  const currentRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!compact) currentRef.current?.scrollIntoView({ block: "center" });
    // Only ever auto-focus once, on the node list this page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ol className={`relative grid ${compact ? "gap-3" : "gap-4"} ps-1`}>
      {nodes.map((node, index) => {
        const isCurrent = node.state === "current";
        const offset = index % 2 === 0 ? "ms-0" : "ms-8";
        const circle =
          node.state === "done"
            ? "bg-gradient-to-br from-[#e8faf4] to-[#c9f3e2] text-[#0f9e78]"
            : node.state === "current"
            ? "bg-gradient-to-br from-brand-blue to-brand-selected text-white shadow-[0_8px_18px_rgb(var(--brand-shadow-rgb)/.45)]"
            : node.state === "missed"
            ? "bg-gradient-to-br from-brand-coral/15 to-brand-coral/5 text-brand-coral"
            : "bg-bg text-muted";
        const glyph = node.state === "done" ? "✓" : node.state === "missed" ? "!" : node.kind === "checkin" ? "🎥" : node.state === "locked" ? "🔒" : "●";
        const label = (
          <>
            <span className={`relative grid size-11 flex-none place-items-center rounded-full text-base font-bold ${circle} ${isCurrent ? "animate-pulse" : ""}`}>
              {glyph}
              {node.liveClassTitle && <i aria-hidden="true" title={node.liveClassTitle} className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full bg-accent-indigo not-italic ring-2 ring-card" />}
            </span>
            <span className="min-w-0">
              {node.groupLabel && <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">{node.groupLabel}</span>}
              <span className={`block truncate text-sm font-bold ${node.state === "locked" ? "text-muted" : "text-ink"}`}>{node.title}</span>
              {node.progressLabel && <span className="block text-xs text-brand-blue">{node.progressLabel}</span>}
            </span>
          </>
        );

        const row = (
          <li
            key={node.id}
            ref={isCurrent ? currentRef : undefined}
            className={`relative flex list-none items-center gap-3 ${offset} ${
              index < nodes.length - 1 ? "pb-4 before:absolute before:start-5.5 before:top-11 before:h-[calc(100%-2.75rem)] before:border-s-2 before:border-dashed before:border-line" : ""
            }`}
          >
            {node.kind === "checkin" ? (
              <button type="button" onClick={() => onCheckinClick?.(node)} className="flex min-h-11 flex-1 items-center gap-3 rounded-xl text-start transition-all hover:-translate-y-0.5">
                {label}
              </button>
            ) : node.state === "locked" ? (
              <button type="button" onClick={() => onLockedClick?.(node)} className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-xl text-start opacity-70">
                {label}
              </button>
            ) : (
              <Link href={node.href ?? "#"} className="flex min-h-11 flex-1 items-center gap-3 rounded-xl text-start transition-all hover:-translate-y-0.5">
                {label}
              </Link>
            )}
          </li>
        );
        return row;
      })}
    </ol>
  );
}
