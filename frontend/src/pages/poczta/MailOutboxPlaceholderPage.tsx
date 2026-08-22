import { Send } from "lucide-react";

import { AppEmptyState } from "../../components/app-shell";

export default function MailOutboxPlaceholderPage() {
  return (
    <AppEmptyState
      icon={Send}
      title="Skrzynka nadawcza"
      description="Podgląd wysłanych wiadomości i statusów dostarczenia — w Phase 3 modułu Poczta."
    />
  );
}
