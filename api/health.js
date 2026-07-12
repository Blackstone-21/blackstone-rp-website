'use strict';

module.exports = async function handler(req, res) {
  const redisConfigured = Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  );
  const authConfigured = String(process.env.AUTH_SECRET || process.env.ADMIN_AUTH_SECRET || '').length >= 32;
  const discordOAuthConfigured = Boolean(
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET &&
    process.env.DISCORD_BOT_TOKEN &&
    process.env.DISCORD_GUILD_ID
  );
  const galleryConfigured = Boolean(process.env.DISCORD_BOT_TOKEN && (process.env.DISCORD_GALLERY_CHANNEL_ID || '1520414735772811394'));

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end(JSON.stringify({
    ok: true,
    service: 'Blackstone RP website',
    redisConfigured,
    authConfigured,
    discordOAuthConfigured,
    galleryConfigured,
    callbackUrl: `${String(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '')}/api/discord-callback`,
    checkedAt: new Date().toISOString()
  }));
};
