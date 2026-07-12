# Discord announcements update

## Added

- Two-way Discord announcements using channel `1520408782520193115`.
- Discord messages and edits automatically appear in the website Community Hub announcement feed.
- Published announcements saved through the Admin Panel automatically create or update a Discord message.
- Unpublishing or deleting a website-managed announcement removes its linked Discord message.
- Discord announcement images, author details and direct message links are displayed on the website.
- New diagnostic endpoint: `/api/discord-announcements`.
- New `/api/health` result: `announcementsConfigured`.
- Admin sync warnings are shown instead of silently failing.

## Required Discord permissions

- View Channel
- Read Message History
- Send Messages
- Embed Links

Keep Message Content Intent enabled in the Discord Developer Portal.
