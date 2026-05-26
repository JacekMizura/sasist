import type { LabelTemplate, TemplateElement, LabelElement, GroupElement, RepeaterElement } from "../../types/labelSystem";
import { buildPreviewRecord } from "../repeaterPreview/buildPreviewRecord";
import type { ValidationResult, ValidationIssue } from "./validationTypes";
import type { ValidationScope } from "./validationRules";
import {
  checkMissingVariable,
  checkMissingDataset,
  checkInvalidRepeater,
  checkBarcodeEmpty,
  checkSiblingRepeaterDatasetConflicts,
} from "./validationRules";

function walk(
  elements: TemplateElement[],
  scope: ValidationScope,
  previewRecord: Record<string, unknown>,
  pathPrefix: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  info: ValidationIssue[]
): void {
  checkSiblingRepeaterDatasetConflicts(elements, pathPrefix, warnings);
  for (const el of elements) {
    const path = pathPrefix ? `${pathPrefix}.${el.id}` : el.id;
    const ctx = { elementId: el.id, path };

    if (el.type === "group") {
      const group = el as GroupElement;
      walk(
        group.elements ?? [],
        scope,
        previewRecord,
        path,
        errors,
        warnings,
        info
      );
      continue;
    }

    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      errors.push(...checkInvalidRepeater(rep, ctx));
      const datasetIssue = checkMissingDataset(rep.dataset, previewRecord, ctx);
      if (datasetIssue) errors.push(datasetIssue);
      const nested = rep.template?.elements ?? [];
      const datasetScope: ValidationScope = { type: "dataset", dataset: rep.dataset };
      walk(
        nested as TemplateElement[],
        datasetScope,
        previewRecord,
        path,
        errors,
        warnings,
        info
      );
      continue;
    }

    const labelEl = el as LabelElement;
    const missingVar = checkMissingVariable(labelEl, scope, previewRecord, ctx);
    if (missingVar) warnings.push(missingVar);
    const barcodeEmpty = checkBarcodeEmpty(labelEl, scope, previewRecord, ctx);
    if (barcodeEmpty) warnings.push(barcodeEmpty);
  }
}

/**
 * Validates a label template against preview data.
 * Uses buildPreviewRecord when previewRecord is not provided.
 */
export function validateTemplate(
  template: LabelTemplate,
  previewRecord?: Record<string, unknown>
): ValidationResult {
  const record = previewRecord ?? buildPreviewRecord(template);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  const elements = template.elements ?? [];
  walk(
    elements,
    { type: "root" },
    record,
    "",
    errors,
    warnings,
    info
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}
