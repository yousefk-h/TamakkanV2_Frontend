"use client";

import type { ReportEvidence, SpeakingReport } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function LearningReportDetails({ report }: { report: SpeakingReport }) {
  const { t } = useI18n();
  const analysis = report.analysis;
  if (!analysis) return null;
  const { feedback, metrics, comparison } = analysis;
  const evidence = (item: ReportEvidence) => <blockquote className="mt-2 border-s-2 border-brand-primary-light ps-3 text-sm text-muted">
    <span className="mb-1 block text-xs">{t("learningReport.turn", { count: item.turn_index })}</span>
    <span dir="auto">“{item.quote}”</span>
  </blockquote>;
  const change = (value: number) => `${value > 0 ? "+" : ""}${value}`;

  return <div className="mt-4 space-y-5 border-t border-line pt-4 text-sm [overflow-wrap:anywhere]">
    <div className="rounded-xl bg-brand-primary-pale p-3 leading-relaxed text-ink">
      <p className="font-semibold">{t(analysis.status === "assessed" ? "learningReport.evidenceBased" : "learningReport.insufficient")}</p>
      <p className="mt-1 text-muted">{t("learningReport.textOnly")}</p>
      <p className="mt-2 text-muted"><b className="text-ink">{t("learningReport.pronunciation")}: </b>{t("learningReport.noAudio")}</p>
    </div>
    <section aria-label={t("learningReport.measures")}>
      <h4 className="font-bold text-ink">{t("learningReport.measures")}</h4>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ["learningReport.turns", metrics.student_turns],
          ["learningReport.words", metrics.student_words],
          ["learningReport.uniqueWords", metrics.unique_student_words],
          ["learningReport.wordsPerTurn", metrics.average_words_per_turn],
        ] as const).map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-line p-3"><dt className="text-xs text-muted">{t(label)}</dt><dd className="mt-1 text-lg font-bold tabular-nums text-ink">{value}</dd></div>)}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-muted">{t("learningReport.metricNote")}</p>
    </section>
    <section>
      <h4 className="font-bold text-ink">{t("learningReport.progress")}</h4>
      {comparison ? <>
        <p className="mt-1 text-xs text-muted">{t("learningReport.comparedWith", { date: formatDate(comparison.previous_session_date) })}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {([
            ["learningReport.overall", comparison.overall_change],
            ["learningReport.textFluency", comparison.fluency_change],
            ["skillLabels.grammar", comparison.grammar_change],
            ["skillLabels.vocabulary", comparison.vocabulary_change],
            ["skillLabels.complexity", comparison.complexity_change],
          ] as const).map(([label, value]) => <div key={label} className="rounded-lg bg-bg p-2"><dt className="text-xs text-muted">{t(label)}</dt><dd className="mt-1 font-bold text-ink"><bdi>{change(value)}</bdi> {t("learningReport.points")}</dd></div>)}
        </dl>
        <p className="mt-2 text-xs text-muted">{t("learningReport.comparisonNote")}</p>
      </> : <p className="mt-1 text-muted">{t("learningReport.noBaseline")}</p>}
    </section>
    {feedback && <>
      {([
        ["learningReport.strengths", feedback.strengths],
        ["learningReport.improvements", feedback.improvement_areas],
      ] as const).map(([title, items]) => items.length > 0 && <section key={title}>
        <h4 className="font-bold text-ink">{t(title)}</h4>
        <ul className="mt-2 space-y-3">{items.map((item, index) => <li key={index}><p dir="auto">{item.observation}</p>{evidence(item.evidence)}</li>)}</ul>
      </section>)}
      {feedback.corrections.length > 0 && <section>
        <h4 className="font-bold text-ink">{t("learningReport.corrections")}</h4>
        <div className="mt-2 space-y-3">{feedback.corrections.map((item, index) => <article key={index} className="rounded-xl border border-line p-3">
          {evidence(item.evidence)}
          <p className="mt-3 text-xs font-semibold text-brand-blue">{t("learningReport.tryInstead")}</p>
          <p dir="auto" className="mt-1 font-semibold text-ink">{item.corrected}</p>
          <p dir="auto" className="mt-2 leading-relaxed text-muted">{item.explanation}</p>
        </article>)}</div>
      </section>}
      {feedback.recurring_patterns.length > 0 && <section>
        <h4 className="font-bold text-ink">{t("learningReport.patterns")}</h4>
        <div className="mt-2 space-y-3">{feedback.recurring_patterns.map((item, index) => <article key={index}>
          <p dir="auto" className="font-semibold">{item.description}</p>
          <p className="mt-1 text-xs text-muted">{t("learningReport.observedTurns", { count: item.evidence.length })}</p>
          {item.evidence.map((quote, i) => <div key={i}>{evidence(quote)}</div>)}
          <p dir="auto" className="mt-2 text-muted">{item.practice_action}</p>
        </article>)}</div>
      </section>}
      <section>
        <h4 className="font-bold text-ink">{t("learningReport.nextSteps")}</h4>
        <ol className="mt-2 list-decimal space-y-3 ps-5">{feedback.next_steps.map((goal, index) => <li key={index} className="ps-1">
          <p className="font-semibold text-ink"><span dir="auto">{goal.focus}</span> <span className="text-xs font-normal text-muted">· {t("learningReport.minutes", { count: goal.minutes })}</span></p>
          <p dir="auto" className="mt-1 leading-relaxed">{goal.action}</p>
          <p className="mt-2 rounded-lg bg-bg p-2 text-muted"><b>{t("learningReport.success")}: </b><span dir="auto">{goal.success_criterion}</span></p>
        </li>)}</ol>
      </section>
    </>}
  </div>;
}
