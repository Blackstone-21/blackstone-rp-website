'use strict';

function parseQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const host = req.headers?.host || 'localhost';
    const url = new URL(req.url || '/', `https://${host}`);
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

async function parseBody(req) {
  if (req.body !== undefined && req.body !== null) return;
  const method = String(req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    req.body = {};
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    req.body = {};
    return;
  }
  try {
    req.body = JSON.parse(raw);
  } catch {
    req.body = raw;
  }
}

module.exports = async function handler(req, res) {
  try {
    req.query = parseQuery(req);
    await parseBody(req);
    const { handlePortal } = require('./_lib/portal-core.cjs');
    return await handlePortal(req, res, process.env);
  } catch (error) {
    console.error('[Blackstone portal function]', error);
    if (res.headersSent) return res.end();
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.end(JSON.stringify({
      ok: false,
      message: 'The website login service could not start. Check the Vercel Function logs and environment variables.',
      errorCode: error?.code || 'PORTAL_FUNCTION_ERROR'
    }));
  }
};
