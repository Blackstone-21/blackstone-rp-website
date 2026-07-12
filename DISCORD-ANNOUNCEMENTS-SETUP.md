# Blackstone RP two-way Discord announcements

## Channel

`1520408782520193115`

## Vercel environment variables

Add these under Project Settings → Environment Variables:

```text
DISCORD_ANNOUNCEMENTS_CHANNEL_ID=1520408782520193115
DISCORD_ANNOUNCEMENTS_LIMIT=50
DISCORD_ANNOUNCEMENTS_CROSSPOST=false
```

The existing `DISCORD_BOT_TOKEN` is reused. Do not add the token to GitHub. Redeploy Production after saving the variables.

## Discord permissions

Give the website bot these permissions specifically in the announcements channel:

- View Channel
- Read Message History
- Send Messages
- Embed Links

Keep Message Content Intent enabled in Discord Developer Portal → Bot. If the channel is a Discord Announcement channel and automatic publication to followers is required, also give the bot Manage Messages and set `DISCORD_ANNOUNCEMENTS_CROSSPOST=true`.

## How syncing works

- A message posted or edited directly in Discord appears on the website after the short cache refresh.
- A published announcement saved in the website Admin Panel is posted to Discord.
- Editing that website-managed announcement edits the linked Discord message.
- Unpublishing or deleting it removes the linked Discord message.
- Discord-only messages remain managed in Discord and are read by the website.

## Test

After redeploying, open:

```text
https://YOUR-DOMAIN/api/health
https://YOUR-DOMAIN/api/discord-announcements
```

`announcementsConfigured` should be `true`. The second URL should return the latest Discord announcements.
