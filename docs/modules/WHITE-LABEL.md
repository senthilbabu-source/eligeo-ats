# White-Label / Custom Domain

> **ID:** D20
> **Status:** Review
> **Priority:** P3
> **Last updated:** 2026-03-10
> **Depends on:** D05 (Design System — branding_config), D09 (Candidate Portal — career page theming, email sender identity)
> **Depended on by:** — (terminal document)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-002 (Next.js 16, proxy.ts middleware)

---

## 1. Overview

White-Label / Custom Domain defines how organizations can fully brand their ATS presence: custom domains for career pages, email sender domains, extended branding configuration, and removal of Eligeo branding. This is an Enterprise-tier feature.

**Scope:**
- In scope: Custom domain setup, DNS/SSL verification, email domain configuration, extended branding_config, white-label badge removal, proxy.ts routing for custom domains.
- Out of scope: CDN configuration (Vercel-managed), email deliverability optimization (Resend-managed), custom CSS injection (security risk).

## 2. Custom Domain Architecture

### 2.1 Domain Types

| Type | Default | Custom | Example |
|------|---------|--------|---------|
| Career page | `careers.eligeo.io/{slug}` | `careers.acme.com` | Enterprise plan |
| API (candidate portal) | `eligeo.io/api/v1/portal/*` | `api.careers.acme.com/v1/*` | Enterprise plan |
| Email sender | `noreply@mail.eligeo.io` | `noreply@acme.com` | Enterprise plan |

### 2.2 DNS Setup Flow

```
1. Admin enters custom domain in Settings → White-Label
2. System generates required DNS records:
   - CNAME: careers.acme.com → cname.vercel-dns.com
   - TXT: _vercel.careers.acme.com → vc-domain-verify=...
3. Admin adds records to their DNS provider
4. System polls for DNS propagation (Inngest, every 5 min, max 48h)
5. Once verified: Vercel provisions SSL certificate (automatic)
6. Custom domain becomes active
```

### 2.3 Proxy.ts Routing

```typescript
// proxy.ts — custom domain routing
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';

  // Check if hostname is a custom domain
  if (!hostname.endsWith('.eligeo.io') && !hostname.includes('localhost')) {
    // Look up organization by custom_domain
    // Note: this lookup is cached at the edge (Vercel Edge Config or KV)
    const orgSlug = await lookupCustomDomain(hostname);

    if (orgSlug) {
      // Rewrite to the career page route
      const url = request.nextUrl.clone();
      url.pathname = `/careers/${orgSlug}${url.pathname}`;
      return NextResponse.rewrite(url);
    }

    return NextResponse.next(); // Unknown domain — 404 handled by Next.js
  }

  return NextResponse.next();
}
```

### 2.4 Domain Verification

```typescript
export const whitelabelDomainVerify = inngest.createFunction(
  { id: 'whitelabel-domain-verify', retries: 0 },
  { cron: '*/5 * * * *' }, // Every 5 minutes
  async ({ step }) => {
    const supabase = createServiceClient();

    // Find orgs with pending domain verification
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, custom_domain, metadata')
      .not('custom_domain', 'is', null)
      .is('deleted_at', null);

    for (const org of orgs ?? []) {
      if (org.metadata?.domain_verified) continue;

      await step.run(`verify-${org.id}`, async () => {
        // Check DNS CNAME resolution
        const verified = await verifyDNS(org.custom_domain);

        if (verified) {
          // Add domain to Vercel project
          await addVercelDomain(org.custom_domain);

          await supabase
            .from('organizations')
            .update({
              metadata: { ...org.metadata, domain_verified: true, domain_verified_at: new Date().toISOString() },
            })
            .eq('id', org.id);
        }
      });
    }
  }
);
```

## 3. Email Domain Configuration

### 3.1 Sender Domain Setup

For custom email sender identity (`noreply@acme.com` instead of `noreply@mail.eligeo.io`):

```
1. Admin enters sender domain in Settings → White-Label → Email
2. System generates DNS records via Resend API:
   - SPF: TXT record
   - DKIM: CNAME records (3x)
   - DMARC: TXT record (recommended)
3. Admin adds records to DNS
4. Resend verifies domain
5. All candidate emails sent from custom domain
```

### 3.2 Resend Domain Verification

```typescript
async function setupEmailDomain(orgId: string, domain: string) {
  // Create domain in Resend
  const result = await resend.domains.create({ name: domain });

  // Store verification records for admin display
  await supabaseAdmin
    .from('organizations')
    .update({
      metadata: {
        email_domain: domain,
        email_domain_id: result.data.id,
        email_dns_records: result.data.records,
        email_domain_verified: false,
      },
    })
    .eq('id', orgId);

  return result.data.records; // Display to admin for DNS setup
}
```

## 4. Extended Branding

### 4.1 Full BrandingConfig (Enterprise)

Enterprise extends the base `branding_config` (D09 §4.2):

```typescript
interface BrandingConfigEnterprise extends BrandingConfig {
  // Base fields (all plans — D09)
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  font_family?: string;
  favicon_url?: string;
  career_page_header_html?: string;

  // Enterprise-only extensions
  hide_powered_by?: boolean;         // Remove "Powered by Eligeo" badge
  custom_footer_html?: string;       // Sanitized footer HTML
  email_logo_url?: string;           // Logo for email templates (different from career page)
  email_footer_html?: string;        // Custom email footer
  privacy_policy_url?: string;       // Link in GDPR consent + emails
  terms_url?: string;                // Link in application form
  support_email?: string;            // Displayed in candidate-facing pages
}
```

### 4.2 "Powered By" Badge

- **Starter/Growth/Pro:** "Powered by Eligeo" badge shown in career page footer and email footer.
- **Enterprise:** Badge removed when `hide_powered_by = true`.

## 5. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/settings/domain` | JWT (owner) | Set custom domain |
| GET | `/api/v1/settings/domain/status` | JWT (owner) | Check domain verification status |
| DELETE | `/api/v1/settings/domain` | JWT (owner) | Remove custom domain |
| POST | `/api/v1/settings/email-domain` | JWT (owner) | Set email sender domain |
| GET | `/api/v1/settings/email-domain/status` | JWT (owner) | Check email domain verification |
| PUT | `/api/v1/settings/branding` | JWT (admin) | Update branding_config |

## 6. Inngest Functions

| Function ID | Trigger | Purpose |
|-------------|---------|---------|
| `whitelabel-domain-verify` | `cron: */5 * * * *` | Poll DNS for domain verification |
| `whitelabel-email-domain-verify` | `cron: */15 * * * *` | Poll Resend for email domain status |

## 7. Plan Gating

| Feature | Starter | Growth | Pro | Enterprise |
|---------|---------|--------|-----|------------|
| Career page branding (colors, logo) | ✅ | ✅ | ✅ | ✅ |
| Custom career page header HTML | ❌ | ✅ | ✅ | ✅ |
| Custom domain | ❌ | ❌ | ❌ | ✅ |
| Custom email sender domain | ❌ | ❌ | ❌ | ✅ |
| Remove "Powered by" badge | ❌ | ❌ | ❌ | ✅ |
| Custom footer/email branding | ❌ | ❌ | ❌ | ✅ |

## 8. Security Considerations

- **Domain ownership:** DNS verification (CNAME + TXT record) proves domain ownership before activation.
- **SSL:** Vercel provisions and auto-renews SSL certificates for custom domains. No manual cert management.
- **HTML sanitization:** `custom_footer_html` and `email_footer_html` are sanitized with DOMPurify (same rules as D09 §4.2).
- **Domain takeover prevention:** If a custom domain's DNS records are removed (domain lapses), the next verification check marks it as unverified and falls back to default URLs.
- **Email spoofing prevention:** SPF + DKIM + DMARC records required before custom email domain is active.
