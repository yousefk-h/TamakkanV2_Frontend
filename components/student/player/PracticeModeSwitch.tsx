"use client";

import { useI18n } from "@/lib/i18n/LocaleProvider";

export type PracticeChoice = "avatar" | "voice" | "cartoon";

/** Avatar Practice (Mariam) vs Cartoon Practice, inside the lesson's Discuss
 * tab. Only the selected mode's component is mounted, so switching always
 * unmounts - and so disconnects - the other one. `locked` while a session
 * (avatar, cartoon, or voice) is active, so a stray tap can't end it.
 *
 * Voice Practice (`"voice"`) is no longer one of the two PRIMARY choices
 * shown here - Cartoon Practice's own "Only Voice" toggle (see
 * `CartoonSession`) now covers the audio-only use case on the same pipeline.
 * Voice Practice's component, hook, and backend routes are untouched and
 * still fully work if selected; this switch simply never emits `"voice"`
 * anymore, so a stray existing `value === "voice"` (e.g. from state restored
 * before this change) still renders without crashing.
 *
 * One radiogroup, two looks: a compact segmented control on phones
 * (`Cartoon | Avatar`, 48px tall) and the descriptive cards from `md` up. */
export function PracticeModeSwitch({
  value,
  onChange,
  locked,
}: {
  value: PracticeChoice;
  onChange: (value: PracticeChoice) => void;
  locked: boolean;
}) {
  const { t } = useI18n();
  const options: { key: PracticeChoice; label: string; shortLabel: string; desc: string; icon: string }[] = [
    { key: "cartoon", label: t("player.modeCartoon"), shortLabel: t("player.modeCartoonShort"), desc: t("player.modeCartoonDesc"), icon: "🎨" },
    { key: "avatar", label: t("player.modeAvatar"), shortLabel: t("player.modeAvatarShort"), desc: t("player.modeAvatarDesc"), icon: "🧑‍🏫" },
  ];
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t("player.practiceModeLabel")}
        className="grid grid-cols-2 gap-1 rounded-full bg-bg p-1 md:gap-2 md:rounded-none md:bg-transparent md:p-0"
      >
        {options.map(option => {
          const selected = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked && !selected}
              onClick={() => onChange(option.key)}
              className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 md:flex-col md:items-start md:justify-start md:gap-0.5 md:rounded-xl md:border md:px-3 md:py-2.5 md:text-start ${
                selected
                  ? "bg-card text-brand-blue shadow-card md:border-brand-blue md:bg-brand-primary-pale md:text-ink"
                  : "text-muted md:border-line md:bg-card md:text-ink md:hover:bg-bg"
              }`}
            >
              <span className="min-w-0 truncate">
                <span aria-hidden="true">{option.icon}</span> <span className="md:hidden">{option.shortLabel}</span>
                <span className="hidden md:inline">{option.label}</span>
              </span>
              <span className="hidden text-[11px] font-normal leading-snug text-muted md:block">{option.desc}</span>
            </button>
          );
        })}
      </div>
      {locked && (
        <p className="m-0 mt-1.5 text-center text-[11px] text-muted md:text-start" role="status">
          🔒 {t("player.modeLockedWhileLive")}
        </p>
      )}
    </div>
  );
}
