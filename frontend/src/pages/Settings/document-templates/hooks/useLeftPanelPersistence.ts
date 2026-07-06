import { useCallback, useEffect, useState } from "react";

export type LeftPanelTab = "variables" | "helpers" | "tags" | "partials" | "base" | "assignments";

const TAB_KEY = "dte-left-tab";

function sectionsKey(templateId: number) {
  return `dte-left-sections-${templateId}`;
}

function readTab(): LeftPanelTab {
  try {
    const raw = localStorage.getItem(TAB_KEY);
    if (
      raw === "variables" ||
      raw === "helpers" ||
      raw === "tags" ||
      raw === "partials" ||
      raw === "base" ||
      raw === "assignments"
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "variables";
}

function readSections(templateId: number): Set<string> {
  try {
    const raw = localStorage.getItem(sectionsKey(templateId));
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

export function useLeftPanelPersistence(templateId: number) {
  const [tab, setTabState] = useState<LeftPanelTab>(readTab);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => readSections(templateId));

  useEffect(() => {
    setExpandedSections(readSections(templateId));
  }, [templateId]);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* ignore */
    }
  }, [tab]);

  useEffect(() => {
    try {
      localStorage.setItem(sectionsKey(templateId), JSON.stringify([...expandedSections]));
    } catch {
      /* ignore */
    }
  }, [expandedSections, templateId]);

  const setTab = useCallback((next: LeftPanelTab) => setTabState(next), []);

  const toggleSection = useCallback((label: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  return { tab, setTab, expandedSections, toggleSection, setExpandedSections };
}
