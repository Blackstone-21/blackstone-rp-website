# Security deployment checklist

1. Set `PUBLIC_SITE_URL=https://blackstonerp.com` and `DISCORD_REDIRECT_URI=https://blackstonerp.com/api/discord-callback` exactly, without a trailing slash.
2. Use an `AUTH_SECRET` of at least 32 random characters. Rotating it signs out all current sessions.
3. Keep Redis, Discord client secret and bot token only in Vercel environment variables. Never commit them to GitHub.
4. Confirm the Discord Developer Portal redirect is exactly `https://blackstonerp.com/api/discord-callback`.
5. Map only trusted Discord staff roles to website roles that contain `dashboard.view`.
6. Once a Founder account exists and can sign in, remove `ADMIN_PASSWORD` from Vercel unless bootstrap recovery is still required.
7. Optionally set a long random `HEALTH_TOKEN`; send it only as `Authorization: Bearer <token>` or `X-Health-Token` when detailed health diagnostics are needed.
8. Redeploy Production after changing environment variables, then test Discord login, local Founder login, Admin role restrictions, applications and Shop management.
9. Rotate any secret that has ever appeared in source code, screenshots, chat messages or public logs.
