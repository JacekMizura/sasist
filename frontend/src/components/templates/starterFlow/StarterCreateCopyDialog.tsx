import { useEffect, useId, useState } from "react";

import {
  Dialog,
  Input,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  typography,
} from "@/design-system";

import {
  STARTER_CREATE_CANCEL_LABEL,
  STARTER_CREATE_CONFIRM_LABEL,
  STARTER_CREATE_DIALOG_DESCRIPTION,
  STARTER_CREATE_DIALOG_TITLE,
  STARTER_CREATE_NAME_LABEL,
  defaultStarterCopyName,
} from "./starterFlowCopy";

export type StarterCreateCopyDialogProps = {
  open: boolean;
  starterName: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void | Promise<void>;
};

/**
 * Shared wizard: name the user copy of an immutable system starter, then create + open editor.
 */
export function StarterCreateCopyDialog({
  open,
  starterName,
  pending = false,
  onClose,
  onConfirm,
}: StarterCreateCopyDialogProps) {
  const nameId = useId();
  const [name, setName] = useState(() => defaultStarterCopyName(starterName));

  useEffect(() => {
    if (open) setName(defaultStarterCopyName(starterName));
  }, [open, starterName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !pending;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      size="md"
      aria-label={STARTER_CREATE_DIALOG_TITLE}
      footer={
        <>
          <SecondaryButton type="button" className="mr-auto" disabled={pending} onClick={onClose}>
            {STARTER_CREATE_CANCEL_LABEL}
          </SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={!canSubmit}
            onClick={() => void onConfirm(trimmed)}
          >
            {pending ? "Tworzenie…" : STARTER_CREATE_CONFIRM_LABEL}
          </PrimaryButton>
        </>
      }
    >
      <PageHeader className="!mt-0" title={<h2 className={typography.h1}>{STARTER_CREATE_DIALOG_TITLE}</h2>}>
        <p className={typography.pageDesc}>{STARTER_CREATE_DIALOG_DESCRIPTION}</p>
        <div className="mt-4 space-y-1.5">
          <label htmlFor={nameId} className={typography.label}>
            {STARTER_CREATE_NAME_LABEL}
          </label>
          <Input
            id={nameId}
            value={name}
            disabled={pending}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                void onConfirm(trimmed);
              }
            }}
          />
        </div>
      </PageHeader>
    </Dialog>
  );
}
