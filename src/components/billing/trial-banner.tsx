/**
 * Global trial expiration banner.
 * D03 §10: Shows days remaining in trial with upgrade CTA.
 */

interface TrialBannerProps {
  trialEndsAt: string;
  plan: string;
  isOwner: boolean;
}

export function TrialBanner({ trialEndsAt, plan, isOwner }: TrialBannerProps) {
  const now = new Date();
  const endsAt = new Date(trialEndsAt);
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  if (daysLeft > 7) return null;

  const urgency = daysLeft <= 1 ? "bg-destructive text-destructive-foreground" : "bg-amber-50 text-amber-900";

  return (
    <div className={`px-4 py-2 text-center text-sm ${urgency}`}>
      <span className="font-medium">
        {daysLeft === 0
          ? "Your trial ends today."
          : `Your trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`}
      </span>
      {isOwner ? (
        <a
          href="/settings/billing#pricing"
          className="ml-2 font-semibold underline underline-offset-2"
        >
          Upgrade now
        </a>
      ) : (
        <span className="ml-2">Contact your account owner to upgrade.</span>
      )}
    </div>
  );
}
