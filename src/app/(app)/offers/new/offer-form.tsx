"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOffer } from "@/lib/actions/offers";
import { SUPPORTED_CURRENCIES } from "@/lib/types/ground-truth";

interface ApproverOption {
  id: string;
  name: string;
  role: string;
}

export function OfferForm({
  applicationId,
  candidateName,
  jobTitle,
  department,
  defaultCurrency,
  approverOptions,
}: {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  department?: string;
  defaultCurrency: string;
  approverOptions: ApproverOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Compensation
  const [baseSalary, setBaseSalary] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [period, setPeriod] = useState<"annual" | "monthly" | "hourly">("annual");
  const [bonusPct, setBonusPct] = useState("");
  const [equityShares, setEquityShares] = useState("");
  const [equityType, setEquityType] = useState<"options" | "rsu" | "phantom">("rsu");
  const [equityVesting, setEquityVesting] = useState("");
  const [signOnBonus, setSignOnBonus] = useState("");

  // Offer details
  const [startDate, setStartDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [terms, setTerms] = useState("");

  // Approvers
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);

  function toggleApprover(id: string) {
    setSelectedApprovers((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  }

  function handleSubmit() {
    setError(null);

    const salary = parseFloat(baseSalary);
    if (!salary || salary <= 0) {
      setError("Base salary is required and must be positive");
      return;
    }
    if (selectedApprovers.length === 0) {
      setError("At least one approver is required");
      return;
    }

    startTransition(async () => {
      const result = await createOffer({
        applicationId,
        compensation: {
          base_salary: salary,
          currency,
          period,
          ...(bonusPct ? { bonus_pct: parseFloat(bonusPct) } : {}),
          ...(equityShares ? { equity_shares: parseInt(equityShares, 10), equity_type: equityType } : {}),
          ...(equityVesting ? { equity_vesting: equityVesting } : {}),
          ...(signOnBonus ? { sign_on_bonus: parseFloat(signOnBonus) } : {}),
        },
        ...(startDate ? { startDate } : {}),
        ...(expiryDate ? { expiryDate } : {}),
        ...(terms ? { terms } : {}),
        approvers: selectedApprovers.map((id, idx) => ({
          userId: id,
          sequenceOrder: idx + 1,
        })),
      });

      if (result.error) {
        setError(result.error);
      } else if (result.success && result.id) {
        router.push(`/offers/${result.id}`);
      }
    });
  }

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Compensation */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-medium">Compensation</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium">
              Base Salary <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              placeholder="120000"
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as typeof period)}
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Bonus %</label>
            <input
              type="number"
              value={bonusPct}
              onChange={(e) => setBonusPct(e.target.value)}
              placeholder="15"
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Sign-On Bonus</label>
            <input
              type="number"
              value={signOnBonus}
              onChange={(e) => setSignOnBonus(e.target.value)}
              placeholder="10000"
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Equity Shares</label>
            <input
              type="number"
              value={equityShares}
              onChange={(e) => setEquityShares(e.target.value)}
              placeholder="5000"
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Equity Type</label>
            <select
              value={equityType}
              onChange={(e) => setEquityType(e.target.value as typeof equityType)}
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="rsu">RSU</option>
              <option value="options">Options</option>
              <option value="phantom">Phantom</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Vesting Schedule</label>
            <input
              type="text"
              value={equityVesting}
              onChange={(e) => setEquityVesting(e.target.value)}
              placeholder="4 years, 1-year cliff"
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </section>

      {/* Offer Details */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-medium">Details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Expiry Date</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Terms &amp; Conditions</label>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={4}
            placeholder="Enter offer terms or use AI to generate..."
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </section>

      {/* Approvers */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-medium">
          Approval Chain <span className="text-red-500">*</span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select approvers in order. The first selected will be asked to approve first.
        </p>
        <div className="mt-4 space-y-2">
          {approverOptions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No eligible approvers found. Owners, admins, and hiring managers can approve offers.
            </p>
          )}
          {approverOptions.map((approver) => {
            const isSelected = selectedApprovers.includes(approver.id);
            const order = selectedApprovers.indexOf(approver.id) + 1;

            return (
              <button
                key={approver.id}
                type="button"
                onClick={() => toggleApprover(approver.id)}
                className={`flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div>
                  <span className="font-medium">{approver.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{approver.role}</span>
                </div>
                {isSelected && (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                    {order}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create Offer"}
        </button>
      </div>
    </div>
  );
}
