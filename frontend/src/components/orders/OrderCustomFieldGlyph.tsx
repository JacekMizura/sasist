import type { LucideIcon } from "lucide-react";

import {
  resolveOrderCustomFieldGlyph,
  type OrderCustomFieldGlyphResolved,
} from "./orderCustomFieldLucideIcon";

type Props = {
  type: string;
  settings: Record<string, unknown> | null | undefined;
  /** Kontener ikony — domyślnie 48×48 z wyśrodkowaniem i „contain”. */
  boxClassName?: string;
  lucideClassName?: string;
};

export default function OrderCustomFieldGlyph({
  type,
  settings,
  boxClassName = "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/70",
  lucideClassName = "h-6 w-6",
}: Props) {
  const g = resolveOrderCustomFieldGlyph(type, settings);
  return <GlyphInner resolved={g} boxClassName={boxClassName} lucideClassName={lucideClassName} />;
}

export function GlyphInner({
  resolved,
  boxClassName,
  lucideClassName,
}: {
  resolved: OrderCustomFieldGlyphResolved;
  boxClassName: string;
  lucideClassName: string;
}) {
  if (resolved.kind === "image") {
    return (
      <div className={boxClassName}>
        <img
          src={resolved.src}
          alt=""
          className="h-full w-full object-contain object-center"
          draggable={false}
        />
      </div>
    );
  }
  const Icon = resolved.Icon as LucideIcon;
  return (
    <div className={boxClassName}>
      <Icon className={lucideClassName} strokeWidth={2} aria-hidden />
    </div>
  );
}
