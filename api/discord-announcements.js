
'use strict';

function json(res, status, body, cacheControl = 'no-store, max-age=0') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (String(req.method || 'GET').toUpperCase() !== 'GET') {
    return json(res, 405, { ok: false, message: 'Method not allowed.' });
  }
  try {
    const { getDiscordAnnouncements, discordAnnouncementsConfigured } = require('./_lib/portal-core.cjs');
    if (!discordAnnouncementsConfigured(process.env)) {
      return json(res, 503, {
        ok: false,
        configured: false,
        message: 'Add DISCORD_ANNOUNCEMENTS_CHANNEL_ID and DISCORD_BOT_TOKEN in Vercel.'
      });
    }
    const announcements = await getDiscordAnnouncements(process.env, { force: false });
    return json(res, 200, {
      ok: true,
      configured: true,
      channelId: String(process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID || '1520408782520193115'),
      count: announcements.length,
      announcements,
      updatedAt: new Date().toISOString()
    }, 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
  } catch (error) {
    console.error('[Blackstone Discord announcements]', error);
    return json(res, error.status || 500, {
      ok: false,
      configured: true,
      message: error?.status && error.status < 500 ? error.message : 'Discord announcements could not be loaded.',
      errorCode: error.code || 'DISCORD_ANNOUNCEMENTS_ERROR'
    });
  }
};
