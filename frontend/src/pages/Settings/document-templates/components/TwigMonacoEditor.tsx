import Editor, { type OnMount } from "@monaco-editor/react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import {
  liveValidateDocumentTemplate,
  type EditorCatalogItem,
  type ValidationReport,
  type VariableFieldDto,
  type VariableTreeNode,
} from "../../../../api/documentTemplatesApi";
import { DEFAULT_TENANT_ID } from "../constants";

export type TwigEditorHandle = {
  insertSnippet: (snippet: string) => void;
  goToLine: (line: number, column?: number) => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  kindCode?: string;
  variableTree?: VariableTreeNode[];
  variableFields?: VariableFieldDto[];
  helpers?: EditorCatalogItem[];
  tags?: EditorCatalogItem[];
  onValidationChange?: (report: ValidationReport | null) => void;
};

export const TwigMonacoEditor = forwardRef<TwigEditorHandle, Props>(function TwigMonacoEditor(
  {
    value,
    onChange,
    kindCode,
    variableTree = [],
    variableFields = [],
    helpers = [],
    tags = [],
    onValidationChange,
  },
  ref,
) {
  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const validateTimer = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    insertSnippet(snippet: string) {
      const editor = editorRef.current;
      if (!editor) return;
      const selection = editor.getSelection();
      if (!selection) return;
      editor.executeEdits("insert", [{ range: selection, text: snippet, forceMoveMarkers: true }]);
      editor.focus();
    },
    goToLine(line: number, column = 1) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column });
      editor.focus();
    },
  }));

  useEffect(() => {
    if (!kindCode || !onValidationChange) return;
    if (validateTimer.current) window.clearTimeout(validateTimer.current);
    validateTimer.current = window.setTimeout(() => {
      liveValidateDocumentTemplate(DEFAULT_TENANT_ID, { kind_code: kindCode, twig_content: value })
        .then((report) => {
          onValidationChange(report);
          applyMarkers(report);
        })
        .catch(() => onValidationChange(null));
    }, 450);
    return () => {
      if (validateTimer.current) window.clearTimeout(validateTimer.current);
    };
  }, [value, kindCode, onValidationChange]);

  function applyMarkers(report: ValidationReport) {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const markers = report.issues
      .filter((i) => i.line)
      .map((issue) => ({
        startLineNumber: issue.line!,
        startColumn: issue.column ?? 1,
        endLineNumber: issue.line!,
        endColumn: (issue.column ?? 1) + 8,
        message: issue.message,
        severity: monaco.MarkerSeverity.Error,
      }));
    monaco.editor.setModelMarkers(model, "twig-live", markers);
  }

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.languages.registerCompletionItemProvider("html", {
      triggerCharacters: ["{", ".", "|", " "],
      provideCompletionItems: (model, position) => {
        const textUntil = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const prefixMatch = textUntil.match(/(?:\{\{\s*|\{%\s*for\s+\w+\s+in\s+|)([a-zA-Z0-9_.\[\]]*)$/);
        const prefix = prefixMatch?.[1] ?? "";

        if (prefix.includes(".") || prefix.endsWith("[]")) {
          const parentPrefix = prefix.endsWith(".") ? prefix : `${prefix}.`;
          const matches = variableFields.filter((f) => {
            const p = f.path.replace("[]", "");
            if (prefix.endsWith(".")) {
              return p.startsWith(prefix.slice(0, -1) + ".") && p.split(".").length === prefix.slice(0, -1).split(".").length + 1;
            }
            return p.startsWith(prefix);
          });
          return {
            suggestions: matches.slice(0, 40).map((f) => ({
              label: f.path.split(".").pop() ?? f.path,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: f.path.replace("[]", "").split(".").pop() ?? f.path,
              detail: f.type,
              documentation: f.description,
              range,
            })),
          };
        }

        const roots = [...new Set(variableFields.map((f) => f.path.split(".")[0].split("[")[0]))];
        const suggestions = [
          ...roots.map((r) => ({
            label: r,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: r,
            detail: "Zmienna",
            range,
          })),
          ...helpers.map((h) => ({
            label: h.name,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: h.insert,
            detail: "Funkcja",
            range,
          })),
          ...tags.map((t) => ({
            label: t.name,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: t.insert,
            detail: "Tag",
            range,
          })),
        ];
        return { suggestions };
      },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Edytor szablonu
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          defaultLanguage="html"
          theme="vs-light"
          value={value}
          onChange={(v) => onChange(v ?? "")}
          onMount={onMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            lineNumbers: "on",
            renderLineHighlight: "all",
            quickSuggestions: { other: true, strings: true },
          }}
        />
      </div>
    </div>
  );
});

function flattenVariables(nodes: VariableTreeNode[], out: { label: string; insert: string }[] = []) {
  for (const node of nodes) {
    if (node.insert) out.push({ label: node.label, insert: node.insert });
    if (node.children) flattenVariables(node.children, out);
  }
  return out;
}
