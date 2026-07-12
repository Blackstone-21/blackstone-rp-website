# Update the live GitHub and Vercel website

Your live project is deployed from the GitHub repository:

`Blackstone-21/blackstone-rp-website`

## Replace the repository files

1. Extract the update ZIP.
2. Open the extracted `blackstone-rp-website` folder.
3. Upload **all files and folders inside it** to the root of the GitHub repository.
4. Allow GitHub to replace files with the same names.
5. Commit the upload with a message such as `Add gallery and v12 admin login`.

Do not upload the outer ZIP folder as an extra folder. The repository root must directly contain:

```text
index.html
login.html
gallery.html
portal.html
admin.html
api/
server/
assets/
vercel.json
```

## Vercel deployment

Vercel should start a new deployment automatically after the GitHub commit. Open the Vercel project and confirm the latest deployment becomes **Ready**.

Test these pages:

```text
https://blackstone-rp-website.vercel.app/
https://blackstone-rp-website.vercel.app/gallery.html
https://blackstone-rp-website.vercel.app/login.html
https://blackstone-rp-website.vercel.app/admin.html
https://blackstone-rp-website.vercel.app/api/portal?action=setup-status
```

## Existing environment variables

Keep the existing Vercel variables. The login and Discord features need:

```text
AUTH_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
ADMIN_NAME
DISCORD_BOT_TOKEN
DISCORD_GALLERY_CHANNEL_ID=1520414735772811394
DISCORD_GUILD_ID
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
KV_REST_API_URL and KV_REST_API_TOKEN
```

After deployment, the backend runs a one-time migration that changes hellcat007 to Founder and adds safe manual/Discord role controls without deleting existing members, roles, departments or permissions.
