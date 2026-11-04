"use client";

import { CartoonCharacter } from "@/components/cartoon/CartoonCharacter";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { deriveCartoonCharacterView } from "@/lib/cartoon/cartoonCharacterState";
import type { VoiceAgentState } from "@/lib/voice/voiceRoom";
import type { VoiceUiPhase } from "@/lib/voice/voiceUiState";

/** The character card for Cartoon Practice, placed above the UNMODIFIED `VoiceCallView` (same status
 * text, same mic/End controls, same transcript - see `CartoonSession`). "Only Voice" just stops
 * rendering this panel; the session underneath keeps running exactly as-is - no restart, no reconnect. */
export function CartoonCharacterPanel({
  phase,
  agentPresent,
  agentState,
  onlyVoice,
  onToggleOnlyVoice,
}: {
  phase: VoiceUiPhase;
  agentPresent: boolean;
  agentState: VoiceAgentState | null;
  onlyVoice: boolean;
  onToggleOnlyVoice: () => void;
}) {
  const { t } = useI18n();
  const view = deriveCartoonCharacterView({ phase, agentPresent, agentState });

  return (
    <div className="flex flex-col gap-2">
      {!onlyVoice && (
        <div className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-primary-pale to-brand-primary-light/40 py-3">
          <CartoonCharacter label={t("cartoonSession.characterLabel")} agentState={view.agentState} idleGlances={view.idleGlances} />
        </div>
      )}
      <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-bold text-ink shadow-card md:w-auto md:self-center">
        <input type="checkbox" checked={onlyVoice} onChange={onToggleOnlyVoice} className="size-4" />
        {t("cartoonSession.onlyVoiceToggle")}
      </label>
    </div>
  );
}
