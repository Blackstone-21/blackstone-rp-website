'use strict';

module.exports = async function handler(req, res) {
  try {
    const host = req.headers?.host || 'localhost';
    const url = new URL(req.url || '/', `https://${host}`);
    req.query = Object.fromEntries(url.searchParams.entries());
    req.query.action = 'discord-callback';
    req.body = req.body || {};
    const { handlePortal } = require('./_lib/portal-core.cjs');
    return await handlePortal(req, res, process.env);
  } catch (error) {
    console.error('[Blackstone Discord callback]', error);
    if (res.headersSent) return res.end();
    const origin = process.env.PUBLIC_SITE_URL || `https://${req.headers?.['x-forwarded-host'] || req.headers?.host || ''}`;
    if (/^https:\/\//i.test(origin)) {
      res.statusCode = 302;
      res.setHeader('Location', `${origin.replace(/\/$/, '')}/login.html?loginError=${encodeURIComponent('Discord sign-in failed. Check the Vercel Function logs and OAuth redirect settings.')}`);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.end('');
    }
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, message: 'Discord sign-in callback failed.' }));
  }
};
