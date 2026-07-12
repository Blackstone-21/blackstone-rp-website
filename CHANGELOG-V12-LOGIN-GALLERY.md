# Blackstone RP Website Update

## Public website

- Changed hellcat007 from **Server Owner** to **Founder**.
- Changed the description to **Founder and primary developer**.
- Added a dedicated **Gallery** page and linked it from the main navigation.
- Added a clear **Login** button to the main navigation.

## Login and administration

- Added a shared login page for Discord members and staff email accounts.
- Staff accounts with `dashboard.view` are sent directly to the v12-style admin command centre.
- Added Discord login to the admin entrance.
- Retained password hashing, rotating sessions, CSRF protection, rate limits, permissions and audit history.

## Discord role fix

- Discord-linked users appear in the Members registry.
- Member roles can be controlled manually or by Discord.
- Manual roles are never overwritten by Discord sync.
- Departments can be mapped from a website role to a Discord role.
- Manual department assignments are preserved.
- Role priority decides which mapped role wins when a member has several Discord roles.
- Existing data is migrated automatically on first request after deployment.
