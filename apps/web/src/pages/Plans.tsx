import { useEffect, useState } from "react";
import type { PlanInfo, SubscriptionPlan } from "@automate/shared";
import { api } from "../api";

interface Tier {
  plan: SubscriptionPlan;
  title: string;
  price: string;
  features: string[];
}

const TIERS: Tier[] = [
  {
    plan: "free",
    title: "Free (Starter)",
    price: "0 BDT/month",
    features: ["5 API creation attempts per day", "Good for trying things out"],
  },
  {
    plan: "builder",
    title: "Builder",
    price: "1,500 BDT/month",
    features: ["30 API creation attempts per day", "Unlimited runs on saved APIs", "Priority support"],
  },
  {
    plan: "pro",
    title: "Pro",
    price: "3,500 BDT/month",
    features: [
      "Unlimited API creation attempts",
      "Unlimited runs",
      "Marketplace seller access with lower platform fees",
      "Early access to new features",
    ],
  },
  {
    plan: "enterprise",
    title: "Enterprise",
    price: "Custom pricing",
    features: ["Everything in Pro", "Team accounts", "Dedicated support", "Custom billing arrangements"],
  },
];

export default function Plans() {
  const [info, setInfo] = useState<PlanInfo | null>(null);
  const [error, setError] = useState("");
  const [busyPlan, setBusyPlan] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    api.getSubscription().then(setInfo).catch((err) => setError(err.message));
  }, []);

  async function subscribe(plan: SubscriptionPlan) {
    if (plan === "enterprise") {
      window.alert("Enterprise is custom-priced - contact us to set up your plan.");
      return;
    }
    if (!window.confirm(`Subscribe to ${plan[0].toUpperCase()}${plan.slice(1)}? This is a mock charge - no real money moves yet.`)) {
      return;
    }
    setError("");
    setBusyPlan(plan);
    try {
      await api.subscribe(plan);
      setInfo(await api.getSubscription());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <div>
      <h2>Plans</h2>

      {info && (
        <div className="card">
          <p style={{ margin: 0 }}>
            Current plan: <span className="badge badge-pro">{info.plan}</span>{" "}
            {info.dailyCreationLimit === null ? (
              <span className="muted">Unlimited automation creation</span>
            ) : (
              <span className="muted">
                {info.creationsToday} / {info.dailyCreationLimit} automations created today
              </span>
            )}
          </p>
          {info.planRenewsAt && (
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Renews {new Date(info.planRenewsAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <p className="muted">
        Billed through bKash, with card and bank transfer also available. (Mock for now - no real charge is made.)
      </p>

      <div className="feature-grid">
        {TIERS.map((tier) => {
          const isCurrent = info?.plan === tier.plan;
          return (
            <div className={`card ${isCurrent ? "plan-current" : ""}`} key={tier.plan}>
              <h3>{tier.title}</h3>
              <p className="listing-price" style={{ margin: "6px 0 10px" }}>{tier.price}</p>
              <ul style={{ paddingLeft: 18, margin: "0 0 14px" }}>
                {tier.features.map((f) => (
                  <li key={f} className="muted" style={{ marginBottom: 4 }}>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="badge badge-pro">Current plan</span>
              ) : (
                <button
                  className={tier.plan === "enterprise" ? "secondary" : undefined}
                  disabled={busyPlan === tier.plan}
                  onClick={() => subscribe(tier.plan)}
                >
                  {tier.plan === "enterprise"
                    ? "Contact us"
                    : busyPlan === tier.plan
                      ? "Subscribing..."
                      : "Subscribe"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
