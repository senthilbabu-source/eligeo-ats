import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Eligeo",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        <p>Phase 2 active — Jobs and Candidates are live.</p>
        <p className="mt-1 text-sm">
          Pipeline Kanban, interviews, and offers coming next.
        </p>
      </div>
    </div>
  );
}
