import type { Plan, Session, Spot } from "@/domain/schemas";

export function listedOnCalendar(session: Pick<Session, "status" | "currentPlanVersion">): boolean {
  if (
    session.status === "CONFIRMED" ||
    session.status === "IN_PROGRESS" ||
    session.status === "DONE" ||
    session.status === "REFLECTED"
  ) {
    return true;
  }
  return session.status === "DRAFT" && session.currentPlanVersion != null;
}

export function calendarTitle(bundle: {
  session: Session;
  planHistory: Record<string, Plan>;
  spots: Record<string, Spot>;
}): string {
  const plan = bundle.session.currentPlanVersion
    ? bundle.planHistory[String(bundle.session.currentPlanVersion)]
    : null;
  if (plan?.items.length) {
    const names = plan.items
      .map((item) => bundle.spots[item.spotId]?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length) return names.slice(0, 2).join("・");
  }
  return `${bundle.session.input.meet.name}のプラン`;
}
