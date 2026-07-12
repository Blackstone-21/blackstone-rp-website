# Blackstone RP Website — Performance Update 4.2

Prepared: 12 July 2026

## What changed

- Converted the large homepage and staff images to correctly sized WebP assets.
- Replaced the 2.7 MB favicon source with a dedicated 64 px favicon.
- Added image dimensions, asynchronous decoding and lazy loading for below-the-fold staff imagery.
- Reduced the packaged image payload from about 7.33 MB to about 0.20 MB.
- Added long-lived caching for versioned static assets.
- Added short shared caching and request de-duplication to the FiveM server-status APIs.
- Reduced the worst-case server-status fallback time by checking direct fallbacks in parallel.
- Removed timestamp cache-busting from live gallery and server-status requests.
- Delayed the homepage Discord gallery request until the gallery is near the viewport.
- Paused automatic live-data polling while the browser tab is hidden.
- Removed redundant Netlify endpoint requests because Netlify already redirects the standard API path.
- Throttled the decorative cursor effect to one update per animation frame and disabled it on touch devices.
- Added content-visibility hints so browsers can skip rendering distant sections until needed.
- Debounced Admin panel searching for smoother handling of large Discord member lists.
- Added a short public cache for Community Hub content while keeping all private account and admin routes uncached.

## Preserved functionality

- Staff-only login and permission checks
- Discord OAuth and role mapping
- Admin panel and application management
- Discord gallery and announcements
- FiveM live server status
- Vercel, Netlify, Cloudflare Pages and PHP hosting fallbacks

No secrets or environment-variable values are included in this package.
