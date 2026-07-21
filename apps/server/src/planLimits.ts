import { db, queryOne } from "./db";
import { PlanInfo, SubscriptionPlan } from "@automate/shared";

const DAILY_LIMITS: Record<SubscriptionPlan, number | null> = {
  free: 5,
  builder: 30,
  pro: null, // unlimited
  enterprise: null, // unlimited
};

export const PLAN_PRICES: Record<"builder" | "pro", number> = {
  builder: 1500,
  pro: 3500,
};

interface UserPlanRow {
  plan: SubscriptionPlan;
  plan_renews_at: string | null;
  creations_today: number;
  creations_date: string | null;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A lapsed paid plan reverts to free rather than silently staying unlimited forever. */
function effectivePlan(row: UserPlanRow): SubscriptionPlan {
  if (row.plan === "free") return "free";
  if (row.plan_renews_at && new Date(row.plan_renews_at) < new Date()) return "free";
  return row.plan;
}

interface PlanState {
  plan: SubscriptionPlan;
  planRenewsAt: string | null;
  dailyCreationLimit: number | null;
  creationsToday: number;
}

/** The single source of truth for "what plan is this user effectively on today". */
function getPlanState(userId: string): PlanState {
  const row = queryOne<UserPlanRow>(
    "SELECT plan, plan_renews_at, creations_today, creations_date FROM users WHERE id = ?",
    userId
  ) as UserPlanRow;

  const plan = effectivePlan(row);
  return {
    plan,
    planRenewsAt: row.plan_renews_at,
    dailyCreationLimit: DAILY_LIMITS[plan],
    // The counter only counts if it was incremented today - otherwise it's
    // yesterday's stale number and today starts from zero.
    creationsToday: row.creations_date === todayString() ? row.creations_today : 0,
  };
}

export function getPlanInfo(userId: string): PlanInfo {
  return getPlanState(userId);
}

/**
 * Call before creating an automation or email automation - both count against
 * the same daily quota. Returns an error message if the plan's daily limit is
 * already used up, or increments the counter and returns null to proceed.
 */
export function checkAndConsumeCreationQuota(userId: string): string | null {
  const { plan, dailyCreationLimit, creationsToday } = getPlanState(userId);

  if (dailyCreationLimit !== null && creationsToday >= dailyCreationLimit) {
    return `Daily automation creation limit reached (${dailyCreationLimit}/day on the ${plan} plan). Upgrade your plan for more.`;
  }

  db.prepare("UPDATE users SET creations_today = ?, creations_date = ? WHERE id = ?").run(
    creationsToday + 1,
    todayString(),
    userId
  );
  return null;
}
