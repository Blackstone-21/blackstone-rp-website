'use strict';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DEFAULT_CHANNEL_ID = '1520414735772811394';
let cache = { channelId: '', expiresAt: 0, body: null };

function json(res, status, body, cacheControl = 'no-store, max-age=0') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify(body));
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function cleanText(value = '', max = 240) {
  return String(value)
    .replace(/<@!?\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/<a?:[A-Za-z0-9_]+:\d+>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function validDiscordImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isImage(attachment) {
  if (!attachment || typeof attachment !== 'object') return false;
  const url = attachment.url || attachment.proxy_url || '';
  if (!validDiscordImageUrl(url)) return false;
  const type = String(attachment.content_type || '').toLowerCase();
  const filename = String(attachment.filename || '').toLowerCase();
  return type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)$/i.test(filename);
}

function collectImages(messages, limit) {
  const output = [];
  const seen = new Set();
  for (const message of Array.isArray(messages) ? messages : []) {
    for (const attachment of Array.isArray(message.attachments) ? message.attachments : []) {
      if (!isImage(attachment)) continue;
      const url = attachment.url || attachment.proxy_url;
      const key = String(attachment.id || url);
      if (seen.has(key)) continue;
      seen.add(key);
      const caption = cleanText(message.content) || cleanText(attachment.description) || cleanText(attachment.filename, 140) || 'Blackstone RP gallery image';
      output.push({
        id: `${message.id || 'message'}-${attachment.id || output.length}`,
        url,
        filename: cleanText(attachment.filename, 140),
        caption,
        alt: cleanText(attachment.description) || caption,
        timestamp: message.timestamp || message.edited_timestamp || new Date().toISOString(),
        width: Number.isFinite(Number(attachment.width)) ? Number(attachment.width) : null,
        height: Number.isFinite(Number(attachment.height)) ? Number(attachment.height) : null
      });
      if (output.length >= limit) return output;
    }
  }
  return output;
}

function friendlyDiscordError(status) {
  if (status === 401) return 'Discord rejected the bot token. Reset the token and update DISCORD_BOT_TOKEN in Vercel.';
  if (status === 403) return 'The gallery bot needs View Channel and Read Message History permission in the gallery channel.';
  if (status === 404) return 'Discord could not find the configured gallery channel. Confirm the channel ID and that the bot is in the server.';
  if (status === 429) return 'Discord is rate limiting the gallery temporarily. Try again shortly.';
  return `Discord returned an unexpected response (${status}).`;
}

module.exports = async function handler(req, res) {
  if (String(req.method || 'GET').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.end('');
  }
  if (String(req.method || 'GET').toUpperCase() !== 'GET') {
    return json(res, 405, { ok: false, message: 'Method not allowed.' });
  }

  const token = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  const channelId = String(process.env.DISCORD_GALLERY_CHANNEL_ID || DEFAULT_CHANNEL_ID).trim();
  const imageLimit = clamp(process.env.DISCORD_GALLERY_LIMIT, 1, 48, 24);

  if (!token) {
    return json(res, 503, {
      ok: false,
      configured: false,
      message: 'DISCORD_BOT_TOKEN is missing from this Vercel deployment.',
      channelId,
      fetchedAt: new Date().toISOString()
    });
  }

  if (!/^\d{15,22}$/.test(channelId)) {
    return json(res, 503, {
      ok: false,
      configured: false,
      message: 'DISCORD_GALLERY_CHANNEL_ID is invalid.',
      fetchedAt: new Date().toISOString()
    });
  }

  if (cache.body && cache.channelId === channelId && cache.expiresAt > Date.now()) {
    return json(res, 200, cache.body, 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages?limit=100`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bot ${token}`,
        'User-Agent': 'BlackstoneRP-Website/4.0 (Discord Gallery)'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return json(res, response.status === 429 ? 503 : 502, {
        ok: false,
        configured: true,
        message: friendlyDiscordError(response.status),
        discordStatus: response.status,
        retryAfter: Number(payload?.retry_after || 0),
        fetchedAt: new Date().toISOString()
      });
    }

    if (!Array.isArray(payload)) {
      return json(res, 502, { ok: false, configured: true, message: 'Discord returned an invalid gallery response.' });
    }

    const images = collectImages(payload, imageLimit);
    const body = {
      ok: true,
      configured: true,
      channelId,
      count: images.length,
      images,
      fetchedAt: new Date().toISOString()
    };
    cache = { channelId, expiresAt: Date.now() + 60000, body };
    return json(res, 200, body, 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  } catch (error) {
    console.error('[Blackstone Discord gallery]', error);
    const timedOut = error?.name === 'AbortError';
    return json(res, 502, {
      ok: false,
      configured: true,
      message: timedOut ? 'The Discord gallery request timed out.' : 'The Discord gallery function failed. Check the Vercel Function logs.',
      errorCode: error?.code || (timedOut ? 'DISCORD_TIMEOUT' : 'DISCORD_GALLERY_ERROR'),
      fetchedAt: new Date().toISOString()
    });
  } finally {
    clearTimeout(timeout);
  }
};
