import type { MessageKey } from "./i18n/LocaleProvider";
import type { BadgeKey } from "./api/types";

/** Display metadata for each real badge key from `GET /me/progress` - icons
 * aren't language-dependent so they live here as plain data; title/desc go
 * through i18n like everything else user-visible. */
export const BADGE_ORDER: BadgeKey[] = ["streak", "vocab_master", "first_class", "top_scorer", "fast_improver", "level_complete"];

export const BADGE_ICON: Record<BadgeKey, string> = {
  streak: "🔥",
  vocab_master: "🎯",
  first_class: "🗣️",
  top_scorer: "⭐",
  fast_improver: "📈",
  level_complete: "✅",
};

export const BADGE_TITLE_KEY: Record<BadgeKey, MessageKey> = {
  streak: "badges.streakTitle",
  vocab_master: "badges.vocabMasterTitle",
  first_class: "badges.firstClassTitle",
  top_scorer: "badges.topScorerTitle",
  fast_improver: "badges.fastImproverTitle",
  level_complete: "badges.levelCompleteTitle",
};

export const BADGE_DESC_KEY: Record<BadgeKey, MessageKey> = {
  streak: "badges.streakDesc",
  vocab_master: "badges.vocabMasterDesc",
  first_class: "badges.firstClassDesc",
  top_scorer: "badges.topScorerDesc",
  fast_improver: "badges.fastImproverDesc",
  level_complete: "badges.levelCompleteDesc",
};
