import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { extractApiErrorMessage } from "@/api/apiErrorMessage";

import { StarterCreateCopyDialog } from "./StarterCreateCopyDialog";

export type StarterCreateCopyResult = {
  /** Absolute or app path to the standard editor for the new user template. */
  editorPath: string;
  /** Optional navigate state (e.g. label designer hydration). */
  editorState?: unknown;
};

export type StarterUseRequest = {
  starterName: string;
  /**
   * Persist a new user-owned template from the starter and return where to open the editor.
   * Must not mutate the system starter.
   */
  createCopy: (name: string) => Promise<StarterCreateCopyResult>;
};

/**
 * Shared Starter → copy wizard → editor flow for all Szablony modules.
 */
export function useStarterTemplateFlow() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [starterName, setStarterName] = useState("");
  const [createCopy, setCreateCopy] = useState<StarterUseRequest["createCopy"] | null>(null);

  const close = useCallback(() => {
    if (pending) return;
    setOpen(false);
    setCreateCopy(null);
  }, [pending]);

  const requestUseStarter = useCallback((req: StarterUseRequest) => {
    if (pending) return;
    setStarterName(req.starterName);
    setCreateCopy(() => req.createCopy);
    setOpen(true);
  }, [pending]);

  const confirmCreate = useCallback(
    async (name: string) => {
      if (!createCopy || pending) return;
      setPending(true);
      try {
        const result = await createCopy(name);
        setOpen(false);
        setCreateCopy(null);
        toast.success("Utworzono szablon.");
        if (result.editorState !== undefined) {
          navigate(result.editorPath, { state: result.editorState });
        } else {
          navigate(result.editorPath);
        }
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć szablonu."));
      } finally {
        setPending(false);
      }
    },
    [createCopy, navigate, pending],
  );

  const dialog = (
    <StarterCreateCopyDialog
      open={open}
      starterName={starterName}
      pending={pending}
      onClose={close}
      onConfirm={confirmCreate}
    />
  );

  return {
    open,
    pending,
    requestUseStarter,
    close,
    dialog,
  };
}
