import type { Metadata } from "next";
import { PlanForm } from "@/features/home/plan-form";
import { tokyoToday } from "@/config/public";
import { resolvePlanFormSeed } from "@/features/home/plan-seed";
import { PlanPageHeader } from "./plan-page-header";
import styles from "./plan-page.module.css";

export const metadata: Metadata = {
  title: "新しいプランを作る | FutariLog",
};

const steps = ["activity", "schedule", "details"] as const;

export default async function NewPlanPage({ searchParams }: {
  searchParams: Promise<{ date?: string; wish?: string; step?: string; seed?: string }>;
}) {
  const query = await searchParams;
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date! : tokyoToday();
  const initialStep = Math.max(0, steps.indexOf(query.step as (typeof steps)[number]));
  const seed = resolvePlanFormSeed(query.seed);
  const initialWish = seed?.wish ?? query.wish;

  return (
    <main className={styles.page}>
      <div className={styles.app}>
        <PlanPageHeader />
        <PlanForm
          initialDate={initialDate}
          initialWish={initialWish}
          seed={seed}
          seedParam={query.seed}
          initialStep={initialStep}
          fullPage
        />
      </div>
    </main>
  );
}
