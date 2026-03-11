/**
 * Job description quality utilities — JD1/JD2/JD3/JD4.
 * All functions are pure and side-effect free. No AI cost.
 */

// ── JD4 — Gender-coded word lists ─────────────────────────
// Based on Gaucher et al. (2011) "Evidence That Gendered Wording in Job
// Advertisements Exists and Sustains Gender Inequality."

export const MASCULINE_CODED_WORDS = [
  "competitive", "dominant", "aggressive", "assertive", "independent",
  "outperform", "outperforms", "champion", "champions", "drive",
  "driven", "decisive", "decision-maker", "ninja", "rockstar", "rock star",
  "hero", "warrior", "fearless", "bold", "ambitious", "determined",
  "self-reliant", "headstrong", "top performer", "outstanding",
  "high-performer", "leader", "leading", "lead", "superior",
];

export const FEMININE_CODED_WORDS = [
  "collaborate", "collaborating", "collaborative", "supportive",
  "interpersonal", "committed", "commit", "connects", "connect",
  "share", "sharing", "community", "loyal", "loyalty", "responsible",
  "trust", "trustworthy", "together", "cooperate", "cooperative",
  "empathize", "empathetic", "inclusive", "nurture", "nurturing",
  "compassionate", "warmth", "warm", "sensitive",
];

export interface GenderBalance {
  masculineCount: number;
  feminineCount: number;
  masculineWords: string[];
  feminineWords: string[];
  /** Positive = masculine-leaning, negative = feminine-leaning, 0 = balanced */
  score: number;
  label: "masculine-coded" | "feminine-coded" | "balanced";
}

export function analyzeGenderBalance(text: string): GenderBalance {
  const lower = text.toLowerCase();

  const masculineWords = MASCULINE_CODED_WORDS.filter((w) =>
    new RegExp(`\\b${w.replace(/[-]/g, "[-]?")}\\b`, "i").test(lower),
  );
  const feminineWords = FEMININE_CODED_WORDS.filter((w) =>
    new RegExp(`\\b${w}\\b`, "i").test(lower),
  );

  const masculineCount = masculineWords.length;
  const feminineCount = feminineWords.length;
  const score = masculineCount - feminineCount;

  let label: GenderBalance["label"];
  if (score > 2) label = "masculine-coded";
  else if (score < -2) label = "feminine-coded";
  else label = "balanced";

  return { masculineCount, feminineCount, masculineWords, feminineWords, score, label };
}

// ── JD3 — Completeness checks ─────────────────────────────

export interface CompletenessCheck {
  hasSalary: boolean;
  hasLocation: boolean;
  hasReportingLine: boolean;
  hasMinLength: boolean; // description ≥ 150 words
  passCount: number;
  totalCount: number;
  score: number; // 0-100
}

export function checkCompleteness(params: {
  description: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;
}): CompletenessCheck {
  const { description, salaryMin, salaryMax, location } = params;
  const text = description ?? "";
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const hasSalary = Boolean(salaryMin && salaryMax);
  const hasLocation = Boolean(location?.trim());
  const hasReportingLine = /\b(reports? to|reporting (line|to|into)|direct(ly)? to|managed by)\b/i.test(text);
  const hasMinLength = wordCount >= 100;

  const checks = [hasSalary, hasLocation, hasReportingLine, hasMinLength];
  const passCount = checks.filter(Boolean).length;
  const totalCount = checks.length;

  return {
    hasSalary,
    hasLocation,
    hasReportingLine,
    hasMinLength,
    passCount,
    totalCount,
    score: Math.round((passCount / totalCount) * 100),
  };
}

// ── JD1 — Composite quality score ─────────────────────────

export interface QualityScore {
  total: number; // 0-100
  completenessScore: number; // 0-40
  genderBalanceScore: number; // 0-30
  biasScore: number; // 0-30 (30 = no bias, 0 = many flagged terms)
  label: "excellent" | "good" | "needs work" | "poor";
}

export function computeQualityScore(params: {
  completeness: CompletenessCheck;
  genderBalance: GenderBalance;
  flaggedTermsCount: number;
}): QualityScore {
  const { completeness, genderBalance, flaggedTermsCount } = params;

  // Completeness: 0-40 points (proportional to pass rate)
  const completenessScore = Math.round((completeness.passCount / completeness.totalCount) * 40);

  // Gender balance: 0-30 points (30 = balanced, deduct 5 per extreme word above threshold of 2)
  const imbalance = Math.max(0, Math.abs(genderBalance.score) - 2);
  const genderBalanceScore = Math.max(0, 30 - imbalance * 5);

  // Bias: 0-30 points (30 = no flagged terms, deduct 5 per term up to 30)
  const biasScore = Math.max(0, 30 - flaggedTermsCount * 5);

  const total = completenessScore + genderBalanceScore + biasScore;

  let label: QualityScore["label"];
  if (total >= 80) label = "excellent";
  else if (total >= 60) label = "good";
  else if (total >= 40) label = "needs work";
  else label = "poor";

  return { total, completenessScore, genderBalanceScore, biasScore, label };
}
