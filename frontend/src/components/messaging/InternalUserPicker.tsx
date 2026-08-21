/**
 * Internal AppUser picker for send_email recipient_type=INTERNAL.
 */
import { useEffect, useState } from "react";

import { fetchUsers, type AppUserListItem } from "../../api/authApi";

type Props = {
  value: number | "";
  onChange: (userId: number | "") => void;
  disabled?: boolean;
  inputClassName?: string;
};

export function InternalUserPicker({ value, onChange, disabled, inputClassName }: Props) {
  const [users, setUsers] = useState<AppUserListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchUsers()
      .then((rows) => {
        if (!cancelled) {
          setUsers(
            (rows ?? []).filter((u) => u.is_active !== false && Boolean(String(u.email || "").trim())),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([]);
          setError("Nie udało się wczytać użytkowników");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-xs text-slate-500">Ładowanie użytkowników…</p>;
  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (users.length === 0) {
    return <p className="text-xs text-amber-800">Brak aktywnych użytkowników z adresem e-mail.</p>;
  }

  return (
    <select
      className={inputClassName ?? "mt-1 block min-w-[12rem] rounded border border-slate-200 px-2 py-1.5 text-sm"}
      disabled={disabled}
      value={value === "" ? "" : String(value)}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? "" : Number(v));
      }}
    >
      <option value="">— wybierz użytkownika —</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.login} ({u.email})
        </option>
      ))}
    </select>
  );
}
