import { useMemo } from "react";
import type { LabelTemplate } from "../../types/labelSystem";
import type { ValidationResult } from "./validationTypes";
import { validateTemplate } from "./validateTemplate";

/**
 * Runs template validation when template changes.
 * Uses useMemo so validation recalculates only when template (elements / template_type) changes.
 */
export function useTemplateValidation(template: LabelTemplate): ValidationResult {
  return useMemo(() => validateTemplate(template), [
    template?.elements,
    template?.template_type,
  ]);
}
