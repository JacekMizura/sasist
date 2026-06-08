/** Triggers React Router error boundary with HTTP 404. */
export default function RouteNotFoundThrow() {
  throw new Response("Nie znaleziono strony", { status: 404, statusText: "Not Found" });
}
