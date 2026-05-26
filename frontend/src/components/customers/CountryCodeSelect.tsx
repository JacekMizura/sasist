import { COUNTRY_OPTIONS } from "../../constants/countryCodes";

type Props = {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  id?: string;
};

export default function CountryCodeSelect({ value, onChange, className, id }: Props) {
  const v = (value || "PL").trim().toUpperCase() || "PL";
  return (
    <select
      id={id}
      className={className}
      value={v}
      onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
    >
      {COUNTRY_OPTIONS.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c.name} ({c.code})
        </option>
      ))}
    </select>
  );
}
