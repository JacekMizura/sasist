import { DiffEditor } from "@monaco-editor/react";
import { useEffect, useState } from "react";

import { compareDocumentVersions, type VersionCompareDto } from "../../../../api/documentTemplatesApi";
import type { DocumentTemplateVersionDto } from "../../../../api/documentTemplatesApi";

type Props = {
  versions: DocumentTemplateVersionDto[];
};

export function VersionComparePanel({ versions }: Props) {
  const [leftId, setLeftId] = useState<number | "">(versions[1]?.id ?? "");
  const [rightId, setRightId] = useState<number | "">(versions[0]?.id ?? "");
  const [data, setData] = useState<VersionCompareDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!leftId || !rightId || leftId === rightId) {
      setData(null);
      return;
    }
    setLoading(true);
    compareDocumentVersions(Number(leftId), Number(rightId))
      .then(setData)
      .finally(() => setLoading(false));
  }, [leftId, rightId]);

  return (
    <div className="flex h-full flex-col gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500">Porównaj:</span>
        <VersionSelect versions={versions} value={leftId} onChange={setLeftId} label="Wersja A" />
        <span className="text-slate-400">→</span>
        <VersionSelect versions={versions} value={rightId} onChange={setRightId} label="Wersja B" />
      </div>
      {loading ? <p className="text-slate-500">Ładowanie różnic…</p> : null}
      {data ? (
        <div className="min-h-[360px] flex-1 overflow-hidden rounded-lg border border-slate-200">
          <DiffEditor
            height="100%"
            language="html"
            original={data.left.twig_content}
            modified={data.right.twig_content}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      ) : (
        <p className="text-slate-500">Wybierz dwie różne wersje do porównania.</p>
      )}
    </div>
  );
}

function VersionSelect({
  versions,
  value,
  onChange,
  label,
}: {
  versions: DocumentTemplateVersionDto[];
  value: number | "";
  onChange: (v: number | "") => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1 text-slate-600">
      {label}
      <select
        className="rounded border border-slate-200 px-2 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
      >
        <option value="">—</option>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version_number} · {v.status_label ?? v.status}
          </option>
        ))}
      </select>
    </label>
  );
}
