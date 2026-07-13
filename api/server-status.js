const ENDPOINT = '163.227.178.25:30123';
const JOIN_CODE = '4xlaj5';
const JOIN_URL = 'https://cfx.re/join/4xlaj5';
const CACHE_TTL_MS = 20000;
let statusCache = { expiresAt: 0, body: null };
let inFlight = null;

function clean(value = '') {
  return String(value)
    .replace(/\^[0-9A-Za-z]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

async function getJson(url, timeoutMs = 3200) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BlackstoneRP-Website/4.7'
      },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { payload: await response.json(), responseMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

function normalise(payload, source, responseMs) {
  const data = payload?.Data ?? payload?.data ?? payload;
  if (!data || typeof data !== 'object' || payload?.error) throw new Error('Invalid response');

  const vars = data.vars || {};
  const rawPlayers = Array.isArray(data.players)
    ? data.players
    : Array.isArray(payload.playerList)
      ? payload.playerList
      : [];
  const playerList = rawPlayers
    .map((player) => clean(typeof player === 'string' ? player : player?.name))
    .filter(Boolean)
    .slice(0, 64);

  const players = firstNumber(
    data.clients,
    data.playerCount,
    Array.isArray(payload.players) ? payload.players.length : payload.players,
    playerList.length
  );
  const maxPlayers = firstNumber(
    data.svMaxclients,
    data.svMaxClients,
    data.sv_maxclients,
    data.maxClients,
    data.maxplayers,
    payload.maxPlayers,
    vars.sv_maxClients,
    vars.sv_maxclients
  );
  const name = clean(
    data.hostname
      ?? payload.name
      ?? vars.sv_projectName
      ?? vars.sv_projectDesc
      ?? 'Blackstone RP'
  ) || 'Blackstone RP';

  return {
    online: true,
    name,
    players: Math.max(0, Math.round(players)),
    maxPlayers: Math.max(0, Math.round(maxPlayers)),
    playerList,
    endpoint: ENDPOINT,
    joinUrl: JOIN_URL,
    source,
    responseMs: Math.max(0, Math.round(responseMs)),
    message: 'Live server data received successfully.',
    checkedAt: new Date().toISOString()
  };
}

async function runAttempt(url, source) {
  try {
    const result = await getJson(url);
    return normalise(result.payload, source, result.responseMs);
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'request timed out' : error.message;
    throw new Error(`${source}: ${reason}`);
  }
}

async function checkStatus(proxyName) {
  const primary = [`https://servers-frontend.fivem.net/api/servers/single/${JOIN_CODE}`, 'CFX SERVER LIST'];
  const fallbackAttempts = [
    [`http://${ENDPOINT}/dynamic.json`, 'DIRECT SERVER FEED'],
    [`http://${ENDPOINT}/info.json`, 'DIRECT SERVER INFO']
  ];
  const errors = [];

  try {
    return await runAttempt(...primary);
  } catch (error) {
    errors.push(error.message);
  }

  try {
    return await Promise.any(fallbackAttempts.map((attempt) => runAttempt(...attempt)));
  } catch (aggregate) {
    const reasons = Array.isArray(aggregate?.errors) ? aggregate.errors : [];
    errors.push(...reasons.map((error) => error?.message || String(error)));
  }

  return {
    online: false,
    name: 'Blackstone RP',
    players: 0,
    maxPlayers: 0,
    playerList: [],
    endpoint: ENDPOINT,
    joinUrl: JOIN_URL,
    source: proxyName,
    responseMs: 0,
    message: 'No live response was received. The server may be offline, restarting, or temporarily unavailable.',
    checkedAt: new Date().toISOString()
  };
}

async function getCachedStatus(proxyName) {
  if (statusCache.body && statusCache.expiresAt > Date.now()) return statusCache.body;
  if (inFlight) return inFlight;

  inFlight = checkStatus(proxyName)
    .then((body) => {
      statusCache = { body, expiresAt: Date.now() + CACHE_TTL_MS };
      return body;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=20, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  return res.status(200).json(await getCachedStatus('WEBSITE STATUS PROXY'));
};
