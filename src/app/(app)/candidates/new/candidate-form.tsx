"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createCandidate } from "@/lib/actions/candidates";
import { aiParseResume } from "@/lib/actions/ai";

interface Source {
  id: string;
  name: string;
  source_type: string;
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function TagInput({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = input.trim();
      if (tag && !value.includes(tag)) {
        onChange([...value, tag]);
      }
      setInput("");
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-border bg-background px-3 py-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="text-primary/60 hover:text-primary"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          id={name}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <input type="hidden" name={name} value={JSON.stringify(value)} />
    </div>
  );
}

export function CandidateForm({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createCandidate, null);
  const [skills, setSkills] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // AR3 — controlled field state enables AI pre-fill from resume parse
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  // AR3 — resume paste section state
  const [showResumePaste, setShowResumePaste] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [parsedResumeText, setParsedResumeText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();

  useEffect(() => {
    if (state && "id" in state && state.id) {
      router.push(`/candidates/${state.id}`);
    }
  }, [state, router]);

  function handleParseResume() {
    if (!resumeText.trim()) return;
    setParseError(null);
    startParsing(async () => {
      const fd = new FormData();
      fd.set("resumeText", resumeText);
      const result = await aiParseResume(null, fd);
      if ("error" in result) {
        setParseError(result.error ?? "Failed to parse resume");
        return;
      }
      if ("data" in result && result.data) {
        const d = result.data;
        if (d.full_name) setFullName(d.full_name);
        if (d.email) setEmail(d.email);
        if (d.phone) setPhone(d.phone);
        if (d.location) setLocation(d.location);
        if (d.current_title) setCurrentTitle(d.current_title);
        if (d.current_company) setCurrentCompany(d.current_company);
        if (d.linkedin_url) setLinkedinUrl(d.linkedin_url);
        if (d.skills?.length) setSkills(d.skills);
        setParsedResumeText(resumeText);
        setShowResumePaste(false);
        setResumeText("");
      }
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* AR3 — collapsible resume paste + AI parse section */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <button
          type="button"
          onClick={() => setShowResumePaste((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
        >
          <span>{showResumePaste ? "▼" : "▶"}</span>
          Paste resume to auto-fill with AI
        </button>
        {showResumePaste && (
          <div className="mt-3 space-y-3">
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste the candidate's resume text here..."
              rows={6}
              className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {parseError && (
              <p className="text-sm text-destructive">{parseError}</p>
            )}
            <button
              type="button"
              onClick={handleParseResume}
              disabled={isParsing || !resumeText.trim()}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isParsing ? "Extracting..." : "Extract with AI"}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fullName">Full Name *</Label>
          <Input
            id="fullName"
            name="fullName"
            required
            placeholder="Jane Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="jane@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            placeholder="San Francisco, CA"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="currentTitle">Current Title</Label>
          <Input
            id="currentTitle"
            name="currentTitle"
            placeholder="Software Engineer"
            value={currentTitle}
            onChange={(e) => setCurrentTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="currentCompany">Current Company</Label>
          <Input
            id="currentCompany"
            name="currentCompany"
            placeholder="Acme Corp"
            value={currentCompany}
            onChange={(e) => setCurrentCompany(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
        <Input
          id="linkedinUrl"
          name="linkedinUrl"
          type="url"
          placeholder="https://linkedin.com/in/janedoe"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="source">Source</Label>
          <Select id="source" name="source" defaultValue="">
            <option value="">Select a source...</option>
            {sources.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
          <input type="hidden" name="sourceId" value="" />
        </div>
      </div>

      {/* Hidden field: persist parsed resume text for embedding generation */}
      <input type="hidden" name="resumeText" value={parsedResumeText} />

      <TagInput
        label="Skills"
        name="skills"
        value={skills}
        onChange={setSkills}
        placeholder="Type a skill and press Enter..."
      />

      <TagInput
        label="Tags"
        name="tags"
        value={tags}
        onChange={setTags}
        placeholder="Type a tag and press Enter..."
      />

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add Candidate"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-10 items-center rounded-md border border-border px-6 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
