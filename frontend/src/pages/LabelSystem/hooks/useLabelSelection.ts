import { useState, useCallback, useEffect, useMemo } from "react";
import type { LabelTemplate, LabelElement, TemplateElement } from "../../../types/labelSystem";
import { generateId } from "../utils/id";

export function useLabelSelection(
  template: LabelTemplate,
  onTemplateChange: (t: LabelTemplate) => void
) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const deleteElement = useCallback(
    (id: string) => {
      onTemplateChange({
        ...template,
        elements: template.elements.filter((e) => e.id !== id),
        updatedAt: new Date().toISOString(),
      });
      if (selectedId === id) setSelectedId(null);
    },
    [template, onTemplateChange, selectedId]
  );

  const selected = template.elements.find((e) => e.id === selectedId);
  const sortedElements = useMemo(
    () => [...template.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [template.elements]
  );

  const overlayElementsOrdered = useMemo(() => {
    if (!selectedId) return sortedElements;
    const selectedEl = sortedElements.find((e) => e.id === selectedId);
    if (!selectedEl) return sortedElements;
    return [...sortedElements.filter((e) => e.id !== selectedId), selectedEl];
  }, [sortedElements, selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput =
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA" ||
          (document.activeElement as HTMLElement).isContentEditable);
      if (inInput) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          deleteElement(selectedId);
        }
      }
      if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (selectedId) {
          const el = template.elements.find((e) => e.id === selectedId);
          if (el && "type" in el) {
            const dup = { ...el, id: generateId() } as TemplateElement;
            if (dup.type === "group" && "elements" in dup)
              dup.elements = (dup.elements as LabelElement[]).map((c) => ({ ...c, id: generateId() }));
            if (
              dup.type === "repeater" &&
              "template" in dup &&
              dup.template?.elements
            )
              dup.template = {
                elements: dup.template.elements.map((c) => ({ ...c, id: generateId() })),
              };
            onTemplateChange({
              ...template,
              elements: [...template.elements, dup],
              updatedAt: new Date().toISOString(),
            });
            setSelectedId(dup.id);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteElement, template, onTemplateChange]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-element-id]") || target.closest("[data-draggable-wrapper]")) return;
    setSelectedId(null);
  }, []);

  return {
    selectedId,
    setSelectedId,
    selected,
    overlayElementsOrdered,
    handleCanvasMouseDown,
    deleteElement,
  };
}
