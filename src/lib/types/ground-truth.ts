/**
 * Ground-truth TypeScript types for all JSONB columns in the schema.
 * Single source of truth — never define JSONB types inline (ADR-001).
 *
 * These types will be populated as schema migrations are written.
 * Each type corresponds to a JSONB column in a database table.
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
  bonus?: number;
  equity?: string;
  sign_on_bonus?: number;
  other_benefits?: string[];
}

/** Auto-action configuration stored in pipeline_stages.auto_actions JSONB */
export interface AutoAction {
  type: "send_email" | "move_stage" | "add_tag" | "notify";
  config: Record<string, unknown>;
  enabled: boolean;
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
  primary_color?: string;
  career_page_header?: string;
  career_page_footer?: string;
}

/** Organization feature flags stored in organizations.feature_flags JSONB */
export interface FeatureFlags {
  [flag: string]: boolean;
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
