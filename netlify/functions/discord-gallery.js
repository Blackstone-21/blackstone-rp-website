const { getDiscordGallery } = require('../../server/discord-gallery-core.cjs');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, message: 'Method not allowed.' })
    };
  }

  const result = await getDiscordGallery(process.env);
  return {
    statusCode: result.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': result.cacheable
        ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
        : 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(result.body)
  };
};
