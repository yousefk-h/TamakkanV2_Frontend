"use client";

import type { LearningObjective, ObjectiveSuggestion } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type Props = {
  objectives: LearningObjective[];
  suggestions: ObjectiveSuggestion[];
  approved: boolean;
  canSuggest: boolean;
  saving: boolean;
  suggesting: boolean;
  error: string | null;
  onChange: (next: LearningObjective[]) => void;
  onSuggest: () => void;
  onSave: () => void;
  onApprove: () => void;
  onAcceptSuggestion: (index: number) => void;
  onRejectSuggestion: (index: number) => void;
};

export function Step3LearningObjectives({ objectives, suggestions, approved, canSuggest, saving, suggesting, error, onChange, onSuggest, onSave, onApprove, onAcceptSuggestion, onRejectSuggestion }: Props) {
  const { t } = useI18n();
  const update = (index: number, text: string) => onChange(objectives.map((item, i) => i === index ? { ...item, text } : item));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= objectives.length) return;
    const next = [...objectives]; [next[index], next[target]] = [next[target], next[index]]; onChange(next);
  };
  return <section className="mx-auto max-w-[760px] space-y-5">
    <div><h3 className="text-2xl font-extrabold text-ink">{t("builder.objectivesTitle")}</h3><p className="mt-1 text-sm text-muted">{t("builder.objectivesHint")}</p></div>
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold text-ink">{t("builder.objectivesList")}</h4><p className="text-xs text-muted">{approved ? t("builder.objectivesApproved") : t("builder.objectivesNeedsApproval")}</p></div><button type="button" onClick={() => onChange([...objectives, { text: "", source: "manual" }])} className="rounded-lg border border-brand-blue px-3 py-2 text-sm font-bold text-brand-blue">{t("builder.addObjective")}</button></div>
      <div className="mt-4 space-y-3">
        {objectives.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{t("builder.objectivesEmpty")}</p> : objectives.map((objective, index) => <div key={`${objective.source}-${index}`} className="rounded-xl border border-line bg-bg p-3">
          <div className="flex gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-primary-pale text-sm font-bold text-brand-blue">{index + 1}</span><textarea value={objective.text} onChange={event => update(index, event.target.value)} maxLength={400} rows={2} className="min-h-20 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder={t("builder.objectivePlaceholder")} />
            <div className="flex flex-col gap-1"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded border border-line px-2 py-1 text-sm disabled:opacity-35" aria-label={t("builder.moveObjectiveUp")}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === objectives.length - 1} className="rounded border border-line px-2 py-1 text-sm disabled:opacity-35" aria-label={t("builder.moveObjectiveDown")}>↓</button><button type="button" onClick={() => onChange(objectives.filter((_, i) => i !== index))} className="rounded border border-red-300 px-2 py-1 text-sm text-red-600" aria-label={t("builder.removeObjective")}>×</button></div>
          </div>{objective.source === "ai" && <span className="mt-2 inline-block rounded-full bg-brand-primary-pale px-2 py-1 text-xs font-semibold text-brand-blue">{t("builder.aiSuggestion")}</span>}
        </div>)}</div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={saving || objectives.length === 0 || objectives.some(item => !item.text.trim())} onClick={onSave} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{saving ? t("builder.saving") : t("builder.saveObjectives")}</button><button type="button" disabled={saving || approved || objectives.length === 0 || objectives.some(item => !item.text.trim())} onClick={onApprove} className="rounded-lg border border-[#10ab91] px-4 py-2 text-sm font-bold text-[#087d69] disabled:opacity-40">{t("builder.approveObjectives")}</button></div>
    </div>
    <div className="rounded-2xl border border-brand-blue/25 bg-brand-primary-pale p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold text-ink">{t("builder.aiObjectives")}</h4><p className="text-xs text-muted">{t("builder.aiObjectivesHint")}</p></div><button type="button" disabled={!canSuggest || suggesting} onClick={onSuggest} className="rounded-lg border border-brand-blue bg-card px-3 py-2 text-sm font-bold text-brand-blue disabled:opacity-40">{suggesting ? t("builder.aiGenerating") : t("builder.aiGenerate")}</button></div>
      {!canSuggest && <p className="mt-3 text-xs text-muted">{t("builder.aiNeedsSource")}</p>}
      {suggestions.length > 0 && <div className="mt-4 space-y-2">{suggestions.map((suggestion, index) => <div key={`${suggestion.text}-${index}`} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3"><p className="flex-1 text-sm text-ink">{suggestion.text}</p><button type="button" onClick={() => onAcceptSuggestion(index)} className="rounded border border-brand-blue px-2 py-1 text-xs font-bold text-brand-blue">{t("builder.acceptObjective")}</button><button type="button" onClick={() => onRejectSuggestion(index)} className="rounded border border-red-300 px-2 py-1 text-xs font-bold text-red-600">{t("builder.rejectObjective")}</button></div>)}</div>}
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </section>;
}
