/**
 * Ground-truth TypeScript types for all JSONB columns in the schema.
 * Single source of truth — never define JSONB types inline (ADR-001).
 *
 * Each type corresponds to a JSONB column in a database table.
 * Updated per cross-cut analysis to match spec exactly.
 */

/** Organization-level settings stored in organizations.settings JSONB */
export interface OrganizationSettings {
  timezone: string;
  date_format: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
  default_currency: string;
  career_page_enabled: boolean;
}

/** Offer compensation details stored in offers.compensation JSONB */
export interface OfferCompensation {
  base_salary: number;
  currency: string;
  period: "annual" | "monthly" | "hourly";
  bonus_pct?: number;
  bonus_amount?: number;
  equity_shares?: number;
  equity_type?: "options" | "rsu" | "phantom";
  equity_vesting?: string;
  relocation?: number;
  other_benefits?: string[];
}

/** Auto-action configuration stored in pipeline_stages.auto_actions JSONB */
export interface AutoAction {
  type:
    | "send_email"
    | "create_task"
    | "notify_team"
    | "move_stage"
    | "require_scorecard"
    | "require_feedback"
    | "require_approval";
  template?: string;
  delay_hours?: number;
  conditions?: Record<string, unknown>;
}

/** Webhook payload headers stored in webhook_endpoints.headers JSONB */
export interface WebhookHeaders {
  [key: string]: string;
}

/** Custom field value stored in custom_field_values.value JSONB */
export type CustomFieldValue = string | number | boolean | string[] | null;

// ── Phase 1: Core Tenancy JSONB Types ──────────────────────

/** Organization branding stored in organizations.branding_config JSONB */
export interface BrandingConfig {
  logo_url?: string;
  favicon_url?: string;
  primary_color?: string;
  secondary_color?: string;
  font_family?: string;
  career_page_header_html?: string;
}

/** Organization feature flags stored in organizations.feature_flags JSONB */
export interface FeatureFlags {
  ai_matching?: boolean;
  ai_resume_parsing?: boolean;
  ai_scorecard_summarize?: boolean;
  bulk_import?: boolean;
  api_access?: boolean;
  custom_fields?: boolean;
  white_label?: boolean;
  advanced_analytics?: boolean;
  nurture_sequences?: boolean;
  webhook_outbound?: boolean;
  sso_saml?: boolean;
}

/** User preferences stored in user_profiles.preferences JSONB */
export interface UserPreferences {
  theme?: "light" | "dark" | "system";
  language?: string;
  email_notifications?: boolean;
  dashboard_layout?: string;
}

/** Per-member permission overrides in organization_members.custom_permissions JSONB */
export interface CustomPermissions {
  [permission: string]: boolean;
}

// ── Phase 2: Jobs + Candidates JSONB Types ─────────────────

/**
 * Clone intent captured at clone time — stored in job_openings.metadata.clone_intent.
 * Drives context-aware AI rewrite (Wave 3) and skills delta suggestion (Wave 4).
 */
export interface CloneIntent {
  reason: "new_location" | "new_level" | "repost" | "different_team";
  newLocation?: string; // e.g. "London" — set when reason = new_location
  newLevel?: string;    // e.g. "Staff" — set when reason = new_level
}

/** Clone checklist dismissed items stored in job_openings.metadata.clone_checklist_dismissed */
export type CloneChecklistItem =
  | "title_updated"
  | "skills_reviewed"
  | "hiring_manager_assigned"
  | "salary_set"
  | "embedding_generated"
  | "bias_checked";

/** Job metadata stored in job_openings.metadata JSONB */
export interface JobMetadata {
  external_ids?: {
    linkedin_id?: string;
    indeed_id?: string;
    merge_job_id?: string;
    [provider: string]: string | undefined;
  };
  application_form_id?: string;
  internal_notes?: string;
  clone_intent?: CloneIntent;
  clone_checklist_dismissed?: Partial<Record<CloneChecklistItem, boolean>>;
  /** Bias check result stored at publish time (Wave B). Used to surface a dismissible banner. */
  bias_check?: {
    flaggedTerms: string[];
    suggestions: Record<string, string>;
    checkedAt: string; // ISO timestamp
  };
  [key: string]: unknown;
}

/** Parsed resume stored in candidates.resume_parsed JSONB */
export interface ResumeParsed {
  personalInfo: {
    name: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
  };
  summary?: string;
  totalExperienceYears: number;
  skills: string[];
  experience: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    isCurrent: boolean;
    description: string;
    skills: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field?: string;
    year?: string;
  }>;
  certifications: string[];
}

/** Candidate source details stored in candidates.source_details JSONB */
export interface SourceDetails {
  referrer_id?: string;
  referrer_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  agency_id?: string;
  agency_name?: string;
}

/** Application metadata stored in applications.metadata JSONB */
export interface ApplicationMetadata {
  gdpr_consent?: boolean;
  gdpr_consent_at?: string;
  custom_answers?: Record<string, unknown>;
  [key: string]: unknown;
}

// ── Phase 3: Interviews + Scorecards Types ──────────────────

/** Interview type enum values (CHECK constraint in migration 026) */
export type InterviewType =
  | "phone_screen"
  | "technical"
  | "behavioral"
  | "panel"
  | "culture_fit"
  | "final"
  | "other";

/** Interview status enum values (CHECK constraint in migration 026) */
export type InterviewStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

/** Overall recommendation enum values (CHECK constraint in migration 026) */
export type OverallRecommendation = "strong_no" | "no" | "yes" | "strong_yes";

/** Per-attribute rating in a scorecard submission */
export interface ScorecardRatingInput {
  attribute_id: string;
  rating: number; // 1–5
  notes?: string;
}

/** Recommendation tally for scorecard summary */
export interface RecommendationTally {
  strong_yes: number;
  yes: number;
  no: number;
  strong_no: number;
}

/** Per-attribute aggregate in scorecard summary */
export interface AttributeSummary {
  attribute_id: string;
  attribute_name: string;
  avg_rating: number;
  ratings: Array<{
    submission_id: string;
    submitter_name: string;
    rating: number;
    notes: string | null;
  }>;
}

/** Per-category aggregate in scorecard summary */
export interface CategorySummary {
  category_id: string;
  category_name: string;
  weight: number;
  avg_rating: number;
  attributes: AttributeSummary[];
}

/** Aggregated scorecard summary for an application (D07 §4.3) */
export interface ScorecardSummary {
  application_id: string;
  total_submissions: number;
  recommendations: RecommendationTally;
  weighted_overall: number | null; // null if no ratings
  categories: CategorySummary[];
}
