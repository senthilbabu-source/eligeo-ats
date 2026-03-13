import { requireAuth } from "@/lib/auth";
import { AppNav } from "./app-nav";
import { CommandBar } from "@/components/command-bar";
import { BillingBanners } from "@/components/billing/billing-banners";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <div className="min-h-screen bg-background">
      <BillingBanners />
      <AppNav session={session} />
      <main>{children}</main>
      <CommandBar />
    </div>
  );
}
