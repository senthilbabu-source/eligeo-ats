"use client";

import { useState } from "react";
import Link from "next/link";

export interface CategoryInput {
  name: string;
  weight: number;
  attributes: Array<{ name: string; description: string }>;
}

interface ScorecardTemplateFormProps {
  initialName?: string;
  initialDescription?: string;
  initialIsDefault?: boolean;
  initialCategories?: CategoryInput[];
  onSubmit: (data: {
    name: string;
    description: string;
    isDefault: boolean;
    categories: Array<{
      name: string;
      position: number;
      weight: number;
      attributes: Array<{ name: string; description: string; position: number }>;
    }>;
  }) => Promise<{ error?: string; success?: boolean; id?: string }>;
  submitLabel: string;
  submittingLabel: string;
}

export function ScorecardTemplateForm({
  initialName = "",
  initialDescription = "",
  initialIsDefault = false,
  initialCategories,
  onSubmit,
  submitLabel,
  submittingLabel,
}: ScorecardTemplateFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [categories, setCategories] = useState<CategoryInput[]>(
    initialCategories ?? [
      { name: "", weight: 1.0, attributes: [{ name: "", description: "" }] },
    ],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function addCategory() {
    setCategories([
      ...categories,
      { name: "", weight: 1.0, attributes: [{ name: "", description: "" }] },
    ]);
  }

  function removeCategory(idx: number) {
    if (categories.length <= 1) return;
    setCategories(categories.filter((_, i) => i !== idx));
  }

  function updateCategory(idx: number, field: "name" | "weight", value: string | number) {
    setCategories(
      categories.map((cat, i) => (i === idx ? { ...cat, [field]: value } : cat)),
    );
  }

  function addAttribute(catIdx: number) {
    setCategories(
      categories.map((cat, i) =>
        i === catIdx
          ? { ...cat, attributes: [...cat.attributes, { name: "", description: "" }] }
          : cat,
      ),
    );
  }

  function removeAttribute(catIdx: number, attrIdx: number) {
    setCategories(
      categories.map((cat, i) =>
        i === catIdx && cat.attributes.length > 1
          ? { ...cat, attributes: cat.attributes.filter((_, j) => j !== attrIdx) }
          : cat,
      ),
    );
  }

  function updateAttribute(
    catIdx: number,
    attrIdx: number,
    field: "name" | "description",
    value: string,
  ) {
    setCategories(
      categories.map((cat, i) =>
        i === catIdx
          ? {
              ...cat,
              attributes: cat.attributes.map((attr, j) =>
                j === attrIdx ? { ...attr, [field]: value } : attr,
              ),
            }
          : cat,
      ),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Template name is required.");
      return;
    }

    const hasEmptyCategory = categories.some((c) => !c.name.trim());
    if (hasEmptyCategory) {
      setError("All categories must have a name.");
      return;
    }

    const hasEmptyAttr = categories.some((c) =>
      c.attributes.some((a) => !a.name.trim()),
    );
    if (hasEmptyAttr) {
      setError("All attributes must have a name.");
      return;
    }

    setIsPending(true);
    try {
      const result = await onSubmit({
        name: name.trim(),
        description: description.trim(),
        isDefault,
        categories: categories.map((cat, catIdx) => ({
          name: cat.name.trim(),
          position: catIdx,
          weight: cat.weight,
          attributes: cat.attributes.map((attr, attrIdx) => ({
            name: attr.name.trim(),
            description: attr.description.trim(),
            position: attrIdx,
          })),
        })),
      });

      if (result?.error) {
        setError(result.error);
      }
    } finally {
      setIsPending(false);
    }
  }

  const inputClass =
    "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Template metadata */}
      <div className="max-w-md space-y-4">
        <div>
          <label htmlFor="tpl-name" className="block text-sm font-medium text-foreground">
            Template Name
          </label>
          <input
            id="tpl-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Engineering Interview"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="tpl-desc" className="block text-sm font-medium text-foreground">
            Description
            <span className="ml-1 text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="tpl-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe when to use this template..."
            className={inputClass}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Set as default template
        </label>
      </div>

      {/* Categories + Attributes */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Categories</h3>
          <button
            type="button"
            onClick={addCategory}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            + Add Category
          </button>
        </div>

        <div className="mt-4 space-y-6">
          {categories.map((cat, catIdx) => (
            <div
              key={catIdx}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-muted-foreground">
                        Category Name
                      </label>
                      <input
                        type="text"
                        required
                        value={cat.name}
                        onChange={(e) => updateCategory(catIdx, "name", e.target.value)}
                        placeholder="e.g. Technical Skills"
                        className={inputClass}
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-medium text-muted-foreground">
                        Weight
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={cat.weight}
                        onChange={(e) =>
                          updateCategory(catIdx, "weight", parseFloat(e.target.value) || 1)
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {/* Attributes */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Attributes (1–5 rating each)
                      </span>
                      <button
                        type="button"
                        onClick={() => addAttribute(catIdx)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        + Add
                      </button>
                    </div>
                    {cat.attributes.map((attr, attrIdx) => (
                      <div key={attrIdx} className="flex items-start gap-2">
                        <div className="flex-1">
                          <input
                            type="text"
                            required
                            value={attr.name}
                            onChange={(e) =>
                              updateAttribute(catIdx, attrIdx, "name", e.target.value)
                            }
                            placeholder="e.g. System Design"
                            className="block w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        <div className="flex-1">
                          <input
                            type="text"
                            value={attr.description}
                            onChange={(e) =>
                              updateAttribute(catIdx, attrIdx, "description", e.target.value)
                            }
                            placeholder="Description (optional)"
                            className="block w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        {cat.attributes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAttribute(catIdx, attrIdx)}
                            className="mt-1 text-xs text-muted-foreground hover:text-destructive"
                            aria-label="Remove attribute"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {categories.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCategory(catIdx)}
                    className="mt-5 text-xs text-muted-foreground hover:text-destructive"
                    aria-label="Remove category"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? submittingLabel : submitLabel}
        </button>
        <Link
          href="/settings/scorecards"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
