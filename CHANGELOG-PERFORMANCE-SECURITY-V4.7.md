# Blackstone RP Website v4.7

## Performance

- Public portal data now reads only the seven public Redis keys instead of loading accounts, applications and audit records.
- Short in-memory request coalescing prevents duplicate public, seed and live-data work during traffic bursts.
- Discord announcements use their existing cache instead of forcing a fresh Discord request on every page load.
- Homepage status and gallery calls use only the same-origin Vercel APIs, removing slow PHP and direct-browser fallback chains.
- Network requests have bounded timeouts and polling pauses while the page is hidden.
- Large Admin lists use cached search text and 100-record pagination.
- Below-the-fold homepage sections use `content-visibility` where supported.

## Security and bug fixes

- Discord members without a mapped website role containing `dashboard.view` are rejected before an account or session is created.
- Access tokens are linked to live server-side sessions, so logout, password changes, deactivation and role changes revoke access immediately.
- Refresh sessions and OAuth state are consumed atomically to block replay races.
- OAuth state is tied to a stable browser context and redirect URLs are restricted to `PUBLIC_SITE_URL`, avoiding unnecessary failures when a mobile IP changes.
- Role hierarchy checks block staff from assigning or modifying accounts above their own access level.
- Password changes revoke every active session and require a new sign-in.
- JSON bodies are limited to 128 KB and mutation endpoints accept JSON only.
- Login, application and OAuth endpoints have rate limiting.
- User-facing 500 errors no longer expose internal exception details.
- Admin setup messages use text nodes instead of injecting error text as HTML.
- Fixed new role creation where the Role ID could be overwritten before saving.
- Fixed asynchronous Discord callback failures bypassing the central error handler.
- Added global CSP, frame blocking, HSTS, permissions policy and related browser headers.
- Removed obsolete PHP fallback endpoints that were no longer used by the Vercel deployment.
- Malformed cookie values are ignored safely instead of causing a server error.
- Detailed health configuration is hidden unless a valid optional `HEALTH_TOKEN` is supplied.
- Added an invisible application honeypot and stricter field/URL validation.

## Compatibility note

The hardened session format intentionally signs out sessions issued by older builds. Staff sign in again after deployment. Existing Redis content, applications, roles, departments and shop items are preserved.
