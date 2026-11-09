"use client";

import { useState } from "react";
import type { Level, LevelProfilePublic, ProgramLevelDefinition } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { LEVEL_LABEL, LEVEL_ORDER } from "@/lib/topics/helpers";

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "stage";
}

function nextStageId(existing: ProgramLevelDefinition[], name: string): string {
  const base = slugify(name);
  let id = base;
  let attempt = 2;
  while (existing.some(stage => stage.id === id)) {
    id = `${base}-${attempt}`;
    attempt += 1;
  }
  return id;
}

export function StageListEditor({
  stages,
  onChange,
  profiles,
}: {
  stages: ProgramLevelDefinition[];
  onChange: (next: ProgramLevelDefinition[]) => void;
  profiles: LevelProfilePublic[];
}) {
  const { t } = useI18n();
  const [newName, setNewName] = useState("");
  const [newDifficulty, setNewDifficulty] = useState<Level>("beginner");
  const [newProfileId, setNewProfileId] = useState("");

  const reindex = (list: ProgramLevelDefinition[]) =>
    list.map((stage, index) => ({ ...stage, order_index: index }));

  const updateStage = (id: string, patch: Partial<ProgramLevelDefinition>) => {
    onChange(stages.map(stage => (stage.id === id ? { ...stage, ...patch } : stage)));
  };

  const removeStage = (id: string) => {
    onChange(reindex(stages.filter(stage => stage.id !== id)));
  };

  const moveStage = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(reindex(next));
  };

  const addStage = () => {
    const name = newName.trim();
    if (!name) return;
    const matchedProfile = profiles.find(profile => profile.id === newProfileId);
    const stage: ProgramLevelDefinition = {
      id: nextStageId(stages, name),
      name,
      order_index: stages.length,
      difficulty_level: matchedProfile ? matchedProfile.base_level : newDifficulty,
      level_profile_id: matchedProfile ? matchedProfile.id : null,
    };
    onChange([...stages, stage]);
    setNewName("");
    setNewProfileId("");
    setNewDifficulty("beginner");
  };

  return (
    <div className="grid gap-2">
      {stages.map((stage, index) => (
        <div key={stage.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2">
          <input
            value={stage.name}
            onChange={event => updateStage(stage.id, { name: event.target.value })}
            className="min-h-10 min-w-0 flex-1 basis-32 rounded-lg border border-line px-2 text-sm font-normal"
            aria-label={t("programs.stageName")}
          />
          <select
            value={stage.difficulty_level}
            disabled={Boolean(stage.level_profile_id)}
            onChange={event => updateStage(stage.id, { difficulty_level: event.target.value as Level })}
            className="min-h-10 min-w-0 flex-1 basis-28 rounded-lg border border-line px-2 text-sm font-normal disabled:opacity-50"
            aria-label={t("programs.stageDifficulty")}
          >
            {LEVEL_ORDER.map(level => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}
          </select>
          <select
            value={stage.level_profile_id ?? ""}
            onChange={event => {
              const profile = profiles.find(item => item.id === event.target.value);
              updateStage(stage.id, {
                level_profile_id: profile ? profile.id : null,
                difficulty_level: profile ? profile.base_level : stage.difficulty_level,
              });
            }}
            className="min-h-10 min-w-0 flex-1 basis-28 rounded-lg border border-line px-2 text-sm font-normal"
            aria-label={t("programs.stageCenterLevel")}
          >
            <option value="">{t("programs.customLevel")}</option>
            {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => moveStage(index, -1)} disabled={index === 0} className="min-h-10 min-w-10 rounded-lg border border-line text-sm disabled:opacity-30" aria-label={t("programs.stageMoveUp")}>↑</button>
            <button type="button" onClick={() => moveStage(index, 1)} disabled={index === stages.length - 1} className="min-h-10 min-w-10 rounded-lg border border-line text-sm disabled:opacity-30" aria-label={t("programs.stageMoveDown")}>↓</button>
            <button type="button" onClick={() => removeStage(stage.id)} disabled={stages.length <= 1} className="min-h-10 min-w-10 rounded-lg border border-line text-sm text-brand-coral disabled:opacity-30" aria-label={t("programs.stageRemove")}>×</button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-2">
        <input
          value={newName}
          onChange={event => setNewName(event.target.value)}
          placeholder={t("programs.stageNewNamePlaceholder")}
          className="min-h-10 min-w-0 flex-1 basis-32 rounded-lg border border-line px-2 text-sm font-normal"
        />
        <select value={newProfileId ? "" : newDifficulty} disabled={Boolean(newProfileId)} onChange={event => setNewDifficulty(event.target.value as Level)} className="min-h-10 min-w-0 flex-1 basis-28 rounded-lg border border-line px-2 text-sm font-normal disabled:opacity-50">
          {LEVEL_ORDER.map(level => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}
        </select>
        <select value={newProfileId} onChange={event => setNewProfileId(event.target.value)} className="min-h-10 min-w-0 flex-1 basis-28 rounded-lg border border-line px-2 text-sm font-normal">
          <option value="">{t("programs.customLevel")}</option>
          {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
        <button type="button" onClick={addStage} disabled={!newName.trim()} className="min-h-10 rounded-lg border border-brand-blue px-3 text-sm font-bold text-brand-blue disabled:opacity-40">{t("programs.stageAdd")}</button>
      </div>
    </div>
  );
}
