/** Czy sesja nawigacyjna to zbieranie BEZ fizycznego wózka (cartless).
 *  Sesja WmsOperationSession z cart_id NIE jest cartless — mimo że ma pickingSessionId.
 */
export function isCartlessPickingSession(
  session: {
    cartless?: boolean | null;
    cartId?: number | null;
    pickingSessionId?: number | null;
  } | null | undefined,
): boolean {
  if (!session) return false;
  if (session.cartId != null && session.cartId > 0) return false;
  if (session.cartless === true) return true;
  return session.pickingSessionId != null && session.pickingSessionId > 0;
}
