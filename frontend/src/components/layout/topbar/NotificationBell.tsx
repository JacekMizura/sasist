import { Bell } from "lucide-react";
import { Link } from "react-router-dom";

type Props = {
  count: number;
  /** Destination for alerts (keep existing dashboard/alerts path). */
  to?: string;
};

export default function NotificationBell({ count, to = "/dashboard" }: Props) {
  const label = count > 0 ? `${count} powiadomień` : "Powiadomienia";
  const badge = count > 99 ? "99+" : String(count);

  return (
    <Link
      to={to}
      title={label}
      aria-label={label}
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#64748B] transition-colors duration-150 ease-out hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
    >
      <Bell className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
      {count > 0 ? (
        <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[11px] font-bold leading-none text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
