"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMember, removeMember, deletePool } from "@/lib/actions/talent-pools";

interface Candidate {
  id: string;
  full_name: string;
  current_title?: string | null;
}

// ── Remove member button ───────────────────────────────────

function RemoveMemberButton({ memberId, poolId }: { memberId: string; poolId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await removeMember(memberId, poolId);
        })
      }
      className="rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
    >
      {isPending ? "…" : "Remove"}
    </button>
  );
}

// ── Add candidate form ─────────────────────────────────────

function AddCandidateForm({
  poolId,
  candidates,
}: {
  poolId: string;
  candidates: Candidate[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const result = await addMember(poolId, selectedId);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setSelectedId("");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        + Add Candidate
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Select a candidate…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}{c.current_title ? ` — ${c.current_title}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selectedId || isPending}
        onClick={handleAdd}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setSelectedId(""); setError(null); }}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        Cancel
      </button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
      {candidates.length === 0 && (
        <p className="w-full text-xs text-muted-foreground">All candidates are already in this pool.</p>
      )}
    </div>
  );
}

// ── Delete pool button ─────────────────────────────────────

function DeletePoolButton({ poolId }: { poolId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this talent pool? This cannot be undone.")) return;
        startTransition(async () => {
          await deletePool(poolId);
          router.push("/talent-pools");
        });
      }}
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
    >
      {isPending ? "Deleting…" : "Delete Pool"}
    </button>
  );
}

// ── Main export ────────────────────────────────────────────

export function PoolActions({
  poolId,
  memberId,
  mode = "add",
  availableCandidates,
  canManage,
}: {
  poolId: string;
  memberId?: string;
  mode?: "add" | "remove";
  availableCandidates: Candidate[];
  canManage: boolean;
}) {
  if (!canManage) return null;

  if (mode === "remove" && memberId) {
    return <RemoveMemberButton memberId={memberId} poolId={poolId} />;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <AddCandidateForm poolId={poolId} candidates={availableCandidates} />
      <DeletePoolButton poolId={poolId} />
    </div>
  );
}
