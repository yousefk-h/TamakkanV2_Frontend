import type { ReactNode } from "react";

export function PageHead({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{eyebrow}</span>
        <h2 className="my-1 text-2xl tracking-tight text-ink">{title}</h2>
        <p className="m-0 text-muted">{desc}</p>
      </div>
      {action}
    </div>
  );
}
