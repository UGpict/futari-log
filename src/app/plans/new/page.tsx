import type { Metadata } from "next";
import { PlanForm } from "@/features/home/plan-form";
import { tokyoToday } from "@/config/public";
import { PlanPageHeader } from "./plan-page-header";
import styles from "./plan-page.module.css";

export const metadata: Metadata = {
  title: "新しいプランを作る | FutariLog",
};

const steps = ["activity", "schedule", "details"] as const;

export default async function NewPlanPage({ searchParams }: {
  searchParams: Promise<{ date?: string; wish?: string; step?: string }>;
}) {
  const query = await searchParams;
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date! : tokyoToday();
  const initialStep = Math.max(0, steps.indexOf(query.step as (typeof steps)[number]));

  return (
    <main className={styles.page}>
      <div className={styles.app}>
        <PlanPageHeader />
        <PlanForm initialDate={initialDate} initialWish={query.wish} initialStep={initialStep} fullPage />
      </div>
    </main>
  );
}
