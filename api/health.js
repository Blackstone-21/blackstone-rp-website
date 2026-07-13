'use strict';

function securityHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

module.exports = async function handler(req, res) {
  securityHeaders(res);
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ ok: false, message: 'Method not allowed.' }));
  }

  const token = String(process.env.HEALTH_TOKEN || '');
  const supplied = String(req.headers?.['x-health-token'] || req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const detailed = Boolean(token && supplied && token.length === supplied.length && require('crypto').timingSafeEqual(Buffer.from(token), Buffer.from(supplied)));

  const response = {
    ok: true,
    service: 'Blackstone RP website',
    checkedAt: new Date().toISOString()
  };

  if (detailed) {
    response.redisConfigured = Boolean(
      (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
    );
    response.authConfigured = String(process.env.AUTH_SECRET || process.env.ADMIN_AUTH_SECRET || '').length >= 32;
    response.siteUrlConfigured = Boolean(process.env.PUBLIC_SITE_URL);
    response.discordOAuthConfigured = Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);
  }

  res.statusCode = 200;
  return res.end(JSON.stringify(response));
};
