/**
 * Command layer foundation (Undo-ready, no Undo UI yet).
 * Toolbar / inspectors should dispatch commands instead of mutating ad hoc.
 */

export type DesignerCommandResult = {
  ok: boolean;
  error?: string;
};

export type DesignerCommand = {
  id: string;
  label: string;
  execute: () => DesignerCommandResult | void;
  /** Stack-ready; not wired to Ctrl+Z in this stage. */
  undo?: () => DesignerCommandResult | void;
};

export type CommandBus = {
  execute: (command: DesignerCommand) => DesignerCommandResult;
  /** History for future Undo UI (not exposed in chrome yet). */
  history: DesignerCommand[];
};

export function createCommandBus(): CommandBus {
  const history: DesignerCommand[] = [];
  return {
    history,
    execute(command) {
      try {
        const result = command.execute();
        const ok = result == null || result.ok !== false;
        if (ok) history.push(command);
        return result ?? { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

export function commandDragNode(
  apply: () => void,
  revert: () => void,
  label = "Przesuń punkt"
): DesignerCommand {
  return {
    id: "dragNode",
    label,
    execute: () => {
      apply();
      return { ok: true };
    },
    undo: () => {
      revert();
      return { ok: true };
    },
  };
}

export function commandDeleteNode(
  apply: () => void,
  revert: () => void,
  label = "Usuń punkt"
): DesignerCommand {
  return {
    id: "deleteNode",
    label,
    execute: () => {
      apply();
      return { ok: true };
    },
    undo: () => {
      revert();
      return { ok: true };
    },
  };
}

export function commandMergeDegree2(
  apply: () => void,
  revert: () => void,
  label = "Scal punkty"
): DesignerCommand {
  return {
    id: "mergeDegree2",
    label,
    execute: () => {
      apply();
      return { ok: true };
    },
    undo: () => {
      revert();
      return { ok: true };
    },
  };
}

export function commandEndpointRewire(
  apply: () => void,
  revert: () => void,
  label = "Przepnij koniec odcinka"
): DesignerCommand {
  return {
    id: "endpointRewire",
    label,
    execute: () => {
      apply();
      return { ok: true };
    },
    undo: () => {
      revert();
      return { ok: true };
    },
  };
}

export function commandPassageLocalEdit(
  apply: () => void,
  revert: () => void,
  label = "Edytuj przejazd lokalny"
): DesignerCommand {
  return {
    id: "passageLocalEdit",
    label,
    execute: () => {
      apply();
      return { ok: true };
    },
    undo: () => {
      revert();
      return { ok: true };
    },
  };
}

export function commandTemplatePassageEdit(
  apply: () => void,
  revert: () => void,
  label = "Edytuj przejazd szablonu"
): DesignerCommand {
  return {
    id: "templatePassageEdit",
    label,
    execute: () => {
      apply();
      return { ok: true };
    },
    undo: () => {
      revert();
      return { ok: true };
    },
  };
}
