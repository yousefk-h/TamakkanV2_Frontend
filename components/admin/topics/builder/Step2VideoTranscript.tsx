import { useState } from "react";
import type { ReviewTranscriptEnglishResult, SourceDocument, TranscriptSegment, TranscriptSource, TranscriptState } from "@/lib/api/types";
import { TRANSCRIPT_STATE_LABEL } from "@/lib/topics/helpers";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

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
  transcriptSegments,
  transcriptError,
  onSaveTranscriptSegments,
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
  onRemovePdf,
  uploadingPdf,
  sourceDocuments,
  onUploadDocument,
  onAddTextSource,
  onRemoveDocument,
  uploadingDocument,
  documentError,
  uploadedVideoFilename,
  onUploadVideo,
  onRemoveVideo,
  uploadingVideo,
  videoUploadProgress,
  videoError,
}: {
  youtubeUrl: string;
  onYoutubeUrlChange: (v: string) => void;
  onGenerateTranscript: () => void;
  saving: boolean;
  pollStatus: "idle" | "polling" | "timeout";
  transcriptState: TranscriptState | null;
  transcriptSource: TranscriptSource | null;
  transcriptSegments: TranscriptSegment[];
  transcriptError: string | null;
  onSaveTranscriptSegments: (segments: TranscriptSegment[]) => void;
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
  onRemovePdf: () => void;
  uploadingPdf: boolean;
  sourceDocuments: SourceDocument[];
  onUploadDocument: (file: File) => void;
  onAddTextSource: (label: string, text: string) => Promise<boolean>;
  onRemoveDocument: (index: number) => void;
  uploadingDocument: boolean;
  documentError: string | null;
  uploadedVideoFilename: string | null;
  onUploadVideo: (file: File) => void;
  onRemoveVideo: () => void;
  uploadingVideo: boolean;
  videoUploadProgress: number | null;
  videoError: string | null;
}) {
  const { t } = useI18n();
  const isApproved = transcriptState === "approved_for_ai";
  const hasSource = Boolean(youtubeUrl) || Boolean(pdfFilename) || Boolean(uploadedVideoFilename) || sourceDocuments.length > 0;
  const [textLabel, setTextLabel] = useState("Pasted notes");
  const [pastedText, setPastedText] = useState("");
  const [segmentEdits, setSegmentEdits] = useState<TranscriptSegment[] | null>(null);
  const reviewSegments = segmentEdits ?? transcriptSegments;
  // The review editor (dozens of timestamped segments + a full-text box) is
  // the actual source of the excessive scrolling the owner reported - a
  // short preview by default, expanded only on request, keeps the step
  // compact while every existing editing feature stays reachable unchanged.
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [approvedExpanded, setApprovedExpanded] = useState(false);
  return (
    <section className="mx-auto max-w-[720px]">
      <div className="mb-4">
        <h3 className="m-0 text-xl tracking-tight text-ink md:text-2xl">{t("builder.step2Title")}</h3>
        <p className="mt-1.5 text-sm text-muted">{t("builder.step2Desc")}</p>
      </div>

      <details className="mb-4 rounded-2xl border border-brand-primary-light bg-brand-primary-pale open:pb-3">
        <summary className="cursor-pointer select-none p-3 text-sm font-bold text-ink">How this step works</summary>
        <ol className="mb-0 mt-0 grid gap-1 px-3 pl-8 text-sm text-muted sm:grid-cols-3 sm:pl-3">
          <li><b className="text-brand-blue">1.</b> Add one or more sources</li>
          <li><b className="text-brand-blue">2.</b> Extract and review the text</li>
          <li><b className="text-brand-blue">3.</b> Approve it for the avatar and exercises</li>
        </ol>
      </details>

      <div className="mb-4 grid gap-1.5">
        <span className="text-sm font-bold text-ink">{t("builder.coverImage")}</span>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="grid h-20 w-32 flex-none place-items-center overflow-hidden rounded-xl border border-line bg-card">
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-2 rounded-xl border border-line bg-card p-3.5">
          <b className="text-sm text-ink">Upload a lesson video</b>
          <p className="m-0 text-xs leading-relaxed text-muted">Students can watch it in the lesson. We first use embedded captions, then local speech recognition if needed.</p>
          <label className={`relative mt-1 inline-flex min-h-11 w-fit items-center rounded-[9px] bg-brand-blue px-3.5 py-2 text-sm font-bold text-white ${isApproved ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
            {uploadingVideo ? `Uploading${videoUploadProgress === null ? "…" : ` ${videoUploadProgress}%`}` : uploadedVideoFilename ? "Replace video" : "Choose video"}
            <input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" disabled={isApproved || uploadingVideo}
              onChange={e => { const file = e.target.files?.[0]; if (file) onUploadVideo(file); e.target.value = ""; }}
              className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
          </label>
          {uploadingVideo && <div className="h-2 w-full overflow-hidden rounded-full bg-brand-primary-pale" aria-label={`Video upload ${videoUploadProgress ?? 0}%`}>
            <div className="h-full rounded-full bg-brand-blue transition-[width]" style={{ width: `${videoUploadProgress ?? 0}%` }} />
          </div>}
          {uploadedVideoFilename && <div className="flex min-w-0 items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate" title={uploadedVideoFilename}>🎬 {uploadedVideoFilename}</span><button type="button" onClick={onRemoveVideo} disabled={isApproved || uploadingVideo} className="text-xs font-bold text-brand-coral disabled:opacity-40">Remove</button></div>}
          {videoError && <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">{videoError}</p>}
          <div className="mt-1 grid gap-1 border-t border-line pt-2">
            <label htmlFor="youtubeUrl" className="text-xs font-bold text-ink">Or add a YouTube link</label>
            <input
              id="youtubeUrl"
              value={youtubeUrl}
              onChange={e => onYoutubeUrlChange(e.target.value)}
              placeholder={t("builder.youtubeLinkPlaceholder")}
              disabled={isApproved}
              dir="ltr"
              className={`min-h-10 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-sm text-ink disabled:cursor-not-allowed ${isApproved ? "opacity-60" : ""}`}
            />
          </div>
        </div>

        <div className="grid content-start gap-2 rounded-xl border border-line bg-card p-3.5">
          <b className="text-sm text-ink">Add documents or pasted text</b>
          <p className="m-0 text-xs leading-relaxed text-muted">Add as many PDF, Word, PowerPoint, or text sources as this lesson needs. They stay separate and are combined only for teacher review.</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`relative inline-flex min-h-11 items-center rounded-[9px] border border-line bg-bg px-3.5 py-2 text-sm font-bold text-ink hover:bg-card ${isApproved ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
              {uploadingDocument ? "Reading document…" : "Upload PDF, Word or PowerPoint"}
              <input type="file" accept="application/pdf,.pdf,.docx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={isApproved || uploadingDocument}
                onChange={e => { const file = e.target.files?.[0]; if (file) onUploadDocument(file); e.target.value = ""; }}
                className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
            </label>
            <span className="text-xs text-muted">Max 20 MB each</span>
          </div>
          {(pdfFilename || sourceDocuments.length > 0) && <ul className="m-0 grid max-h-32 list-none gap-1.5 overflow-y-auto p-0">
            {pdfFilename && <li className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate" title={pdfFilename}>📄 {pdfFilename}</span>
              <button type="button" disabled={isApproved || uploadingPdf} onClick={onRemovePdf} className="text-xs font-bold text-brand-coral disabled:opacity-40">Remove</button>
            </li>}
            {sourceDocuments.map((document, index) => <li key={`${document.added_at}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate" title={document.label}>{document.kind === "text" ? "📝" : "📄"} {document.label}</span>
              <button type="button" disabled={isApproved || uploadingDocument} onClick={() => onRemoveDocument(index)} className="text-xs font-bold text-brand-coral disabled:opacity-40">Remove</button>
            </li>)}
          </ul>}
          <details className="mt-1 border-t border-line pt-2">
            <summary className="cursor-pointer select-none text-xs font-bold text-brand-blue">+ Paste text instead</summary>
            <div className="mt-2 grid gap-2">
              <label className="grid gap-1 text-xs font-bold text-ink">Source name
                <input value={textLabel} onChange={e => setTextLabel(e.target.value)} disabled={isApproved || uploadingDocument} maxLength={200} className="min-h-10 rounded-lg border border-line bg-bg px-3 text-sm font-normal text-ink" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-ink">Paste source text
                <textarea value={pastedText} onChange={e => setPastedText(e.target.value)} disabled={isApproved || uploadingDocument} rows={3} placeholder="Paste lesson notes, a script, or a reading passage…" className="rounded-lg border border-line bg-bg px-3 py-2 text-sm font-normal text-ink" />
              </label>
              <button type="button" disabled={isApproved || uploadingDocument || !pastedText.trim()} onClick={async () => { if (await onAddTextSource(textLabel, pastedText)) setPastedText(""); }} className="w-fit rounded-[9px] border border-brand-blue px-3.5 py-2 text-sm font-bold text-brand-blue disabled:opacity-40">Add pasted text</button>
            </div>
          </details>
          {documentError && <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">{documentError}</p>}
        </div>
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
        <p className="mt-3 text-sm text-muted">{t("builder.fetchingTranscript")}</p>
      )}
      {pollStatus === "timeout" && <p className="mt-3 text-sm text-muted">{t("builder.stillProcessing")}</p>}
      {transcriptState && <p className="mt-3 text-sm text-muted">{t("builder.status", { state: TRANSCRIPT_STATE_LABEL[transcriptState] })}</p>}
      {transcriptError && <p role="alert" className="mt-3 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">{transcriptError}</p>}

      {transcriptState === "pending_review" && (
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-card">
          <div className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <b className="text-sm text-ink">Transcript ready for review</b>
              <p className="m-0 mt-1 text-xs text-muted">{reviewSegments.length} timestamped segment{reviewSegments.length === 1 ? "" : "s"} · review, edit and approve before it reaches the avatar and exercises.</p>
              {!transcriptExpanded && reviewSegments[0] && <p dir="auto" className="m-0 mt-2 line-clamp-2 text-sm text-ink">{reviewSegments[0].text}</p>}
            </div>
            <button type="button" onClick={() => setTranscriptExpanded(v => !v)} className="min-h-10 shrink-0 rounded-lg border border-brand-blue px-3 text-sm font-bold text-brand-blue">{transcriptExpanded ? "Collapse" : "Review transcript"}</button>
          </div>

          {transcriptExpanded && <div className="max-h-[55vh] overflow-y-auto border-t border-line p-4">
            <div className="grid gap-4">
              {(transcriptSource === "ai_generated" || transcriptSource === "gemini_video" || transcriptSource === "local_asr" || transcriptSource === "mixed") && (
                <p role="alert" className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {t("builder.aiGeneratedTranscriptNotice")}
                </p>
              )}
              <div className="grid gap-2">
                <b className="text-sm text-ink">Timestamped segments</b>
                <p className="m-0 text-xs text-muted">Correct each spoken segment, then save before approving. Timestamps come from Gemini and stay chronological.</p>
                {reviewSegments.map((segment, index) => (
                  <label key={`${segment.start}-${index}`} className="grid gap-1 rounded-xl border border-line bg-bg p-3 text-sm">
                    <span className="font-bold text-brand-blue" dir="ltr">{formatTime(segment.start)} – {formatTime(segment.start + segment.duration)}</span>
                    <textarea rows={2} dir="auto" value={segment.text} onChange={e => {
                      const next = reviewSegments.map((item, itemIndex) => itemIndex === index ? { ...item, text: e.target.value } : item);
                      setSegmentEdits(next);
                    }} className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" />
                  </label>
                ))}
                <button type="button" disabled={saving || reviewSegments.length === 0 || reviewSegments.some(segment => !segment.text.trim())} onClick={() => onSaveTranscriptSegments(reviewSegments)} className="w-fit rounded-[9px] border border-brand-blue px-4 py-2 text-sm font-bold text-brand-blue disabled:opacity-40">Save transcript changes</button>
              </div>
              <label className="grid gap-1.5 text-sm font-bold text-ink">
                {t("builder.transcriptLabel")}
                <textarea
                  rows={6}
                  value={editedTranscript}
                  onChange={e => onEditedTranscriptChange(e.target.value)}
                  className="rounded-[10px] border border-line px-3 py-2.5 text-sm leading-relaxed text-ink outline-brand-blue"
                />
              </label>

              <button
                type="button"
                disabled={saving || checkingEnglish || !editedTranscript.trim()}
                onClick={onCheckEnglish}
                className="w-fit rounded-[9px] border border-brand-primary-light bg-brand-primary-pale px-4 py-2.5 text-sm font-bold text-brand-blue disabled:opacity-40"
              >
                {checkingEnglish ? t("builder.checking") : t("builder.checkEnglish")}
              </button>

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
          </div>}

          {/* Sticky within this step's own scroll area so "Approve" stays
          reachable while reviewing a long transcript, without depending on
          the dialog's separate step-navigation Continue button below. */}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-card/95 p-3 backdrop-blur-sm">
            <span className="text-xs font-semibold text-muted">Explicit approval is required before this transcript reaches the avatar or exercises.</span>
            <button
              type="button"
              disabled={saving || !editedTranscript.trim()}
              onClick={onApproveTranscript}
              className="min-h-11 shrink-0 rounded-[9px] bg-brand-blue px-5 text-sm font-bold text-white disabled:opacity-40"
            >
              {t("builder.approveTranscript")}
            </button>
          </div>
        </div>
      )}

      {isApproved && (
        <div className="mt-4 grid gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-[#caefe7] bg-[#e9f9f5] p-3.5">
            <span className="grid size-7 flex-none place-items-center rounded-full bg-[#17b99e] text-white">✓</span>
            <div>
              <b className="block text-sm text-[#087c69]">{t("builder.transcriptApproved")}</b>
              <p className="m-0 mt-0.5 text-xs text-[#4f877f]">{t("builder.studentsWillSee")}</p>
            </div>
          </div>
          {(transcriptSource === "ai_generated" || transcriptSource === "local_asr" || transcriptSource === "mixed") && (
            <p role="alert" className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("builder.aiGeneratedTranscriptNotice")}
            </p>
          )}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <b className="text-sm font-bold text-ink">{t("builder.approvedTranscriptLabel")}</b>
              <button type="button" onClick={() => setApprovedExpanded(v => !v)} className="shrink-0 text-xs font-bold text-brand-blue">{approvedExpanded ? "Show less" : "Show full transcript"}</button>
            </div>
            <p className={`m-0 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-line bg-bg p-3.5 text-sm leading-relaxed text-ink ${approvedExpanded ? "max-h-64" : "line-clamp-3"}`}>
              {approvedTranscript || "—"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
