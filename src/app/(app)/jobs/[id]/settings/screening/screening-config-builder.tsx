"use client";

import { useState, useTransition } from "react";
import { upsertScreeningConfig, toggleScreeningActive } from "@/lib/actions/screening";
import type { ScreeningQuestion } from "@/lib/types/ground-truth";
import { randomUUID } from "crypto";

interface Props {
  jobOpeningId: string;
  initialConfig: {
    id: string;
    questions: ScreeningQuestion[];
    instructions: string | null;
    maxDurationMin: number;
    isActive: boolean;
  } | null;
}

function makeId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const emptyQuestion = (): ScreeningQuestion => ({
  id: makeId(),
  order: 0,
  topic: "",
  raw_question: "",
  is_required: true,
  scoring_criteria: "",
});

export function ScreeningConfigBuilder({ jobOpeningId, initialConfig }: Props) {
  const [questions, setQuestions] = useState<ScreeningQuestion[]>(
    initialConfig?.questions ?? [emptyQuestion()],
  );
  const [instructions, setInstructions] = useState(initialConfig?.instructions ?? "");
  const [maxDuration, setMaxDuration] = useState(initialConfig?.maxDurationMin ?? 15);
  const [isActive, setIsActive] = useState(initialConfig?.isActive ?? true);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const addQuestion = () => {
    if (questions.length >= 10) return;
    setQuestions([...questions, { ...emptyQuestion(), order: questions.length }]);
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id).map((q, i) => ({ ...q, order: i })));
  };

  const updateQuestion = (id: string, field: keyof ScreeningQuestion, value: unknown) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const newQuestions = [...questions];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newQuestions.length) return;
    [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex]!, newQuestions[index]!];
    setQuestions(newQuestions.map((q, i) => ({ ...q, order: i })));
  };

  const handleSave = () => {
    const validQuestions = questions.filter((q) => q.topic.trim() && q.raw_question.trim());
    if (validQuestions.length === 0) {
      setMessage({ type: "error", text: "At least one question is required" });
      return;
    }

    startTransition(async () => {
      const result = await upsertScreeningConfig({
        jobOpeningId,
        questions: validQuestions.map((q, i) => ({ ...q, order: i })),
        instructions: instructions || undefined,
        maxDurationMin: maxDuration,
        isActive,
      });

      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: "Screening configuration saved" });
      }
    });
  };

  const handleToggle = () => {
    if (!initialConfig?.id) return;
    startTransition(async () => {
      const newActive = !isActive;
      const result = await toggleScreeningActive(initialConfig.id, newActive);
      if (!result.error) {
        setIsActive(newActive);
        setMessage({ type: "success", text: newActive ? "Screening enabled" : "Screening disabled" });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Active toggle */}
      {initialConfig?.id && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium">Screening Status</p>
            <p className="text-xs text-muted-foreground">
              {isActive ? "Active — candidates will receive screening invites" : "Disabled — no new invites sent"}
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={isPending}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              isActive
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {isActive ? "Active" : "Inactive"}
          </button>
        </div>
      )}

      {/* Questions list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            Questions ({questions.length}/10)
          </h3>
          <button
            onClick={addQuestion}
            disabled={questions.length >= 10}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Add Question
          </button>
        </div>

        {questions.map((q, index) => (
          <div key={q.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Question {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveQuestion(index, "up")}
                  disabled={index === 0}
                  className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveQuestion(index, "down")}
                  disabled={index === questions.length - 1}
                  className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeQuestion(q.id)}
                  disabled={questions.length === 1}
                  className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Topic</label>
                <input
                  type="text"
                  value={q.topic}
                  onChange={(e) => updateQuestion(q.id, "topic", e.target.value)}
                  placeholder="e.g., Technical background"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={q.is_required}
                    onChange={(e) => updateQuestion(q.id, "is_required", e.target.checked)}
                    className="rounded border-input"
                  />
                  Required
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Question</label>
              <textarea
                value={q.raw_question}
                onChange={(e) => updateQuestion(q.id, "raw_question", e.target.value)}
                placeholder="Write the question as you want it asked..."
                rows={2}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Scoring Criteria (optional)
              </label>
              <input
                type="text"
                value={q.scoring_criteria ?? ""}
                onChange={(e) => updateQuestion(q.id, "scoring_criteria", e.target.value)}
                placeholder="e.g., Depth of experience, specific projects mentioned"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        ))}
      </div>

      {/* AI Instructions */}
      <div>
        <label className="text-sm font-medium">AI Tone Instructions (optional)</label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Guide how the AI rephrases questions and interacts with candidates.
        </p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g., Be conversational and encouraging. Focus on depth over breadth."
          rows={2}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Max Duration */}
      <div>
        <label className="text-sm font-medium">Max Duration</label>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={5}
            max={60}
            value={maxDuration}
            onChange={(e) => setMaxDuration(Number(e.target.value))}
            className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-sm text-muted-foreground">minutes</span>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Configuration"}
        </button>

        {message && (
          <p
            className={`text-sm ${
              message.type === "success" ? "text-green-600" : "text-red-600"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {/* EU AI Act disclosure */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-700">
          <strong>EU AI Act:</strong> Candidates will see a disclosure that screening is
          AI-assisted and can request human-only review. All responses are stored for audit.
        </p>
      </div>
    </div>
  );
}
