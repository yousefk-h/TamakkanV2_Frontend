import { useState } from "react";
import { ApiError, unitsApi } from "@/lib/api/client";
import type { Level, LevelProfilePublic } from "@/lib/api/types";
import { useUnitsContext } from "@/lib/units/UnitsContext";
import { LEVEL_EMOJI, LEVEL_LABEL, LEVEL_ORDER } from "@/lib/topics/helpers";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function Step1Basics({
  title,
  onTitleChange,
  level,
  onLevelChange,
  levelLocked,
  levelProfiles,
  levelProfileId,
  onLevelProfileChange,
  unitId,
  onUnitIdChange,
  orderIndex,
  onOrderIndexChange,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  level: Level;
  onLevelChange: (v: Level) => void;
  levelLocked: boolean;
  levelProfiles: LevelProfilePublic[];
  levelProfileId: string | null;
  onLevelProfileChange: (profile: LevelProfilePublic | null) => void;
  /** `null` = unassigned ("General"/legacy bucket) - topic organization by
   * unit + order. */
  unitId: string | null;
  onUnitIdChange: (v: string | null) => void;
  orderIndex: number;
  onOrderIndexChange: (v: number) => void;
}) {
  const { t } = useI18n();
  const { unitsByLevel, refetch: refetchUnits } = useUnitsContext();
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [unitError, setUnitError] = useState<string | null>(null);
  const unitsForLevel = unitsByLevel[level] ?? [];

  const handleCreateUnit = async () => {
    if (!newUnitName.trim()) return;
    setUnitError(null);
    try {
      const unit = await unitsApi.create({ level, name: newUnitName.trim() });
      refetchUnits();
      onUnitIdChange(unit.id);
      setNewUnitName("");
      setCreatingUnit(false);
    } catch (err) {
      setUnitError(err instanceof ApiError ? err.message : t("builder.unitCreateFailed"));
    }
  };

  return (
    <section className="mx-auto max-w-[720px]">
      <div className="mb-6">
        <h3 className="m-0 text-xl tracking-tight text-ink md:text-2xl">{t("builder.step1Title")}</h3>
        <p className="mt-1.5 text-sm text-muted">{t("builder.step1Desc")}</p>
      </div>
      <label className="grid gap-1.5 text-sm font-bold text-ink">
        {t("builder.topicTitle")}
        <input
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder={t("builder.topicTitlePlaceholder")}
          className="rounded-[10px] border border-line px-3 py-2.5 text-sm text-ink outline-brand-blue"
        />
      </label>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {LEVEL_ORDER.map((l, i) => (
          <button
            key={l}
            type="button"
            disabled={levelLocked}
            onClick={() => { onLevelProfileChange(null); onLevelChange(l); }}
            className={`flex min-w-0 flex-wrap items-center gap-2.5 rounded-2xl border p-4 text-start disabled:opacity-70 ${
              level === l ? "border-2 border-brand-blue bg-brand-primary-pale shadow-[0_8px_22px_rgb(var(--brand-shadow-rgb)/.1)]" : "border-line bg-card"
            }`}
          >
            <span className="grid size-9.5 flex-none place-items-center rounded-[10px] bg-bg text-lg">{LEVEL_EMOJI[l]}</span>
            <div>
              <small className="block text-[10px] font-extrabold tracking-wide text-brand-blue">{t("builder.levelN", { n: i + 1 })}</small>
              <b className="text-sm">{LEVEL_LABEL[l]}</b>
            </div>
          </button>
        ))}
      </div>
      {levelProfiles.length > 0 && <div className="mt-4">
        <p className="mb-2 text-sm font-bold text-ink">{t("builder.centerLevels")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {levelProfiles.map(profile => <button
            key={profile.id}
            type="button"
            disabled={levelLocked}
            onClick={() => onLevelProfileChange(profile)}
            className={`rounded-xl border p-3 text-start disabled:opacity-70 ${levelProfileId === profile.id ? "border-2 border-brand-blue bg-brand-primary-pale" : "border-line bg-card"}`}
          >
            <b className="block text-sm text-ink">{profile.name}</b>
            <span className="text-xs text-muted">{t("builder.centerLevelBase", { level: LEVEL_LABEL[profile.base_level] })}</span>
          </button>)}
        </div>
      </div>}
      {levelLocked && <p className="mt-3 text-sm text-muted">{t("builder.levelLocked")}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="grid gap-1.5">
          <label htmlFor="unitSelect" className="text-sm font-bold text-ink">
            {t("builder.unitLabel")}
          </label>
          <select
            id="unitSelect"
            value={unitId ?? ""}
            onChange={e => onUnitIdChange(e.target.value || null)}
            className="h-11 rounded-[10px] border border-line bg-card px-3 text-sm text-ink outline-brand-blue"
          >
            <option value="">{t("builder.unitUnassigned")}</option>
            {unitsForLevel.map(unit => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          {!creatingUnit ? (
            <button type="button" onClick={() => setCreatingUnit(true)} className="w-fit text-xs font-bold text-brand-blue">
              + {t("builder.newUnit")}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                value={newUnitName}
                onChange={e => setNewUnitName(e.target.value)}
                placeholder={t("builder.newUnitPlaceholder")}
                className="min-w-0 flex-1 rounded-[9px] border border-line px-3 py-2 text-sm outline-brand-blue"
              />
              <button type="button" onClick={handleCreateUnit} disabled={!newUnitName.trim()} className="rounded-[9px] bg-brand-blue px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                {t("common.save")}
              </button>
              <button type="button" onClick={() => { setCreatingUnit(false); setNewUnitName(""); }} className="text-xs font-bold text-muted">
                {t("common.cancel")}
              </button>
            </div>
          )}
          {unitError && <p role="alert" className="m-0 text-xs text-brand-coral">{unitError}</p>}
        </div>
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("builder.orderLabel")}
          <input
            type="number"
            value={orderIndex}
            onChange={e => onOrderIndexChange(Number(e.target.value) || 0)}
            className="h-11 rounded-[10px] border border-line px-3 text-sm text-ink outline-brand-blue"
          />
        </label>
      </div>
    </section>
  );
}
