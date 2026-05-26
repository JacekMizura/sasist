/**
 * Bleeds content to cancel horizontal padding of a parent {@link ../ui/PageCard} (`p-5` → `-mx-5`).
 */
export default function PanelPageContentBleed({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 min-w-0 w-[calc(100%+2.5rem)] max-w-none">
      {children}
    </div>
  );
}
