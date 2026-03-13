import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";

export const metadata: Metadata = {
  title: "Settings — Eligeo",
};

const settingsNav = [
  { href: "/settings/pipelines", label: "Pipelines", ownerOnly: false },
  { href: "/settings/scorecards", label: "Scorecards", ownerOnly: false },
  { href: "/settings/email-templates", label: "Email Templates", ownerOnly: false },
  { href: "/settings/notifications", label: "Notifications", ownerOnly: false },
  { href: "/settings/billing", label: "Billing", ownerOnly: true },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const isOwner = can(session.orgRole, "billing:manage");

  const visibleNav = settingsNav.filter(
    (item) => !item.ownerOnly || isOwner,
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-6 flex gap-8">
        <nav className="w-48 shrink-0">
          <ul className="space-y-1">
            {visibleNav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
