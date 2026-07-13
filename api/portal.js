'use strict';

const MAX_BODY_BYTES = 128 * 1024;

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

function requestError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function parseBody(req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    req.body = {};
    return;
  }

  const declaredLength = Number(req.headers?.['content-length'] || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw requestError(413, 'Request body is too large.', 'BODY_TOO_LARGE');
  }

  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    throw requestError(415, 'Only application/json requests are accepted.', 'UNSUPPORTED_MEDIA_TYPE');
  }

  if (req.body !== undefined && req.body !== null) {
    const encoded = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(encoded || '', 'utf8') > MAX_BODY_BYTES) {
      throw requestError(413, 'Request body is too large.', 'BODY_TOO_LARGE');
    }
    return;
  }

  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > MAX_BODY_BYTES) throw requestError(413, 'Request body is too large.', 'BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    req.body = {};
    return;
  }
  try {
    req.body = JSON.parse(raw);
  } catch {
    throw requestError(400, 'The request body must be valid JSON.', 'INVALID_JSON');
  }
}

function sendError(res, error) {
  const status = Number(error?.status || 0) || 500;
  if (status >= 500) console.error('[Blackstone portal function]', error);
  if (res.headersSent) return res.end();
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify({
    ok: false,
    message: status >= 500 ? 'The website service encountered an unexpected error.' : error.message,
    errorCode: error?.code || (status >= 500 ? 'PORTAL_FUNCTION_ERROR' : 'REQUEST_ERROR')
  }));
}

module.exports = async function handler(req, res) {
  try {
    req.query = parseQuery(req);
    await parseBody(req);
    const { handlePortal } = require('./_lib/portal-core.cjs');
    return await handlePortal(req, res, process.env);
  } catch (error) {
    return sendError(res, error);
  }
};
