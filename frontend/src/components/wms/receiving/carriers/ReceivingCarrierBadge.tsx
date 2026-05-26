import { CarrierBadge } from "../../../warehouse/carriers/CarrierBadge";

type Props = {
  code: string;
  className?: string;
};

/** Badge nośnika na ekranie przyjęcia PZ (wizualnie jak CarrierBadge). */
export function ReceivingCarrierBadge({ code, className }: Props) {
  return <CarrierBadge code={code} className={className} />;
}
