import type { ReviewTranscriptEnglishResult, TranscriptSource, TranscriptState } from "@/lib/api/types";
import { TRANSCRIPT_STATE_LABEL } from "@/lib/topics/helpers";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits `text` into segments flagged `changed` wherever one of `snippets`
 * (the exact `corrected` strings the review already returned) occurs -
 * exact substring matching, not a real diff algorithm, since the review
 * already hands back the precise corrected snippets rather than leaving the
 * UI to infer them from a before/after pair. */
function highlightSegments(text: string, snippets: string[]): { text: string; changed: boolean }[] {
  const unique = Array.from(new Set(snippets.filter(Boolean))).sort((a, b) => b.length - a.length);
  if (unique.length === 0) return [{ text, changed: false }];
  const pattern = new RegExp(`(${unique.map(escapeRegExp).join("|")})`, "g");
  return text
    .split(pattern)
    .filter(piece => piece !== "")
    .map((piece, i) => ({ text: piece, changed: i % 2 === 1 }));
}

export function Step2VideoTranscript({
  youtubeUrl,
  onYoutubeUrlChange,
  onGenerateTranscript,
  saving,
  pollStatus,
  transcriptState,
  transcriptSource,
  editedTranscript,
  onEditedTranscriptChange,
  onApproveTranscript,
  approvedTranscript,
  onCheckEnglish,
  checkingEnglish,
  englishReview,
  englishReviewError,
  onApplyCorrections,
  thumbnailUrl,
  hasCustomThumbnail,
  onUploadThumbnail,
  onRemoveThumbnail,
  uploadingThumbnail,
  pdfFilename,
  onUploadPdf,
  onRemovePdf,
  uploadingPdf,
  pdfError,
}: {
  youtubeUrl: string;
  onYoutubeUrlChange: (v: string) => void;
  onGenerateTranscript: () => void;
  saving: boolean;
  pollStatus: "idle" | "polling" | "timeout";
  transcriptState: TranscriptState | null;
  transcriptSource: TranscriptSource | null;
  editedTranscript: string;
  onEditedTranscriptChange: (v: string) => void;
  onApproveTranscript: () => void;
  approvedTranscript: string | null;
  onCheckEnglish: () => void;
  checkingEnglish: boolean;
  englishReview: ReviewTranscriptEnglishResult | null;
  englishReviewError: string | null;
  onApplyCorrections: () => void;
  thumbnailUrl: string | null;
  hasCustomThumbnail: boolean;
  onUploadThumbnail: (file: File) => void;
  onRemoveThumbnail: () => void;
  uploadingThumbnail: boolean;
  /** `null` when no PDF source is attached - video-optional content. */
  pdfFilename: string | null;
  onUploadPdf: (file: File) => void;
  onRemovePdf: () => void;
  uploadingPdf: boolean;
  pdfError: string | null;
}) {
  const { t } = useI18n();
  const isApproved = transcriptState === "approved_for_ai";
  const hasSource = Boolean(youtubeUrl) || Boolean(pdfFilename);
  return (
    <section className="mx-auto max-w-[720px]">
      <div className="mb-6">
        <h3 className="m-0 text-xl tracking-tight text-ink md:text-2xl">{t("builder.step2Title")}</h3>
        <p className="mt-1.5 text-sm text-muted">{t("builder.step2Desc")}</p>
      </div>

      <div className="mb-6 grid gap-1.5">
        <span className="text-sm font-bold text-ink">{t("builder.coverImage")}</span>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="grid h-24 w-40 flex-none place-items-center overflow-hidden rounded-xl border border-line bg-card">
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote origin (YouTube or Cloudinary), not worth next/image's config for a 160x96 admin-only preview
              <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-muted">{t("builder.noImage")}</span>
            )}
          </div>
          <div className="grid gap-1.5">
            <label className="relative inline-flex min-h-11 w-fit cursor-pointer items-center rounded-[9px] border border-line bg-card px-3.5 py-2 text-sm font-bold text-ink hover:bg-bg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-blue">
              {uploadingThumbnail ? t("builder.uploading") : hasCustomThumbnail ? t("builder.replaceImage") : t("builder.uploadImage")}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingThumbnail}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) onUploadThumbnail(file);
                  e.target.value = "";
                }}
                aria-label={t("builder.uploadImage")}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            {hasCustomThumbnail ? (
              <button type="button" onClick={onRemoveThumbnail} disabled={uploadingThumbnail} className="w-fit text-xs font-bold text-brand-coral disabled:opacity-40">
                {t("builder.removeImage")}
              </button>
            ) : (
              <p className="m-0 text-xs text-muted">{t("builder.autoFilledFromYoutube")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="youtubeUrl" className="text-sm font-bold text-ink">
          {t("builder.youtubeLink")}
        </label>
        <p className="m-0 text-xs text-muted">{t("builder.videoOptionalHint")}</p>
        <div className={`flex flex-col overflow-hidden rounded-xl border border-line bg-card sm:flex-row sm:items-center ${isApproved ? "opacity-60" : ""}`}>
          <input
            id="youtubeUrl"
            value={youtubeUrl}
            onChange={e => onYoutubeUrlChange(e.target.value)}
            placeholder={t("builder.youtubeLinkPlaceholder")}
            disabled={isApproved}
            dir="ltr"
            className="min-h-11 w-full min-w-0 flex-1 border-0 px-3 py-2.5 text-sm text-ink disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-1.5">
        <span className="text-sm font-bold text-ink">{t("builder.pdfSource")}</span>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`relative inline-flex min-h-11 w-fit items-center rounded-[9px] border border-line bg-card px-3.5 py-2 text-sm font-bold text-ink hover:bg-bg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-blue ${isApproved ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
            {uploadingPdf ? t("builder.uploading") : pdfFilename ? t("builder.replacePdf") : t("builder.uploadPdf")}
            <input
              type="file"
              accept="application/pdf"
              disabled={isApproved || uploadingPdf}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) onUploadPdf(file);
                e.target.value = "";
              }}
              aria-label={t("builder.uploadPdf")}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </label>
          {pdfFilename && (
            <>
              <span className="min-w-0 truncate text-sm text-muted" title={pdfFilename}>
                📄 {pdfFilename}
              </span>
              <button type="button" onClick={onRemovePdf} disabled={isApproved || uploadingPdf} className="text-xs font-bold text-brand-coral disabled:opacity-40">
                {t("builder.removePdf")}
              </button>
            </>
          )}
        </div>
        {pdfError && (
          <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
            {pdfError}
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={isApproved || saving || !hasSource || pollStatus === "polling"}
        onClick={onGenerateTranscript}
        className="mt-4 w-full rounded-[10px] bg-brand-blue px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-fit"
      >
        {t("builder.generateTranscript")}
      </button>
      {isApproved && (
        <p className="mt-1.5 text-xs text-muted">{t("builder.approvedNotice")}</p>
      )}

      {pollStatus === "polling" && (
        <p className="mt-4 text-sm text-muted">{t("builder.fetchingTranscript")}</p>
      )}
      {pollStatus === "timeout" && <p className="mt-4 text-sm text-muted">{t("builder.stillProcessing")}</p>}
      {transcriptState && <p className="mt-4 text-sm text-muted">{t("builder.status", { state: TRANSCRIPT_STATE_LABEL[transcriptState] })}</p>}

      {transcriptState === "pending_review" && (
        <div className="mt-5 grid gap-4 border-t border-line pt-5">
          {transcriptSource === "ai_generated" && (
            <p role="alert" className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("builder.aiGeneratedTranscriptNotice")}
            </p>
          )}
          <label className="grid gap-1.5 text-sm font-bold text-ink">
            {t("builder.transcriptLabel")}
            <textarea
              rows={8}
              value={editedTranscript}
              onChange={e => onEditedTranscriptChange(e.target.value)}
              className="rounded-[10px] border border-line px-3 py-2.5 text-sm leading-relaxed text-ink outline-brand-blue"
            />
          </label>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={saving || checkingEnglish || !editedTranscript.trim()}
              onClick={onCheckEnglish}
              className="rounded-[9px] border border-brand-primary-light bg-brand-primary-pale px-4 py-2.5 text-sm font-bold text-brand-blue disabled:opacity-40"
            >
              {checkingEnglish ? t("builder.checking") : t("builder.checkEnglish")}
            </button>
            <button
              type="button"
              disabled={saving || !editedTranscript.trim()}
              onClick={onApproveTranscript}
              className="rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {t("builder.approveTranscript")}
            </button>
          </div>

          {englishReviewError && (
            <p role="alert" className="rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
              {englishReviewError}
            </p>
          )}

          {englishReview && !englishReviewError && (
            <div className="grid gap-3 rounded-xl border border-brand-primary-light bg-brand-primary-pale p-3.5">
              {englishReview.corrections.length === 0 ? (
                <p className="m-0 text-sm text-[#087c69]">{t("builder.noEnglishIssues")}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm text-ink">
                      {t(
                        englishReview.corrections.length === 1 ? "builder.suggestedCorrection" : "builder.suggestedCorrections",
                        { count: englishReview.corrections.length },
                      )}
                    </b>
                    <button type="button" onClick={onApplyCorrections} className="whitespace-nowrap text-xs font-bold text-brand-blue">
                      {t("builder.applyToTranscript")}
                    </button>
                  </div>
                  <p className="m-0 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-line bg-bg p-3 text-sm leading-relaxed text-ink">
                    {highlightSegments(englishReview.corrected_transcript, englishReview.corrections.map(c => c.corrected)).map(
                      (seg, i) =>
                        seg.changed ? (
                          <mark key={i} className="rounded-[3px] bg-[#fff1a8] px-0.5">
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        ),
                    )}
                  </p>
                  <div className="grid gap-2">
                    {englishReview.corrections.map((c, i) => (
                      <div key={i} className="grid gap-1 border-t border-line pt-2 text-sm first:border-0 first:pt-0">
                        <span className="inline-block w-fit rounded-full bg-brand-primary-pale px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                          {c.category}
                        </span>
                        <p className="m-0">
                          <span className="text-brand-coral line-through">{c.original}</span>{" "}
                          <span className="font-bold text-[#087c69]">→ {c.corrected}</span>
                        </p>
                        <p className="m-0 text-xs text-muted">{c.explanation}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {isApproved && (
        <div className="mt-5 grid gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-[#caefe7] bg-[#e9f9f5] p-3.5">
            <span className="grid size-7 flex-none place-items-center rounded-full bg-[#17b99e] text-white">✓</span>
            <div>
              <b className="block text-sm text-[#087c69]">{t("builder.transcriptApproved")}</b>
              <p className="m-0 mt-0.5 text-xs text-[#4f877f]">{t("builder.studentsWillSee")}</p>
            </div>
          </div>
          {transcriptSource === "ai_generated" && (
            <p role="alert" className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("builder.aiGeneratedTranscriptNotice")}
            </p>
          )}
          <div className="grid gap-1.5">
            <b className="text-sm font-bold text-ink">{t("builder.approvedTranscriptLabel")}</b>
            <p className="m-0 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-line bg-bg p-3.5 text-sm leading-relaxed text-ink">
              {approvedTranscript || "—"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
