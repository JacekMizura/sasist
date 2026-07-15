import logoUrl from "../../assets/logo/sasist-logo.svg";
import markUrl from "../../assets/logo/sasist-mark.svg";

type SasistLogoProps = {
  className?: string;
  alt?: string;
  /** Hexagon mark only. */
  markOnly?: boolean;
};

/** Horizontal Sasist wordmark / mark for app chrome. */
export default function SasistLogo({
  className = "h-8 w-auto max-w-full",
  alt = "Sasist",
  markOnly = false,
}: SasistLogoProps) {
  return <img src={markOnly ? markUrl : logoUrl} alt={alt} className={className} draggable={false} />;
}
