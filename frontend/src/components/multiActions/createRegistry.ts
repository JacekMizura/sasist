export type RegistryModule = {
  id: string;
  label: string;
  group: string;
  stage: 1 | "future";
};

export function createModuleRegistry<TModuleId extends string, TDef extends RegistryModule>(
  modules: TDef[],
) {
  const byId = new Map<string, TDef>(modules.map((m) => [m.id, m]));

  return {
    modules,
    getModule: (id: TModuleId) => byId.get(id),
    listPickerModules: () => modules.filter((m) => m.stage === 1),
    listPickerGroups: (): { group: string; modules: TDef[] }[] => {
      const order: string[] = [];
      const map = new Map<string, TDef[]>();
      for (const m of modules.filter((mod) => mod.stage === 1)) {
        if (!map.has(m.group)) {
          order.push(m.group);
          map.set(m.group, []);
        }
        map.get(m.group)!.push(m);
      }
      return order.map((group) => ({ group, modules: map.get(group)! }));
    },
  };
}
