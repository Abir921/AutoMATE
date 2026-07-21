import type { Automation } from "@automate/shared";

/**
 * Shown only for marketplace-purchased copies: how many uses / how much
 * subscription time is left on this automation's license.
 */
export default function LicenseStatusCard({ automation }: { automation: Automation }) {
  const { licenseMode, usesRemaining, subscriptionExpiresAt } = automation;
  if (licenseMode === "unlimited") return null;

  const metered = licenseMode === "single" || licenseMode === "bulk100";
  const subscriptionActive = !!subscriptionExpiresAt && new Date(subscriptionExpiresAt) > new Date();

  return (
    <div className="card">
      <p style={{ margin: 0 }}>
        <span className="badge badge-pro">Purchased</span>{" "}
        {metered &&
          ((usesRemaining ?? 0) > 0 ? (
            <>
              {usesRemaining} use{usesRemaining === 1 ? "" : "s"} remaining
            </>
          ) : (
            <span className="error">No uses remaining - buy again from the Marketplace.</span>
          ))}
        {licenseMode === "subscription" &&
          (subscriptionActive ? (
            <>Subscription active until {new Date(subscriptionExpiresAt!).toLocaleDateString()}</>
          ) : (
            <span className="error">Subscription expired - buy again from the Marketplace.</span>
          ))}
      </p>
    </div>
  );
}
