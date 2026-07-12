const { getDiscordGallery } = require('../server/discord-gallery-core.cjs');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'Method not allowed.' });

  const result = await getDiscordGallery(process.env);
  res.setHeader(
    'Cache-Control',
    result.cacheable
      ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
      : 'no-store, max-age=0'
  );
  return res.status(result.status).json(result.body);
};
