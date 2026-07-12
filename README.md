# Blackstone RP Website

A responsive Blackstone RP website that preserves the supplied logo exactly as provided and follows its black, graphite, steel, silver and white palette.


## Performance update 4.2

This build includes optimized WebP assets, static caching, shared live-status caching, deferred Discord gallery loading, background-tab polling suspension and smoother large-list searching in the Admin panel. See `CHANGELOG-PERFORMANCE-V4.2.md`.

## New shared website portal

The mobile-app functions are now available through the website:

- `portal.html` — community hub with live server information, announcements, departments, events, staff, featured images, staff access and editable profile/character details.
- `apply.html` — guided civilian, Police, EMS, Fire and Staff application form connected to the staff review queue.
- `admin.html` — secure role-based administration panel.
- `api/portal.js` and `server/portal-core.cjs` — shared Vercel backend and data layer.

See `PORTAL-ADMIN-SETUP.md` for the complete Vercel setup.

## Admin functions

Authorised staff can manage:

- Members and public staff profiles
- Website login accounts
- Roles and granular permissions
- Announcements
- Departments
- Events
- Applications, outcomes and private staff notes
- Featured images
- Community settings and links
- Discord OAuth staff sign-in
- Discord member/role synchronisation and explicit role-ID mapping
- Audit history
- Secure data exports

The backend includes password hashing, signed HttpOnly sessions, rotating refresh sessions, CSRF validation, login/application rate limits and server-side permission checks.

## Required Vercel environment variables

Database and authentication:

- `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or the equivalent Upstash variables
- `AUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- Optional: `ADMIN_NAME`

Discord:

- `DISCORD_BOT_TOKEN`
- `DISCORD_GALLERY_CHANNEL_ID=1520414735772811394`
- Optional: `DISCORD_GALLERY_LIMIT=24`
- `DISCORD_GUILD_ID` for Discord membership checks and Admin sync
- `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` for Discord sign-in

Never place secrets in HTML, CSS, public JavaScript or GitHub.

## Live server status

- Server endpoint: `163.227.178.25:30123`
- Join link: `https://cfx.re/join/4xlaj5`
- Online/offline state
- Current players and maximum slots
- Response time
- Last updated time and automatic refresh countdown
- Player names when available
- Copy-IP and direct-connect controls

Vercel uses `api/server-status.js` as the same-origin status fallback.

## Discord gallery

The Gallery tab loads recent image attachments from Discord channel `1520414735772811394`. It includes automatic refresh, manual refresh, a responsive grid and full-size image viewer. See `DISCORD-GALLERY-SETUP.md`.

## Rules

- The complete rules are displayed on the main website.
- Dedicated page: `rules.html`
- Plain-text copy: `assets/blackstone-rp-rules.txt`

## Official links

- Discord: `https://discord.gg/bqHJqCFC7E`
- FiveM: `https://cfx.re/join/4xlaj5`
- TikTok: `https://www.tiktok.com/@blackstone_roleplay`

## Branding

- Uses `assets/blackstone-logo.png` without recolouring, filtering or editing.
- Staff name correction remains **Panox**.


## Website access pages

- `login.html` — Discord OAuth staff-only login; accounts without `dashboard.view` are denied access.
- `portal.html` — community hub and member profile.
- `admin.html` — v12-style role-based administration command centre.
- `gallery.html` — dedicated Discord-powered gallery.

Discord role sync supports manual locks so staff roles and departments are not overwritten.


## Two-way Discord announcements

The website and Discord announcements channel are linked through the existing bot:

- Discord channel: `1520408782520193115`
- Messages posted or edited directly in Discord appear in the website announcement feed.
- Published announcements created or edited in the website Admin Panel are created or updated in Discord.
- Unpublishing or deleting a website-managed announcement removes its linked Discord message.
- The public diagnostic endpoint is `/api/discord-announcements`.

Required Vercel setting:

- `DISCORD_ANNOUNCEMENTS_CHANNEL_ID=1520408782520193115`

Optional settings:

- `DISCORD_ANNOUNCEMENTS_LIMIT=50`
- `DISCORD_ANNOUNCEMENTS_CROSSPOST=true` to automatically publish bot messages from a Discord Announcement channel.

The bot needs View Channel, Read Message History, Send Messages and Embed Links in the announcements channel. Keep Message Content Intent enabled. Never put the bot token in GitHub.


## Staff-only login update

- The public member login has been removed.
- `login.html` is now labelled and enforced as staff-only.
- Discord sign-in always requests the Admin destination.
- Accounts without the `dashboard.view` permission are returned to the staff login page.
- The public Community Hub no longer exposes its former member sign-in modal.

## v4.4 admin login layout fix

The administration login is now centred across desktop and mobile layouts. Protected admin navigation remains fully hidden until authentication succeeds, preventing the sidebar from appearing over the login screen while the session is checked.


## v4.5 Fire Department update

- Added Fire Department applications to the public application portal.
- Added Fire to the homepage department selector and Community Hub department data.
- Added a safe one-time database migration so existing Vercel deployments receive the Fire Department without deleting current departments or applications.
- Fire is available automatically in Admin member and role department lists.


## v4.6 Shop Management

- Replaces the top navigation Features link with Shop.
- Adds a public, responsive shop section to the homepage.
- Adds Shop management to the administration panel.
- Staff with `shop.manage` can create, edit, publish, feature, mark sold out and delete shop items.
- Shop data is stored in the existing shared Redis database and appears automatically on the website.
- Product and image links must use HTTPS.
