# Blackstone RP Safe Browsing cleanup

## What this patch changes

- Removes the public email/password form from `login.html`.
- Uses Discord OAuth only for members and staff.
- Clearly states that users authenticate on `discord.com`.
- Clearly states that Blackstone RP never asks for a Discord password or authentication code.
- Adds Privacy and Terms pages.
- Adds stronger HTTPS, framing, robots and content-security headers.
- Adds `robots.txt` and `.well-known/security.txt`.

## Before deploying

Confirm the Discord account used by the Founder has a website role/permission mapping that includes `dashboard.view`. The shared login page sends authorised staff to `admin.html` after Discord sign-in.

## Deploy

Copy every file from this patch into the root of the GitHub repository and replace the existing versions. Commit to `main` and wait for Vercel to deploy.

Suggested commit summary:

    Remove public password form and add trust pages

## After deploying

1. Verify `login.html` contains only the Discord sign-in button.
2. Test Discord sign-in and staff access.
3. Add the site as a URL-prefix property in Google Search Console.
4. Open **Security & Manual Actions → Security Issues**.
5. Review any sample URLs Google lists.
6. Select **Request Review** after confirming the updated deployment is live.
7. Also submit the exact URL through Google's Safe Browsing false-positive report if the site is clean.

## Suggested review text

> Blackstone RP is an official gaming-community website. We removed the public email/password form and now use Discord OAuth only. Visitors are redirected to the official discord.com authorisation page, and the website does not request Discord passwords, authentication codes, payment details or phone credentials. We added clear privacy and terms pages, noindex/no-store controls for account pages, and stronger security headers. We reviewed the deployed source and found no malware, credential-harvesting code or deceptive redirects. Please review the false-positive dangerous-site classification.

A custom domain can improve presentation, but it does not automatically remove an existing Safe Browsing classification. Complete the review process after the cleaned site is deployed.
