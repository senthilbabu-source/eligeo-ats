"use client";

import { useActionState, useTransition } from "react";
import { addCandidateNote, deleteCandidateNote } from "@/lib/actions/candidates";

interface Note {
  id: string;
  content: string;
  created_at: string;
  user_profiles: { full_name: string } | null;
  created_by: string;
}

interface CandidateNotesProps {
  candidateId: string;
  notes: Note[];
  currentUserId: string;
  isOwnerOrAdmin: boolean;
}

export function CandidateNotes({
  candidateId,
  notes,
  currentUserId,
  isOwnerOrAdmin,
}: CandidateNotesProps) {
  const [state, formAction, isPending] = useActionState(addCandidateNote, null);
  const [isDeleting, startDelete] = useTransition();

  function handleDelete(noteId: string) {
    startDelete(async () => {
      await deleteCandidateNote(noteId, candidateId);
    });
  }

  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Notes &amp; Activity
      </h2>

      {/* Add note form */}
      <form action={formAction} className="mt-4">
        <input type="hidden" name="candidateId" value={candidateId} />
        <textarea
          name="content"
          required
          rows={2}
          placeholder="Add a note..."
          className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {state?.error && (
          <p className="mt-1 text-sm text-destructive">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="mt-2 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add Note"}
        </button>
      </form>

      {/* Notes timeline */}
      {notes.length > 0 ? (
        <div className="mt-5 space-y-3">
          {notes.map((note) => {
            const authorRaw = note.user_profiles as unknown;
            const author = (Array.isArray(authorRaw) ? authorRaw[0] : authorRaw) as { full_name: string } | null;
            const canDelete = note.created_by === currentUserId || isOwnerOrAdmin;

            return (
              <div
                key={note.id}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {note.content}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {author?.full_name ?? "Unknown"} &middot;{" "}
                      {new Date(note.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      disabled={isDeleting}
                      className="shrink-0 rounded p-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete note"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No notes yet. Add the first note above.
        </p>
      )}
    </div>
  );
}
