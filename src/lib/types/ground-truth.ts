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
