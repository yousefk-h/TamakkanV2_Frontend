"use client";

import { useId } from "react";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Hand-rolled inline SVG line+area chart - no charting library, matches the
 * pre-rewrite implementation. `useId` keeps the gradient id collision-free
 * when multiple charts render on one page (the old code hand-picked distinct
 * static ids like "fade"/"fade2"/"fade3" for exactly this reason). */
export function TrendChart({
  points,
  labels,
  ariaLabel,
}: {
  points: number[];
  labels: string[];
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const resolvedAriaLabel = ariaLabel ?? t("shared.scoreTrend");
  const gradientId = useId();
  const w = 600;
  const h = 190;
  const min = 0;
  const max = 100;
  // Match the labeled 0-100 axis. A single real report is a point, not a
  // fabricated trend or a division by zero.
  const coords = points.map((p, i) => `${points.length === 1 ? w / 2 : (i / (points.length - 1)) * w},${h - ((Math.min(Math.max(p, min), max) - min) / (max - min)) * h}`);
  const linePath = coords.length ? "M" + coords.join(" L") : "";
  const areaPath = coords.length > 1 ? `${linePath} L${w},${h} L0,${h} Z` : "";

  return (
    <div className="flex h-[225px]">
      <div className="flex flex-col justify-between py-1.5 pr-2.5 pb-[17px] text-[11px] text-muted">
        <span>100</span>
        <span>75</span>
        <span>50</span>
        <span>25</span>
        <span>0</span>
      </div>
      {/* `overflow-hidden` here, not on the svg itself: the svg's own
          `overflow-visible` is needed so its round line-caps aren't clipped
          right at a plotted point (e.g. a min/max score sitting exactly on
          the viewBox edge) - but that same visible overflow let the stroke's
          ~2px cap bleed past this row's own box and visually touch/cross the
          card's bottom edge at some widths. Clipping at this outer wrapper
          instead contains that bleed within the 8px/24px top/bottom insets
          already reserved below (`top-2`/`bottom-6` on the svg), so the
          round caps still render in full without ever reaching the card's
          own padding or border. */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-x-0 top-[5px] bottom-[18px] flex flex-col justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <i key={i} className="border-t border-dashed border-line not-italic" />
          ))}
        </div>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          aria-label={resolvedAriaLabel}
          // `h-[calc(100%-2rem)]` (not `bottom-6`, alongside `top-2`): an
          // <svg> with a viewBox is a replaced element with its own
          // intrinsic aspect ratio, so when only `width` is definite (from
          // `w-full`) and `height` is left `auto`, the browser sizes it from
          // that aspect ratio instead of stretching between `top`/`bottom` -
          // it silently ignored `bottom-6` and rendered ~46px taller than
          // this row actually has room for. An explicit height (matching
          // `top-2`'s 8px + the 24px this reserves below) makes it fill
          // exactly the intended box, so the plotted points land at the same
          // physical height as the "0" gridline/label they're drawn against.
          className="absolute inset-x-0 top-2 h-[calc(100%-2rem)] w-full overflow-visible"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-brand-blue)" stopOpacity=".22" />
              <stop offset="1" stopColor="var(--color-brand-blue)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path fill={`url(#${gradientId})`} d={areaPath} />
          <path fill="none" stroke="var(--color-brand-blue)" strokeWidth={4} strokeLinecap="round" d={linePath} />
          {points.length === 1 && <circle cx={w / 2} cy={h - Math.min(Math.max(points[0], min), max) / max * h} r={4} fill="var(--color-brand-blue)" />}
        </svg>
        <div
          className="absolute inset-x-0 bottom-0 grid text-[11px] text-muted"
          style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
        >
          {labels.map((l, i) => (
            // Each label gets its own fixed-width column (never `flex
            // justify-between`, which spaces items by the free space
            // *between* them, not by an even slot width - with several
            // "Aug 24, 2026"-length labels packed into a ~600px chart, that
            // let neighboring labels' text visually run into each other).
            // Consecutive sessions on the same calendar day repeat the same
            // label - skip the repeat rather than show the identical date
            // shoulder-to-shoulder with itself.
            <span key={i} title={l} className="overflow-hidden truncate text-center">
              {i === 0 || l !== labels[i - 1] ? l : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
