# Marketing Intelligence Update Checklist

> **File to update:** `docs/MARKETING-INTELLIGENCE.md`
> **When to run:** At every phase boundary, or any time a new AI feature ships, a competitive gap closes, or a proof point improves.
> **Rule:** This document must never be more than one phase out of date. It is the source of truth for website copy, pitch decks, and sales materials.

---

## When to Run This Checklist

| Trigger | Action |
|---------|--------|
| Phase boundary (any phase completes) | Run the FULL checklist |
| New AI feature ships | Run §1, §2, §3 |
| A competitor ships something new | Run §2, §4, §5 |
| Pricing or plan structure changes | Run §3, §5 |
| A [VERIFY] marker in GAPS.md is resolved | Run §4 if the claim was competitive |
| New proof point (e.g. test count, stat) | Run §6 |

---

## The Checklist

### §1 — New AI Features

For each AI feature shipped since last update:

- [ ] Is it listed in Section 2 (Unique Differentiators) or Section 3 (Near-Unique) of the Marketing Intelligence doc?
- [ ] If it is genuinely unique (not in Lever/Greenhouse/Ashby) → add to **Section 2** with a gold callout claim, a feature breakdown table, and a copy snippet.
- [ ] If it exists at competitors but Eligeo's implementation is deeper → add to **Section 3** with a competitor comparison row.
- [ ] Update the **Section 5 comparison table** — add a new row for the feature across all 4 columns (Eligeo, Greenhouse, Lever, Ashby).
- [ ] Add the feature to the **Section 9 copy snippets library** (headline + subheadline pair).
- [ ] Update **Section 8.1 product stats** if the feature changes a number (e.g. "13 AI features" → "N AI features").

### §2 — Competitive Position Check

Run this whenever a competitor ships something, or at each phase boundary as a sanity check.

- [ ] Check Greenhouse Intelligence release notes — has anything in the "❌" column in Section 5 changed to "⚠️" or "✅"?
- [ ] Check Lever release notes — same.
- [ ] Check Ashby changelog — same.
- [ ] If a competitor has now caught up on a "unique" feature → demote it from Section 2 to Section 3, update the copy accordingly. Do not pretend the moat still exists — it will erode trust.
- [ ] If Eligeo has closed a gap from Section "What trails competitors" → move it from the gap list to the features list and update Section 5.

> **Sources to check:** Greenhouse Product Updates (greenhouse.io/blog), Lever Changelog (lever.co/changelog), Ashby blog (ashbyhq.com/blog), G2 reviews (recent), ProductHunt launches.

### §3 — Pricing & Plan Changes

- [ ] If Starter/Growth/Pro plan features changed → update Section 5 comparison table (Plan Gate column) and Section 8 pricing stats.
- [ ] If competitor pricing has changed (via G2 reviews or pricing page) → update Section 8.2 competitive numbers.
- [ ] Do the segment messaging hooks in Section 6 still reference accurate pricing? e.g. "starts at $29/mo" — verify.

### §4 — Proof Points & Technical Stats

- [ ] Update **Section 8.1** product stats table:
  - [ ] AI features count
  - [ ] Command bar intent count
  - [ ] Test count (Vitest + E2E)
  - [ ] Migration count / table count with RLS
- [ ] If any [VERIFY] markers in `docs/GAPS.md` were resolved → check if they affect any claim in Sections 4 or 8. Update if so.
- [ ] If a hardening fix resolved a known issue → check if any Section 10 "don't say" item can now become a "do say" item.

### §5 — Segment Messaging Review

At each major phase boundary, re-read Section 6 (Customer Segment Messaging) and ask:

- [ ] **Startup segment** — does the hook still match what Phase 0–current ships? Is the CTA still valid?
- [ ] **Growth segment** — does the "hire at volume" message still reflect what's most powerful? (e.g. after Phase 7, analytics becomes a leading message for this segment)
- [ ] **Recruiter segment** — is the "6 hours back per week" claim still defensible? Can we sharpen it with a real feature?
- [ ] **Hiring Manager segment** — does the shortlist report still accurately reflect how the feature works?

### §6 — Copy Snippets Library Hygiene

- [ ] Do all gold callout snippets in Section 9 still accurately describe shipped features?
- [ ] Are there new command bar intents that would make compelling example commands in Section 2.1?
- [ ] Update the "last updated" footer date at the bottom of the document.

---

## What Does NOT Need to Change Every Phase

These sections are stable and only need updating on major product pivots:

- Section 1 (Core Positioning) — only changes if company strategy changes
- Section 7 (Objection Handling) — only changes if a new common objection emerges from sales calls
- Section 10 (Anti-Patterns) — stable; add to it, but rarely remove

---

## Update Log

Use this table to track when each section was last reviewed. Update this file after each review.

| Phase Completed | Date | Sections Updated | Updated By | Notes |
|----------------|------|-----------------|------------|-------|
| Phase 6 | 2026-03-13 | All (initial creation) | Audit | First version — all 10 sections written from codebase audit |
| Phase 6 | 2026-03-13 | All + new §6 (Pricing), §11 (expanded anti-patterns), retroactive changelog | Deep audit pass | Enriched with exact pricing, GDPR SLAs, brand etymology, G2 ratings, industry stats, AI credit schedule, JD quality details. Section count 10→11. |
| Phase 7 | — | — | — | — |
| Phase 8 | — | — | — | — |

---

## How to Update

`docs/MARKETING-INTELLIGENCE.md` is plain Markdown — edit it directly with any text editor or via Claude's Edit tool. No scripts, no regeneration, no validation step needed.

For **small updates** (adding a table row, updating a stat, tweaking a copy snippet): use a targeted string replacement directly in the file.

For **large updates** (new section, restructuring a segment): edit the file in place — Markdown sections can be added, moved, or removed freely.

After any update, commit with:
```
docs(meta): update MARKETING-INTELLIGENCE.md — <brief description of what changed>
```

---

*This checklist is enforced by CLAUDE.md Pre-Commit Protocol (§ "Before ANY commit" item 5 and Pre-Commit Protocol checklist).*
