import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Factory,
  PackageCheck,
  PlayCircle,
} from "lucide-react";

export const PRODUCTION_ACCENT = {
  primary: "violet",
  gradient: "from-violet-700 via-violet-600 to-indigo-600",
  header: "from-violet-950 via-violet-900 to-indigo-950",
  surface: "bg-[#f4f2f8]",
  ring: "ring-violet-200/80",
} as const;

export type QueueSectionId = "planned" | "ready" | "in_progress" | "waiting" | "completed";

export type QueueSectionConfig = {
  id: QueueSectionId;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  headerClass: string;
  countClass: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyCta?: string;
};

export const QUEUE_SECTIONS: QueueSectionConfig[] = [
  {
    id: "planned",
    title: "Zaplanowane",
    subtitle: "Partie oczekujące w harmonogramie — w tym wieloproduktowe",
    icon: CalendarClock,
    headerClass: "bg-gradient-to-r from-slate-50 to-violet-50/60",
    countClass: "bg-slate-700 text-white",
    emptyTitle: "Brak zaplanowanych partii",
    emptyDescription: "Utwórz pierwszą partię masową — wybierz wiele produktów, ilości i zobacz zagregowane materiały.",
    emptyCta: "Utwórz partię produkcyjną",
  },
  {
    id: "ready",
    title: "Gotowe do produkcji",
    subtitle: "Materiały dostępne — operator może rozpocząć zbieranie",
    icon: PlayCircle,
    headerClass: "bg-gradient-to-r from-emerald-50 to-teal-50/80",
    countClass: "bg-emerald-600 text-white",
    emptyTitle: "Kolejka gotowych partii jest pusta",
    emptyDescription: "Gdy materiały będą dostępne, partie pojawią się tutaj z akcją startu zbierania.",
  },
  {
    id: "in_progress",
    title: "W trakcie realizacji",
    subtitle: "Zbieranie surowców, wykonanie lub odłożenie wyrobów",
    icon: Factory,
    headerClass: "bg-gradient-to-r from-violet-50 to-indigo-50/80",
    countClass: "bg-violet-600 text-white",
    emptyTitle: "Żadna partia nie jest w toku",
    emptyDescription: "Uruchom zbieranie z partii gotowej — postęp pojawi się tutaj na żywo.",
  },
  {
    id: "waiting",
    title: "Oczekuje na materiały",
    subtitle: "Partie zablokowane brakami składników",
    icon: AlertTriangle,
    headerClass: "bg-gradient-to-r from-amber-50 to-orange-50/80",
    countClass: "bg-amber-600 text-white",
    emptyTitle: "Brak blokad materiałowych",
    emptyDescription: "Świetnie — wszystkie zaplanowane partie mają wystarczający stan magazynowy.",
  },
  {
    id: "completed",
    title: "Zakończone dziś",
    subtitle: "Partie ukończone w bieżącym dniu roboczym",
    icon: CheckCircle2,
    headerClass: "bg-gradient-to-r from-emerald-50/80 to-slate-50",
    countClass: "bg-emerald-700 text-white",
    emptyTitle: "Dziś bez ukończonych partii",
    emptyDescription: "Po zakończeniu odkładania wyrobów partie trafią tutaj jako podsumowanie dnia.",
  },
];

export const PIPELINE_STAGES = [
  { key: "collecting", label: "Zbieranie", icon: ClipboardList, tone: "text-amber-600 bg-amber-50 border-amber-200" },
  { key: "execute", label: "Wykonanie", icon: Factory, tone: "text-blue-600 bg-blue-50 border-blue-200" },
  { key: "putaway", label: "Odłożenie", icon: PackageCheck, tone: "text-emerald-600 bg-emerald-50 border-emerald-200" },
] as const;

export function priorityStripe(priority?: string | null, hasShortages?: boolean): string {
  if (priority === "high") return "bg-rose-500";
  if (priority === "blocked" || hasShortages) return "bg-amber-500";
  if (priority === "urgent") return "bg-orange-500";
  return "bg-violet-500";
}

export function priorityLabel(priority?: string | null, hasShortages?: boolean): string | null {
  if (priority === "high") return "Priorytet wysoki";
  if (priority === "blocked" || (hasShortages && priority !== "high")) return "Zablokowana";
  if (priority === "urgent") return "Pilna";
  return null;
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
}
