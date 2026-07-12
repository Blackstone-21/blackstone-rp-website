# Blackstone RP — Vercel Discord login and gallery fix

## Files that must exist in GitHub

The repository root must contain:

- `api/portal.js`
- `api/discord-login.js`
- `api/discord-callback.js`
- `api/discord-gallery.js`
- `api/health.js`
- `api/_lib/portal-core.cjs`
- `assets/blackstone-logo.png`
- `login.js`
- `gallery.js`
- `package.json`
- `vercel.json`

Upload the folders themselves, not only the files from the project root.

## Vercel environment variables

Add these under Project → Settings → Environment Variables for Production, Preview and Development:

- `PUBLIC_SITE_URL=https://blackstone-rp-website-9d5j.vercel.app`
- `DISCORD_REDIRECT_URI=https://blackstone-rp-website-9d5j.vercel.app/api/discord-callback`
- `AUTH_SECRET` (at least 32 random characters)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` (at least 10 characters)
- `ADMIN_NAME`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `DISCORD_GALLERY_CHANNEL_ID=1520414735772811394`
- `DISCORD_GALLERY_LIMIT=24`

Do not put secret values in GitHub.

## Discord Developer Portal

Under OAuth2 → Redirects, add exactly:

`https://blackstone-rp-website-9d5j.vercel.app/api/discord-callback`

On the Bot page, enable Message Content Intent. Ensure the bot is in the Blackstone RP server and can View Channel and Read Message History in channel `1520414735772811394`.

## Redeploy and test

After committing the files and setting variables, redeploy the project. Test:

- `/api/health`
- `/api/portal?action=setup-status`
- `/api/discord-gallery`
- `/api/discord-login?returnTo=portal`

`/api/health` should report `redisConfigured`, `authConfigured`, `discordOAuthConfigured` and `galleryConfigured` as `true`.
