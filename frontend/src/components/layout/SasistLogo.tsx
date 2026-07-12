type SasistLogoProps = {
  className?: string;
  alt?: string;
};

/** Horizontal Sasist wordmark for app chrome (sidebar, modals). */
export default function SasistLogo({ className = "h-8 w-auto max-w-full", alt = "Sasist" }: SasistLogoProps) {
  return <img src="/sasist-logo-poziome.svg" alt={alt} className={className} draggable={false} />;
}
