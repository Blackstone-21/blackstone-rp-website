# Blackstone RP Portal and Admin Setup — Vercel

The website now includes a shared community portal, application system and secure staff administration area.

## Included pages

- `/login.html` — shared member and staff login, with Discord OAuth and secure email/password access.
- `/portal.html` — community hub, profile and character details, announcements, departments, events, staff and featured images.
- `/gallery.html` — dedicated live gallery populated from Discord channel `1520414735772811394`.
- `/apply.html` — five-step civilian, department and staff application form.
- `/admin.html` — secure staff panel for community management.
- `/api/portal` — shared server-side API used by the portal, applications and admin panel.

## 1. Deploy the complete project

Import the complete website folder into a Vercel project. The `api`, `server`, `assets` and all HTML/CSS/JS files must remain together in the repository root.

Use **Other** as the framework preset. No build command or output directory is required for this static website with Vercel Functions.

## 2. Add Upstash Redis

In the Vercel project:

1. Open **Storage** or **Marketplace**.
2. Add an **Upstash Redis** integration/database.
3. Connect it to the Blackstone RP project.
4. Confirm Vercel added either:
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

The portal supports both variable-name formats.

## 3. Add authentication variables

Open **Settings → Environment Variables** and add these values for Production, Preview and Development:

```text
AUTH_SECRET=<a unique random value at least 32 characters long>
ADMIN_EMAIL=<the first founder/admin email address>
ADMIN_PASSWORD=<a strong password at least 10 characters long>
ADMIN_NAME=<the founder/admin display name>
```

A suitable `AUTH_SECRET` can be generated locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The first administrator receives the **Founder** role. The account is created only when that email does not already exist. Changing `ADMIN_PASSWORD` later does not overwrite an existing account password; use **Admin → Settings → Change Password** instead.

## 4. Keep the Discord gallery connected

Add:

```text
DISCORD_BOT_TOKEN=<private Discord bot token>
DISCORD_GALLERY_CHANNEL_ID=1520414735772811394
DISCORD_GALLERY_LIMIT=24
```

The bot needs **View Channel** and **Read Message History** in the gallery channel. Never add the token to GitHub or a public JavaScript file.

## 5. Enable Discord member and role sync

For website Discord sign-in and the Admin panel's Discord Sync page, also add:

```text
DISCORD_GUILD_ID=<Blackstone RP Discord server ID>
DISCORD_CLIENT_ID=<Discord application Client ID>
DISCORD_CLIENT_SECRET=<Discord OAuth2 Client Secret>
```

Use the same Discord application as the gallery bot. In the Discord Developer Portal:

1. Open **OAuth2** and copy the Client ID.
2. Reset/copy the Client Secret and store it only in Vercel.
3. Add this redirect URL under OAuth2 redirects:

```text
https://your-domain.vercel.app/api/portal?action=discord-callback
```

4. Enable **Server Members Intent** on the Bot page.
5. Confirm the bot is in the Blackstone RP server and can view members and roles.

The callback URL is normally detected automatically from the Vercel domain. Add `DISCORD_REDIRECT_URI` only when using a custom callback URL.

### Link Discord roles to website roles

After the first administrator signs in:

1. Open **Admin → Roles & Permissions**.
2. Edit a website role such as Founder, Administrator, Moderator or Staff.
3. Set a **Role priority**. Higher values win when a member has more than one mapped Discord role.
4. Optionally select a **Mapped department** and **Mapped default rank**.
5. Paste the matching Discord role ID into **Discord role IDs — one per line**.
6. Save the role and run **Admin → Discord Sync**.

Under **Admin → Members**, each profile has separate role and department controls:

- **Manual** keeps the administrator-selected value and Discord sync will not overwrite it.
- **Discord** follows the mapped Discord role, department and default rank.

Discord-linked users are imported into the Members registry. Existing manually managed staff roles and departments remain unchanged.

## 6. Redeploy

After adding or changing environment variables:

1. Open **Deployments**.
2. Open the latest deployment menu.
3. Choose **Redeploy**.

Then test:

```text
https://your-domain.vercel.app/api/portal?action=setup-status
https://your-domain.vercel.app/login.html
https://your-domain.vercel.app/portal.html
https://your-domain.vercel.app/gallery.html
https://your-domain.vercel.app/apply.html
https://your-domain.vercel.app/admin.html
```

The setup-status endpoint should report the database and authentication as configured.

## Security design

- Passwords are stored as salted PBKDF2-SHA-512 hashes, never as plain text.
- Access and refresh sessions are signed and stored in secure HttpOnly cookies.
- Access tokens expire after 15 minutes; refresh sessions rotate and expire after seven days.
- State-changing requests require a CSRF token.
- Login and public application submissions are rate-limited.
- Role-based permissions control every admin section on both the page and API.
- Discord OAuth state is signed, short-lived and bound to an HttpOnly SameSite cookie.
- Discord roles grant website access only when their exact role IDs are mapped by a Founder.
- Staff changes are written to an audit history.
- Admin pages and API responses are marked no-store.

## Staff admin functions

The Founder role can manage:

- Dashboard statistics
- Announcements and community news
- Member registry and public staff roster
- Login accounts
- Roles and permissions
- Departments
- Events
- Applications and staff review notes
- Featured images
- Discord member/role sync
- Audit history
- Community links and application availability
- Secure data export

## Mobile app connection

The website portal API is designed as the shared data source for the mobile app. The current website uses secure same-origin cookie sessions. A future mobile build can use the same database and API with a dedicated mobile token flow, allowing website and app content to stay synchronised.
