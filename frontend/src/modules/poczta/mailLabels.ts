export type MailCorrespondenceBucket =
  | "awaiting_me"
  | "assigned_to_me"
  | "unassigned"
  | "open"
  | "in_progress"
  | "waiting_customer"
  | "closed"
  | "spam"
  | "trash";

export const MAIL_STATUS_LABELS: Record<string, string> = {
  OPEN: "Otwarte",
  IN_PROGRESS: "W toku",
  WAITING_CUSTOMER: "Oczekuje na klienta",
  CLOSED: "Zamknięte",
  SPAM: "Spam",
  TRASH: "Kosz",
};

export const MAIL_PRIORITY_LABELS: Record<string, string> = {
  NONE: "Brak",
  LOW: "Niski",
  NORMAL: "Normalny",
  HIGH: "Wysoki",
  URGENT: "Pilny",
};

export const MAIL_DELIVERY_LABELS: Record<string, string> = {
  PENDING: "Oczekuje",
  SENDING: "Wysyłanie",
  SENT: "Wysłano",
  FAILED: "Błąd",
};

export const MAIL_SIDEBAR_SECTIONS: {
  title: string;
  items: { bucket: MailCorrespondenceBucket; label: string }[];
}[] = [
  {
    title: "Moje",
    items: [
      { bucket: "awaiting_me", label: "Oczekujące na mnie" },
      { bucket: "assigned_to_me", label: "Przypisane do mnie" },
    ],
  },
  {
    title: "Ogólne",
    items: [
      { bucket: "unassigned", label: "Nieprzypisane" },
      { bucket: "open", label: "Otwarte" },
      { bucket: "in_progress", label: "W toku" },
      { bucket: "waiting_customer", label: "Oczekuje na klienta" },
      { bucket: "closed", label: "Zamknięte" },
    ],
  },
  {
    title: "Systemowe",
    items: [
      { bucket: "spam", label: "Spam" },
      { bucket: "trash", label: "Kosz" },
    ],
  },
];

export function showPriorityBadge(priority: string): boolean {
  const p = (priority || "NORMAL").toUpperCase();
  return p !== "NONE" && p !== "NORMAL";
}
