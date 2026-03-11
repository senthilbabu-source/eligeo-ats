import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const session = await requireAuth();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.orgRole} · {session.plan} plan
          </p>
        </div>
        <LogoutButton />
      </div>
      <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        <p>Phase 1 complete — auth flows active.</p>
        <p className="mt-1 text-sm">
          Jobs, candidates, and pipeline coming in Phase 2.
        </p>
      </div>
    </div>
  );
}
