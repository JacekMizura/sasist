import { useRef } from "react";
import {
  Copy,
  Download,
  FileImage,
  FileJson,
  FileUp,
  MoreHorizontal,
  RotateCcw,
  Save,
  Settings2,
  Upload,
} from "lucide-react";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import {
  labelDesignerMoreMenuItemClass,
  labelDesignerMoreMenuPanelClass,
  labelDesignerToolbarSecondaryBtnClass,
} from "../labelDesignerToolbarTokens";

export type LabelDesignerMoreMenuHandlers = {
  onImportSvg: (file: File) => void;
  onImportImage: (file: File) => void;
  onExportTemplate: () => void;
  onImportTemplate: (file: File) => void;
  onSaveAs: () => void;
  onDuplicate: () => void;
  onResetProject: () => void;
  onOpenProjectSettings: () => void;
  exportDisabled?: boolean;
  duplicateDisabled?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handlers: LabelDesignerMoreMenuHandlers;
};

export function LabelDesignerMoreMenu({ open, onOpenChange, handlers }: Props) {
  const svgRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: "bottom-end",
    strategy: "fixed",
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const close = () => onOpenChange(false);

  const items: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }> = [
    {
      key: "svg",
      label: "Import SVG",
      icon: <FileUp className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />,
      onClick: () => svgRef.current?.click(),
    },
    {
      key: "img",
      label: "Import PNG/JPG",
      icon: <FileImage className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />,
      onClick: () => imageRef.current?.click(),
    },
    {
      key: "export",
      label: "Eksport szablonu",
      icon: <Download className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />,
      onClick: () => {
        handlers.onExportTemplate();
        close();
      },
      disabled: handlers.exportDisabled,
    },
    {
      key: "import",
      label: "Import szablonu",
      icon: <Upload className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />,
      onClick: () => jsonRef.current?.click(),
    },
    {
      key: "saveas",
      label: "Zapisz jako…",
      icon: <Save className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />,
      onClick: () => {
        handlers.onSaveAs();
        close();
      },
    },
    {
      key: "dup",
      label: "Duplikuj",
      icon: <Copy className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />,
      onClick: () => {
        handlers.onDuplicate();
        close();
      },
      disabled: handlers.duplicateDisabled,
    },
    {
      key: "reset",
      label: "Resetuj projekt",
      icon: <RotateCcw className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />,
      onClick: () => {
        if (window.confirm("Wyczyścić wszystkie elementy z płótna? Tej operacji nie można cofnąć.")) {
          handlers.onResetProject();
          close();
        }
      },
    },
    {
      key: "settings",
      label: "Ustawienia projektu",
      icon: <Settings2 className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />,
      onClick: () => {
        handlers.onOpenProjectSettings();
        close();
      },
    },
  ];

  return (
    <>
      <input
        ref={svgRef}
        type="file"
        accept=".svg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlers.onImportSvg(f);
          e.target.value = "";
          close();
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlers.onImportImage(f);
          e.target.value = "";
          close();
        }}
      />
      <input
        ref={jsonRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlers.onImportTemplate(f);
          e.target.value = "";
          close();
        }}
      />
      <button
        type="button"
        ref={refs.setReference}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${labelDesignerToolbarSecondaryBtnClass} gap-1.5 px-3`}
        {...getReferenceProps()}
      >
        <MoreHorizontal className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden />
        Więcej
      </button>
      {open && (
        <FloatingPortal>
          <div ref={refs.setFloating} style={floatingStyles} className={labelDesignerMoreMenuPanelClass} {...getFloatingProps()}>
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                className={labelDesignerMoreMenuItemClass}
                onClick={item.onClick}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
