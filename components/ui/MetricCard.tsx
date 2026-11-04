import { Icon, type IconName } from "./Icon";
import { Sparkline } from "./Sparkline";

const TONE_STYLES = [
  "bg-brand-primary-pale text-brand-blue",
  "bg-accent-pink/10 text-brand-coral",
  "bg-[#e5faf6] text-[#0bac9c]",
  "bg-accent-indigo/10 text-accent-indigo",
];

export function MetricCard({
  label,
  value,
  delta,
  icon,
  tone = 0,
  warn,
  trend,
}: {
  label: string;
  value: string;
  delta: string;
  icon: IconName;
  tone?: number;
  warn?: boolean;
  trend?: number[];
}) {
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
      <div className={`grid size-11 flex-none place-items-center rounded-xl ${TONE_STYLES[tone % TONE_STYLES.length]}`}>
        <Icon name={icon} />
      </div>
      {trend && trend.length > 1 && <Sparkline points={trend} />}
      </div>
      <div className="grid min-w-0 gap-1 break-words">
        <span className="text-sm text-muted">{label}</span>
        <b className="text-3xl tabular-nums tracking-tight text-ink">{value}</b>
        <small className={`text-sm ${warn ? "text-accent-indigo" : "text-muted"}`}>{delta}</small>
      </div>
    </article>
  );
}
