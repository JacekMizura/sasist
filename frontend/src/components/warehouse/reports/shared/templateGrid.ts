import type { LevelConfigItem } from "../../../../types/warehouse";
import { getLevelConfig } from "../../warehouseUtils";
import type { CustomRackTemplate, RackState } from "../../../../types/warehouse";

/** One row per level (level 1 first); cells [A][B][C]… */
export function formatLevelConfigAsGridLines(levelConfig: LevelConfigItem[]): string[] {
  if (levelConfig.length === 0) return [];
  const sorted = [...levelConfig].sort((a, b) => a.level - b.level);
  return sorted.map((lev) => {
    const n = Math.max(1, lev.locations);
    const cells = Array.from({ length: n }, (_, i) => {
      const label = i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
      return `[${label}]`;
    });
    return cells.join("");
  });
}

export function resolveTemplateLevelConfig(
  rack: RackState,
  tplById: Map<string, CustomRackTemplate>
): LevelConfigItem[] {
  const tid = rack.templateId;
  const fromTpl = tid ? tplById.get(tid)?.levelConfig : undefined;
  if (fromTpl && fromTpl.length > 0) return fromTpl;
  return getLevelConfig(rack);
}
