/**
 * Global payment-failed banner.
 * D03 §10: Shows when subscription is past_due.
 */

interface PaymentFailedBannerProps {
  subscriptionStatus: string;
  isOwner: boolean;
}

export function PaymentFailedBanner({ subscriptionStatus, isOwner }: PaymentFailedBannerProps) {
  if (subscriptionStatus !== "past_due") return null;

  return (
    <div className="bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground">
      <span className="font-medium">Payment failed.</span>
      {isOwner ? (
        <a
          href="/api/v1/billing/portal-session"
          className="ml-2 font-semibold underline underline-offset-2"
        >
          Update payment method
        </a>
      ) : (
        <span className="ml-2">Contact your account owner to resolve billing.</span>
      )}
    </div>
  );
}
