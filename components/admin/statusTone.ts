export type StatusTone = "risk" | "excellent" | "default";

/** Infers a tone from a student-style status string ("Needs attention" ->
 * risk, "Excellent" -> excellent, everything else -> default/green) - the
 * same substring/equality checks the old inline ternaries used. Submission
 * and report review states aren't text-inferrable this way (their `.reviewed`
 * flag / status string don't literally contain "attention"/"Excellent"), so
 * those callers pass an explicit `tone` override instead. */
export function statusTone(status: string): StatusTone {
  if (status.toLowerCase().includes("attention")) return "risk";
  if (status === "Excellent") return "excellent";
  return "default";
}
