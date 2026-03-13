"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOffer, aiSuggestCompensation, aiCheckSalaryBand, aiGenerateOfferTerms } from "@/lib/actions/offers";
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
  organizationName,
}: {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  department?: string;
  defaultCurrency: string;
  approverOptions: ApproverOption[];
  organizationName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // H6-5: AI state
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [salaryBandResult, setSalaryBandResult] = useState<{ assessment: string; reasoning: string } | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);

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

  // H6-5: AI Suggest Compensation
  async function handleAiSuggest() {
    if (!jobTitle) return;
    setAiSuggesting(true);
    setError(null);
    try {
      const result = await aiSuggestCompensation({ jobTitle, department });
      if (result.error) {
        setError(result.error);
      } else if (result.suggestion) {
        const s = result.suggestion;
        if (s.base_salary) setBaseSalary(String(s.base_salary));
        if (s.bonus_pct) setBonusPct(String(s.bonus_pct));
        if (s.equity_shares) setEquityShares(String(s.equity_shares));
        if (s.sign_on_bonus) setSignOnBonus(String(s.sign_on_bonus));
      }
    } catch {
      setError("Failed to get AI suggestion.");
    } finally {
      setAiSuggesting(false);
    }
  }

  // H6-5: Salary Band Check (on blur)
  async function handleSalaryBandCheck() {
    const salary = parseFloat(baseSalary);
    if (!salary || salary <= 0 || !jobTitle) {
      setSalaryBandResult(null);
      return;
    }
    try {
      const result = await aiCheckSalaryBand({
        jobTitle,
        proposedBaseSalary: salary,
        currency,
        period,
      });
      if (result.result) {
        setSalaryBandResult({ assessment: result.result.assessment, reasoning: result.result.reasoning });
      }
    } catch {
      // Non-blocking — salary band check is informational
    }
  }

  // H6-5: AI Generate Offer Terms
  async function handleAiGenerateTerms() {
    const salary = parseFloat(baseSalary);
    if (!salary || salary <= 0) {
      setError("Enter base salary before generating terms.");
      return;
    }
    setAiGenerating(true);
    setError(null);
    try {
      const result = await aiGenerateOfferTerms({
        candidateName,
        jobTitle,
        department,
        compensation: {
          base_salary: salary,
          currency,
          period,
          ...(bonusPct ? { bonus_pct: parseFloat(bonusPct) } : {}),
          ...(equityShares ? { equity_shares: parseInt(equityShares, 10), equity_type: equityType } : {}),
          ...(equityVesting ? { equity_vesting: equityVesting } : {}),
          ...(signOnBonus ? { sign_on_bonus: parseFloat(signOnBonus) } : {}),
        },
        startDate: startDate || undefined,
        organizationName: organizationName ?? "the company",
      });
      if (result.error) {
        setError(result.error);
      } else if (result.text) {
        setTerms(result.text);
      }
    } catch {
      setError("Failed to generate offer terms.");
    } finally {
      setAiGenerating(false);
    }
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Compensation</h2>
          <button
            type="button"
            onClick={handleAiSuggest}
            disabled={aiSuggesting || !jobTitle}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {aiSuggesting ? "Suggesting..." : "AI Suggest"}
          </button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium">
              Base Salary <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={baseSalary}
              onChange={(e) => { setBaseSalary(e.target.value); setSalaryBandResult(null); }}
              onBlur={handleSalaryBandCheck}
              placeholder="120000"
              className="h-9 w-full rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {salaryBandResult && (
              <p className={`mt-1 text-xs ${
                salaryBandResult.assessment === "competitive" ? "text-green-600" :
                "text-amber-600"
              }`}>
                {salaryBandResult.assessment === "competitive" ? "\u2713 " : "\u26A0 "}
                {salaryBandResult.reasoning}
              </p>
            )}
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
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium">Terms &amp; Conditions</label>
            <button
              type="button"
              onClick={handleAiGenerateTerms}
              disabled={aiGenerating}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {aiGenerating ? "Generating..." : "AI Generate Terms"}
            </button>
          </div>
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
