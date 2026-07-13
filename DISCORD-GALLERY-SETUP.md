# Discord Gallery Setup

The website now loads recent image attachments from one Discord channel. The Discord bot token stays on the website host and is never sent to a visitor's browser.

## 1. Create or use a Discord bot

1. Open the Discord Developer Portal.
2. Create an application and add a bot.
3. Invite the bot to the Blackstone RP Discord server.
4. Give it access to the gallery channel with these permissions:
   - View Channel
   - Read Message History

The bot does not need permission to send, edit, or delete messages.

## 2. Gallery channel configured

The website is already configured to read images from Discord channel **1520414735772811394**. You do not need to add the channel ID unless you want to override it later.

## 3. Add the secure bot token to the website host

Add this required value in the hosting provider's environment-variable or secret settings:

- `DISCORD_BOT_TOKEN` — the bot token from the Discord Developer Portal.

Optional values:

- `DISCORD_GALLERY_CHANNEL_ID` — overrides the built-in channel ID (`1520414735772811394`).
- `DISCORD_GALLERY_LIMIT` — defaults to 24 and supports 1 to 48.

Never paste the bot token into `index.html`, `script.js`, GitHub, or any public file.

### Netlify

Add the variables in the site's environment-variable settings, then redeploy the whole website folder. The included Netlify function and redirect will be used automatically.

### Vercel

Add the variables in the project's environment-variable settings, then redeploy. The included `api/discord-gallery.js` endpoint will be used automatically.

### Cloudflare Pages

Add the variables under the Pages project's environment variables, then redeploy. The included Pages Function will be used automatically.

### cPanel or PHP hosting

Add the variables through the host's environment-variable or application settings. Configure these values in your deployment platform environment settings.

## 4. Upload images

Post images as normal Discord file attachments in the chosen channel. The website checks the latest 100 channel messages and displays up to the configured number of recent PNG, JPG, GIF, WebP, or AVIF attachments.

The gallery refreshes automatically every three minutes and also includes a manual refresh button. A short server-side cache reduces Discord API requests.

## Troubleshooting

- **Setup required:** the `DISCORD_BOT_TOKEN` environment variable is missing.
- **Bot token rejected:** regenerate the token and replace the hosting secret.
- **Bot cannot view channel:** check the channel's View Channel and Read Message History permissions.
- **Channel not found:** confirm that the copied ID is for the correct channel and the bot is in the correct Discord server.
- **No images yet:** upload images as attachments rather than only posting external image links.
