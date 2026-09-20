import { z } from "zod";

export const calendarPlanStatusSchema = z.enum([
  "DRAFT",
  "CONFIRMED",
  "IN_PROGRESS",
  "DONE",
  "REFLECTED",
]);

export const calendarPlanSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string(),
  endTime: z.string(),
  status: calendarPlanStatusSchema,
  title: z.string(),
});
export type CalendarPlan = z.infer<typeof calendarPlanSchema>;

export const calendarListStateSchema = z.enum(["ok", "empty"]);
export type CalendarListState = z.infer<typeof calendarListStateSchema>;

export const calendarListResponseSchema = z.object({
  plans: z.array(calendarPlanSchema),
  from: z.string().nullable(),
  to: z.string().nullable(),
  state: calendarListStateSchema,
  draftPolicy: z.literal("listed_when_plan_exists"),
});
export type CalendarListResponse = z.infer<typeof calendarListResponseSchema>;
