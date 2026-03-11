import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { createPool } from "@/lib/actions/talent-pools";

export const metadata: Metadata = { title: "New Talent Pool — Eligeo" };

export default async function NewTalentPoolPage() {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:create");

  async function handleCreate(formData: FormData) {
    "use server";
    const result = await createPool(null, formData);
    if (result.success && result.id) {
      redirect(`/talent-pools/${result.id}`);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/talent-pools"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Talent Pools
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">New Talent Pool</h1>
      </div>

      <form action={handleCreate} className="space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Pool Name <span className="text-destructive">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={100}
            placeholder="e.g. Senior Engineers, Sales Pipeline"
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={500}
            placeholder="What kind of candidates belong in this pool?"
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create Pool
          </button>
          <Link
            href="/talent-pools"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
