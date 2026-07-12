const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DEFAULT_DISCORD_GALLERY_CHANNEL_ID = '1520414735772811394';
const CACHE_TTL_MS = 60_000;
let memoryCache = { channelId: '', expiresAt: 0, payload: null };

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function cleanText(value = '', maxLength = 220) {
  return String(value)
    .replace(/<@!?\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/<a?:[A-Za-z0-9_]+:\d+>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isDiscordCdnUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isImageAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return false;
  const url = attachment.url || attachment.proxy_url || '';
  if (!isDiscordCdnUrl(url)) return false;
  const contentType = String(attachment.content_type || '').toLowerCase();
  const filename = String(attachment.filename || url).toLowerCase();
  return contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)(?:$|\?)/i.test(filename);
}

function normaliseMessages(messages, imageLimit) {
  const images = [];
  const seen = new Set();

  for (const message of Array.isArray(messages) ? messages : []) {
    for (const attachment of Array.isArray(message.attachments) ? message.attachments : []) {
      if (!isImageAttachment(attachment)) continue;
      const url = attachment.url || attachment.proxy_url;
      const key = attachment.id || url;
      if (seen.has(key)) continue;
      seen.add(key);
      const caption = cleanText(message.content) || cleanText(attachment.description) || cleanText(attachment.filename, 120) || 'Blackstone RP community screenshot';
      images.push({
        id: `${message.id}-${attachment.id}`,
        url,
        filename: cleanText(attachment.filename, 140),
        caption,
        alt: cleanText(attachment.description) || caption,
        timestamp: message.timestamp || message.edited_timestamp || new Date().toISOString(),
        width: Number.isFinite(Number(attachment.width)) ? Number(attachment.width) : null,
        height: Number.isFinite(Number(attachment.height)) ? Number(attachment.height) : null
      });
      if (images.length >= imageLimit) return images;
    }
  }

  return images;
}

function safeErrorMessage(error) {
  if (error?.name === 'AbortError') return 'The Discord gallery request timed out.';
  if (error?.status === 401) return 'The Discord bot token was rejected.';
  if (error?.status === 403) return 'The Discord bot cannot view this channel or read its message history.';
  if (error?.status === 404) return 'The configured Discord channel could not be found.';
  if (error?.status === 429) return 'Discord is temporarily rate limiting the gallery feed. Please try again shortly.';
  return 'The Discord gallery feed could not be loaded.';
}

async function fetchDiscordMessages(token, channelId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${encodeURIComponent(channelId)}/messages?limit=100`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bot ${token}`,
        'User-Agent': 'BlackstoneRP-Website/3.0 (Discord Gallery)'
      },
      signal: controller.signal
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok) {
      const error = new Error(`Discord API returned HTTP ${response.status}.`);
      error.status = response.status;
      error.retryAfter = Number(payload?.retry_after || 0);
      throw error;
    }

    if (!Array.isArray(payload)) throw new Error('Discord returned an invalid message list.');
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function getDiscordGallery(env) {
  const token = String(env.DISCORD_BOT_TOKEN || '').trim();
  const channelId = String(env.DISCORD_GALLERY_CHANNEL_ID || env.DISCORD_CHANNEL_ID || DEFAULT_DISCORD_GALLERY_CHANNEL_ID).trim();
  const imageLimit = clamp(env.DISCORD_GALLERY_LIMIT, 1, 48, 24);

  if (!token || !channelId) {
    return {
      status: 503,
      cacheable: false,
      body: {
        ok: false,
        configured: false,
        message: 'The Discord gallery connection has not been configured on the website host.',
        fetchedAt: new Date().toISOString()
      }
    };
  }

  if (memoryCache.channelId === channelId && memoryCache.payload && memoryCache.expiresAt > Date.now()) {
    return { status: 200, cacheable: true, body: memoryCache.payload };
  }

  try {
    const messages = await fetchDiscordMessages(token, channelId);
    const images = normaliseMessages(messages, imageLimit);
    const payload = {
      ok: true,
      configured: true,
      source: 'DISCORD CHANNEL',
      count: images.length,
      images,
      fetchedAt: new Date().toISOString()
    };
    memoryCache = { channelId, expiresAt: Date.now() + CACHE_TTL_MS, payload };
    return { status: 200, cacheable: true, body: payload };
  } catch (error) {
    return {
      status: error?.status === 429 ? 503 : 502,
      cacheable: false,
      body: {
        ok: false,
        configured: true,
        message: safeErrorMessage(error),
        retryAfter: Number(error?.retryAfter || 0),
        fetchedAt: new Date().toISOString()
      }
    };
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      }
    });
  }

  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, message: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const result = await getDiscordGallery(context.env);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': result.cacheable
        ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
        : 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
