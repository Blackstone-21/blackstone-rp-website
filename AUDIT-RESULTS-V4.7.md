# Blackstone RP v4.7 audit results

Audit completed on 13 July 2026 against the v4.6 Shop build.

## Automated checks passed

- JavaScript syntax validation passed for every `.js` and `.cjs` file.
- JSON validation passed for `vercel.json`, `package.json` and `package-lock.json`.
- `npm audit --omit=dev` reported 0 known dependency vulnerabilities across all severities.
- Static HTML integrity check found 0 duplicate IDs and 0 broken local file references.
- Authentication smoke tests passed for login, live-session validation, rotating refresh, replay rejection and immediate logout revocation.
- Permission smoke tests confirmed a lower-priority administrator cannot assign the Founder role.
- Application smoke tests confirmed the anti-spam honeypot and 128 KB request-body limit.
- Discord OAuth smoke tests confirmed an unmapped Discord member is rejected before a website account or session is created.
- The Vercel and alternate-host portal core copies were byte-for-byte synchronized after testing.

## Important limitation

Security is an ongoing process. This review fixes the identified issues and substantially hardens the supplied code, but no audit can guarantee that software will never contain a future bug or vulnerability. Keep Vercel, Discord and Redis secrets private, rotate exposed credentials, and review logs after deployment.
