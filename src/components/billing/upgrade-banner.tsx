/**
 * Global upgrade nudge banner for starter plan orgs.
 * D03 §10: Shows when org is on starter plan and nearing limits.
 */

interface UpgradeBannerProps {
  plan: string;
  seatsUsed: number;
  seatsIncluded: number;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  isOwner: boolean;
}

export function UpgradeBanner({
  plan,
  seatsUsed,
  seatsIncluded,
  aiCreditsUsed,
  aiCreditsLimit,
  isOwner,
}: UpgradeBannerProps) {
  if (plan !== "starter") return null;

  const seatPercent = seatsIncluded > 0 ? (seatsUsed / seatsIncluded) * 100 : 0;
  const creditPercent = aiCreditsLimit > 0 ? (aiCreditsUsed / aiCreditsLimit) * 100 : 0;

  if (seatPercent < 80 && creditPercent < 80) return null;

  const nearLimit = seatPercent >= 80 ? "seats" : "AI credits";

  return (
    <div className="bg-primary/5 px-4 py-2 text-center text-sm text-primary">
      <span>
        You&apos;re approaching your {nearLimit} limit on the Starter plan.
      </span>
      {isOwner ? (
        <a
          href="/settings/billing#pricing"
          className="ml-2 font-semibold underline underline-offset-2"
        >
          View upgrade options
        </a>
      ) : (
        <span className="ml-2">Contact your account owner to upgrade.</span>
      )}
    </div>
  );
}
