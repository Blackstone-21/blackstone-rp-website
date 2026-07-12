'use strict';

module.exports = async function handler(req, res) {
  try {
    const host = req.headers?.host || 'localhost';
    const url = new URL(req.url || '/', `https://${host}`);
    req.query = Object.fromEntries(url.searchParams.entries());
    req.query.action = 'discord-login';
    req.body = req.body || {};
    const { handlePortal } = require('./_lib/portal-core.cjs');
    return await handlePortal(req, res, process.env);
  } catch (error) {
    console.error('[Blackstone Discord login]', error);
    if (res.headersSent) return res.end();
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.end(JSON.stringify({
      ok: false,
      message: 'Discord sign-in could not start. Check AUTH_SECRET, Discord OAuth settings, Redis and the Vercel Function logs.',
      errorCode: error?.code || 'DISCORD_LOGIN_FUNCTION_ERROR'
    }));
  }
};
