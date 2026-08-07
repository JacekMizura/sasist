import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type MultiActionRow<TModuleId extends string> = {
  id: string;
  moduleId: TModuleId;
  expanded: boolean;
};

export type ModuleCardProps<TConfig = unknown, TCardContext = unknown> = {
  config: TConfig;
  onChange: (next: TConfig) => void;
  disabled?: boolean;
  cardContext: TCardContext;
};

export type MultiModuleDef<
  TModuleId extends string,
  TConfig = unknown,
  TCardContext = unknown,
  TOp = unknown,
> = {
  id: TModuleId;
  label: string;
  group: string;
  stage: 1 | "future";
  icon?: LucideIcon;
  defaultConfig: () => TConfig;
  validate: (cfg: TConfig) => string | null;
  Card: (props: ModuleCardProps<TConfig, TCardContext>) => ReactNode;
  toOps: (cfg: TConfig) => TOp[];
};

export type MultiConfigBag<TModuleId extends string> = Partial<Record<TModuleId, unknown>>;
