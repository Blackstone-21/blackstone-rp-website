'use strict';

/**
 * Blackstone RP website portal wrapper with automatic Tebex product sync.
 *
 * Ready-to-upload replacement for:
 *   api/portal.js
 *
 * It keeps the existing Blackstone portal/admin backend unchanged and updates
 * the existing Redis shop collection from Tebex before public shop data is
 * returned. The supplied Tebex PUBLIC token is safe to use for Headless API
 * listings. A Vercel environment variable can override either default below.
 */

const MAX_BODY_BYTES = 128 * 1024;

const TEBEX_DEFAULT_PUBLIC_TOKEN =
  '13tef-9c803f542e2b6dcff1d2a9f0ec722aa4116ad76a';
const TEBEX_DEFAULT_STORE_URL =
  'https://blackstone-rp-development.tebex.store';

const DATA_PREFIX = 'bsrp:v2:';
const SHOP_KEY = `${DATA_PREFIX}shop`;
const DEVELOPMENT_SHOP_KEY = `${DATA_PREFIX}development-shop`;
const SETTINGS_KEY = `${DATA_PREFIX}settings`;
const SYNC_META_KEY = `${DATA_PREFIX}development-tebex-sync-meta`;
const SYNC_LOCK_KEY = `${DATA_PREFIX}development-tebex-sync-lock`;

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_INTERVAL_MS = 60 * 1000;
const TEBEX_TIMEOUT_MS = 8000;
const REDIS_TIMEOUT_MS = 5000;
const MAX_SYNCED_PRODUCTS = 250;
const IMAGE_SYNC_SCHEMA_VERSION = 2;

let localNextSyncAt = 0;
let activeSyncPromise = null;

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
    throw requestError(
      413,
      'Request body is too large.',
      'BODY_TOO_LARGE'
    );
  }

  const contentType = String(
    req.headers?.['content-type'] || ''
  ).toLowerCase();

  if (contentType && !contentType.includes('application/json')) {
    throw requestError(
      415,
      'Only application/json requests are accepted.',
      'UNSUPPORTED_MEDIA_TYPE'
    );
  }

  if (req.body !== undefined && req.body !== null) {
    const encoded =
      typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);

    if (Buffer.byteLength(encoded || '', 'utf8') > MAX_BODY_BYTES) {
      throw requestError(
        413,
        'Request body is too large.',
        'BODY_TOO_LARGE'
      );
    }

    return;
  }

  const chunks = [];
  let received = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    received += buffer.length;

    if (received > MAX_BODY_BYTES) {
      throw requestError(
        413,
        'Request body is too large.',
        'BODY_TOO_LARGE'
      );
    }

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
    throw requestError(
      400,
      'The request body must be valid JSON.',
      'INVALID_JSON'
    );
  }
}

function sendError(res, error) {
  const status = Number(error?.status || 0) || 500;

  if (status >= 500) {
    console.error('[Blackstone portal function]', error);
  }

  if (res.headersSent) return res.end();

  res.statusCode = status;
  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  return res.end(
    JSON.stringify({
      ok: false,
      message:
        status >= 500
          ? 'The website service encountered an unexpected error.'
          : error.message,
      errorCode:
        error?.code ||
        (status >= 500
          ? 'PORTAL_FUNCTION_ERROR'
          : 'REQUEST_ERROR')
    })
  );
}

function isFalse(value) {
  return /^(0|false|off|no)$/i.test(String(value || '').trim());
}

function cleanText(value, maxLength = 1000) {
  const text = String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      const numeric = Number(code);
      return Number.isFinite(numeric)
        ? String.fromCodePoint(numeric)
        : ' ';
    })
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;

  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function safeHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function normaliseStoreUrl(value) {
  const safe =
    safeHttpsUrl(value) || TEBEX_DEFAULT_STORE_URL;

  return safe.replace(/\/+$/, '');
}

function optionalStoreUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const safe = safeHttpsUrl(text);
  return safe ? safe.replace(/\/+$/, '') : '';
}

function isDevelopmentStoreUrl(
  value,
  developmentStoreUrl = TEBEX_DEFAULT_STORE_URL
) {
  const candidate = optionalStoreUrl(value);
  if (!candidate) return false;

  const development = normaliseStoreUrl(developmentStoreUrl);

  try {
    const candidateUrl = new URL(candidate);
    const developmentUrl = new URL(development);

    return (
      candidateUrl.hostname.toLowerCase() ===
      developmentUrl.hostname.toLowerCase()
    );
  } catch {
    return candidate.toLowerCase() === development.toLowerCase();
  }
}

function isDevelopmentShopItem(item, developmentStoreUrl) {
  if (!item || typeof item !== 'object') return false;

  const id = String(item.id || '').toLowerCase();
  const source = String(item.source || '').toLowerCase();

  if (source === 'tebex' || id.startsWith('tebex-')) {
    return true;
  }

  return isDevelopmentStoreUrl(
    item.purchaseUrl,
    developmentStoreUrl
  );
}

function filterRoleplayShopItems(items, developmentStoreUrl) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => !isDevelopmentShopItem(item, developmentStoreUrl)
  );
}

function sanitizeRoleplayPublicPayload(payload, developmentStoreUrl) {
  const safePayload =
    payload && typeof payload === 'object'
      ? { ...payload }
      : {};

  safePayload.shop = filterRoleplayShopItems(
    safePayload.shop,
    developmentStoreUrl
  );

  const settings =
    safePayload.settings &&
    typeof safePayload.settings === 'object'
      ? { ...safePayload.settings }
      : {};

  if (
    isDevelopmentStoreUrl(
      settings.tebexStoreUrl,
      developmentStoreUrl
    )
  ) {
    settings.tebexStoreUrl = '';
    settings.tebexEnabled = false;
  }

  safePayload.settings = settings;
  return safePayload;
}

function parseStoredJson(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function redisConfiguration(env) {
  const url =
    env.KV_REST_API_URL ||
    env.UPSTASH_REDIS_REST_URL ||
    '';

  const token =
    env.KV_REST_API_TOKEN ||
    env.UPSTASH_REDIS_REST_TOKEN ||
    '';

  if (!url || !token) return null;

  return {
    url: String(url).replace(/\/+$/, ''),
    token: String(token)
  };
}

async function redisCommand(env, command) {
  const config = redisConfiguration(env);

  if (!config) {
    throw new Error(
      'The existing Upstash Redis connection is not configured.'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REDIS_TIMEOUT_MS
  );

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.error) {
      throw new Error(
        cleanText(
          payload?.error ||
            `Redis returned HTTP ${response.status}.`,
          200
        )
      );
    }

    return payload?.result;
  } finally {
    clearTimeout(timeout);
  }
}

function extractCategories(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.categories)) {
    return payload.categories;
  }
  if (Array.isArray(payload?.data?.categories)) {
    return payload.data.categories;
  }
  return [];
}

function extractPackages(category) {
  const candidates = [
    category?.packages,
    category?.items,
    category?.products,
    category?.package
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (Array.isArray(candidate?.data)) {
      return candidate.data;
    }
  }

  return [];
}

function extractChildren(category) {
  const candidates = [
    category?.children,
    category?.subcategories,
    category?.categories
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (Array.isArray(candidate?.data)) {
      return candidate.data;
    }
  }

  return [];
}

function numericPrice(packageData) {
  const candidates = [
    packageData?.total_price,
    packageData?.price,
    packageData?.base_price,
    packageData?.effective_price,
    packageData?.sale_price
  ];

  for (const candidate of candidates) {
    const value =
      typeof candidate === 'object'
        ? candidate?.amount ?? candidate?.value
        : candidate;

    const number = Number(value);

    if (Number.isFinite(number) && number >= 0) {
      return number;
    }
  }

  return null;
}

function currencyCode(packageData, fallback = 'AUD') {
  const candidates = [
    packageData?.currency,
    packageData?.currency_code,
    packageData?.price_currency,
    packageData?.price?.currency,
    fallback
  ];

  for (const candidate of candidates) {
    const value = cleanText(candidate, 3).toUpperCase();
    if (/^[A-Z]{3}$/.test(value)) return value;
  }

  return 'AUD';
}

function formatPrice(packageData, fallbackCurrency) {
  const amount = numericPrice(packageData);

  if (amount === null) return 'View Details';

  const currency = currencyCode(
    packageData,
    fallbackCurrency
  );

  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function mediaUrl(value) {
  if (typeof value !== 'string') return '';

  const text = value.trim();
  if (!text) return '';

  if (text.startsWith('//')) {
    return safeHttpsUrl(`https:${text}`);
  }

  return safeHttpsUrl(text);
}

function mediaItemLooksLikeVideo(item) {
  if (!item || typeof item !== 'object') return false;

  const type = cleanText(
    item.type ??
      item.media_type ??
      item.mediaType ??
      item.kind ??
      item.mime_type ??
      item.mimeType ??
      item.content_type ??
      item.contentType,
    80
  ).toLowerCase();

  return /video|youtube|vimeo/.test(type);
}

function collectMediaUrls(value, output, depth = 0) {
  if (depth > 4 || value === undefined || value === null) {
    return;
  }

  if (typeof value === 'string') {
    const safe = mediaUrl(value);
    if (safe) output.push(safe);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (mediaItemLooksLikeVideo(item)) continue;
      collectMediaUrls(item, output, depth + 1);
    }
    return;
  }

  if (typeof value !== 'object' || mediaItemLooksLikeVideo(value)) {
    return;
  }

  const preferredKeys = [
    'url',
    'src',
    'image',
    'image_url',
    'imageUrl',
    'original',
    'original_url',
    'originalUrl',
    'full',
    'full_url',
    'fullUrl',
    'large',
    'large_url',
    'largeUrl',
    'medium',
    'medium_url',
    'mediumUrl',
    'thumbnail',
    'thumbnail_url',
    'thumbnailUrl',
    'cdn_url',
    'cdnUrl',
    'resource',
    'file',
    'path'
  ];

  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    collectMediaUrls(value[key], output, depth + 1);
  }

  const nestedKeys = [
    'media',
    'images',
    'gallery',
    'screenshots',
    'assets',
    'sizes',
    'variants'
  ];

  for (const key of nestedKeys) {
    if (!(key in value)) continue;
    collectMediaUrls(value[key], output, depth + 1);
  }
}

function packageMediaUrls(packageData) {
  const collected = [];

  collectMediaUrls(
    [
      packageData?.image,
      packageData?.image_url,
      packageData?.imageUrl,
      packageData?.thumbnail,
      packageData?.thumbnail_url,
      packageData?.thumbnailUrl,
      packageData?.media,
      packageData?.images,
      packageData?.gallery,
      packageData?.screenshots
    ],
    collected
  );

  return [...new Set(collected)].slice(0, 20);
}

function packageImage(packageData) {
  return packageMediaUrls(packageData)[0] || '';
}

function packageIdentifier(packageData) {
  const candidate =
    packageData?.id ??
    packageData?.package_id ??
    packageData?.packageId ??
    packageData?.slug;

  return cleanText(candidate, 100);
}

function packagePurchaseUrl(packageData, storeUrl) {
  const candidates = [
    packageData?.url,
    packageData?.link,
    packageData?.purchase_url,
    packageData?.purchaseUrl,
    packageData?.links?.package,
    packageData?.links?.webstore
  ];

  for (const candidate of candidates) {
    const safe = safeHttpsUrl(candidate);
    if (safe) return safe;
  }

  const identifier = packageIdentifier(packageData);

  return identifier
    ? `${storeUrl}/package/${encodeURIComponent(identifier)}`
    : storeUrl;
}

function packageSoldOut(packageData) {
  if (packageData?.disabled === true) return true;
  if (packageData?.enabled === false) return true;
  if (packageData?.available === false) return true;
  if (packageData?.in_stock === false) return true;

  if (
    packageData?.stock !== undefined &&
    Number(packageData.stock) === 0
  ) {
    return true;
  }

  const expiration =
    packageData?.expiration_date ??
    packageData?.expires_at;

  if (expiration) {
    const timestamp = Date.parse(expiration);
    if (Number.isFinite(timestamp) && timestamp <= Date.now()) {
      return true;
    }
  }

  return false;
}

function normaliseTebexProducts(payload, storeUrl) {
  const categories = extractCategories(payload);
  const fallbackCurrency = currencyCode(
    payload?.meta ||
      payload?.store ||
      payload?.data?.store ||
      {},
    'AUD'
  );

  const products = [];
  const now = new Date().toISOString();

  function visitCategory(category, inheritedName = '') {
    if (
      !category ||
      typeof category !== 'object' ||
      products.length >= MAX_SYNCED_PRODUCTS
    ) {
      return;
    }

    const categoryName =
      cleanText(
        category.name ??
          category.title ??
          category.display_name,
        80
      ) ||
      inheritedName ||
      'BLACKSTONE DEVELOPMENT';

    for (const packageData of extractPackages(category)) {
      if (
        !packageData ||
        typeof packageData !== 'object' ||
        products.length >= MAX_SYNCED_PRODUCTS
      ) {
        continue;
      }

      if (
        packageData.hidden === true ||
        packageData.published === false
      ) {
        continue;
      }

      const title = cleanText(
        packageData.name ?? packageData.title,
        120
      );

      if (!title) continue;

      const identifier =
        packageIdentifier(packageData) ||
        `${categoryName}-${title}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

      products.push({
        id: `tebex-${identifier}`,
        title,
        category: categoryName.toUpperCase(),
        priceLabel: formatPrice(
          packageData,
          fallbackCurrency
        ),
        buttonLabel: packageSoldOut(packageData)
          ? 'Sold Out'
          : 'View Package',
        description:
          cleanText(
            packageData.description ??
              packageData.short_description ??
              packageData.shortDescription ??
              packageData.summary,
            1000
          ) ||
          'View this package on the official Blackstone Development Tebex store.',
        imageUrl: packageImage(packageData),
        mediaUrls: packageMediaUrls(packageData),
        purchaseUrl: packagePurchaseUrl(
          packageData,
          storeUrl
        ),
        sortOrder: products.length,
        featured:
          packageData.featured === true ||
          packageData.popular === true,
        soldOut: packageSoldOut(packageData),
        published: true,
        source: 'tebex',
        tebexPackageId: identifier,
        createdAt: now,
        updatedAt: now
      });
    }

    for (const child of extractChildren(category)) {
      visitCategory(child, categoryName);
    }
  }

  for (const category of categories) {
    visitCategory(category);
  }

  return products;
}

function mergeWithExistingShop(existingShop, syncedProducts) {
  const existing = Array.isArray(existingShop)
    ? existingShop
    : [];

  const previousById = new Map(
    existing.map((item) => [String(item?.id || ''), item])
  );

  const syncedTitles = new Set(
    syncedProducts.map((item) =>
      String(item.title || '').trim().toLowerCase()
    )
  );

  const syncedUrls = new Set(
    syncedProducts.map((item) =>
      String(item.purchaseUrl || '').trim().toLowerCase()
    )
  );

  const updatedSynced = syncedProducts.map((item, index) => {
    const previous = previousById.get(String(item.id));

    return {
      ...item,
      sortOrder: index,
      createdAt:
        previous?.createdAt || item.createdAt
    };
  });

  const manualProducts = existing.filter((item) => {
    const id = String(item?.id || '');
    const source = String(item?.source || '').toLowerCase();
    const title = String(item?.title || '')
      .trim()
      .toLowerCase();
    const purchaseUrl = String(item?.purchaseUrl || '')
      .trim()
      .toLowerCase();

    if (source === 'tebex' || id.startsWith('tebex-')) {
      return false;
    }

    if (title && syncedTitles.has(title)) return false;
    if (purchaseUrl && syncedUrls.has(purchaseUrl)) {
      return false;
    }

    return true;
  });

  return [
    ...updatedSynced,
    ...manualProducts.map((item, index) => ({
      ...item,
      sortOrder: updatedSynced.length + index
    }))
  ];
}

async function fetchTebexListings(token) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TEBEX_TIMEOUT_MS
  );

  const endpoint =
    `https://headless.tebex.io/api/accounts/` +
    `${encodeURIComponent(token)}/categories` +
    '?includePackages=1';

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BlackstoneRP-Website/4.9'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(
        cleanText(
          payload?.message ||
            payload?.error ||
            payload?.detail ||
            `Tebex returned HTTP ${response.status}.`,
          200
        )
      );
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}


async function separateRoleplayShop(env, developmentStoreUrl) {
  if (!redisConfiguration(env)) {
    return {
      shopChanged: false,
      settingsChanged: false
    };
  }

  const developmentUrl = normaliseStoreUrl(
    developmentStoreUrl || TEBEX_DEFAULT_STORE_URL
  );

  const roleplayShop = parseStoredJson(
    await redisCommand(env, ['GET', SHOP_KEY]),
    []
  );

  const cleanedRoleplayShop = filterRoleplayShopItems(
    roleplayShop,
    developmentUrl
  );

  const shopChanged =
    Array.isArray(roleplayShop) &&
    cleanedRoleplayShop.length !== roleplayShop.length;

  if (shopChanged) {
    await redisCommand(env, [
      'SET',
      SHOP_KEY,
      JSON.stringify(cleanedRoleplayShop)
    ]);
  }

  const settings = parseStoredJson(
    await redisCommand(env, ['GET', SETTINGS_KEY]),
    {}
  );

  const settingsChanged =
    settings &&
    typeof settings === 'object' &&
    isDevelopmentStoreUrl(
      settings.tebexStoreUrl,
      developmentUrl
    );

  if (settingsChanged) {
    await redisCommand(env, [
      'SET',
      SETTINGS_KEY,
      JSON.stringify({
        ...settings,
        tebexStoreUrl: '',
        tebexEnabled: false,
        updatedAt: new Date().toISOString()
      })
    ]);
  }

  return {
    shopChanged,
    settingsChanged
  };
}

async function performTebexSync(env) {
  const now = Date.now();
  const token = cleanText(
    env.TEBEX_PUBLIC_TOKEN ||
      TEBEX_DEFAULT_PUBLIC_TOKEN,
    180
  );

  const storeUrl = normaliseStoreUrl(
    env.TEBEX_STORE_URL ||
      TEBEX_DEFAULT_STORE_URL
  );

  if (!token || !redisConfiguration(env)) {
    localNextSyncAt = now + RETRY_INTERVAL_MS;
    return;
  }

  await separateRoleplayShop(env, storeUrl);

  const storedMeta = parseStoredJson(
    await redisCommand(env, ['GET', SYNC_META_KEY]),
    {}
  );

  const lastSyncedAt = Date.parse(
    storedMeta?.lastSyncedAt || ''
  );

  if (
    Number(storedMeta?.schemaVersion) ===
      IMAGE_SYNC_SCHEMA_VERSION &&
    Number.isFinite(lastSyncedAt) &&
    now - lastSyncedAt < SYNC_INTERVAL_MS
  ) {
    localNextSyncAt =
      lastSyncedAt + SYNC_INTERVAL_MS;
    return;
  }

  const lockResult = await redisCommand(env, [
    'SET',
    SYNC_LOCK_KEY,
    String(now),
    'NX',
    'EX',
    '45'
  ]);

  if (!lockResult) {
    localNextSyncAt = now + 15000;
    return;
  }

  try {
    const payload = await fetchTebexListings(token);
    const syncedProducts = normaliseTebexProducts(
      payload,
      storeUrl
    );

    const allowEmpty = !isFalse(
      env.TEBEX_SYNC_ALLOW_EMPTY
    );

    if (
      syncedProducts.length === 0 &&
      env.TEBEX_SYNC_ALLOW_EMPTY === undefined
    ) {
      // Safe default while a new Tebex store is being reviewed:
      // retain existing products instead of replacing them with an empty list.
      await redisCommand(env, [
        'SET',
        SYNC_META_KEY,
        JSON.stringify({
          status: 'waiting',
          schemaVersion: IMAGE_SYNC_SCHEMA_VERSION,
          productCount: 0,
          checkedAt: new Date().toISOString(),
          message:
            'Tebex returned no public packages. Existing website products were retained.'
        })
      ]);

      localNextSyncAt = now + RETRY_INTERVAL_MS;
      return;
    }

    if (syncedProducts.length === 0 && !allowEmpty) {
      localNextSyncAt = now + RETRY_INTERVAL_MS;
      return;
    }

    const existingShop = parseStoredJson(
      await redisCommand(env, ['GET', DEVELOPMENT_SHOP_KEY]),
      []
    );

    const mergedShop = mergeWithExistingShop(
      existingShop,
      syncedProducts
    );

    const syncedAt = new Date().toISOString();

    await redisCommand(env, [
      'SET',
      DEVELOPMENT_SHOP_KEY,
      JSON.stringify(mergedShop)
    ]);

    await redisCommand(env, [
      'SET',
      SYNC_META_KEY,
      JSON.stringify({
        status: 'ok',
        schemaVersion: IMAGE_SYNC_SCHEMA_VERSION,
        productCount: syncedProducts.length,
        totalWebsiteItems: mergedShop.length,
        lastSyncedAt: syncedAt,
        storeUrl
      })
    ]);

    localNextSyncAt = now + SYNC_INTERVAL_MS;
  } finally {
    await redisCommand(env, ['DEL', SYNC_LOCK_KEY]).catch(
      () => {}
    );
  }
}

async function maybeSyncTebex(req, env) {
  const method = String(req.method || 'GET').toUpperCase();
  const action = String(req.query?.action || 'public');

  if (
    method !== 'GET' ||
    action !== 'development-shop' ||
    isFalse(env.TEBEX_SYNC_ENABLED)
  ) {
    return;
  }

  if (Date.now() < localNextSyncAt) return;

  if (!activeSyncPromise) {
    activeSyncPromise = performTebexSync(env)
      .catch((error) => {
        localNextSyncAt =
          Date.now() + RETRY_INTERVAL_MS;

        console.warn(
          '[Blackstone Tebex sync]',
          cleanText(
            error?.name === 'AbortError'
              ? 'The Tebex request timed out.'
              : error?.message ||
                  'Tebex listings are temporarily unavailable.',
            250
          )
        );
      })
      .finally(() => {
        activeSyncPromise = null;
      });
  }

  await activeSyncPromise;
}



function createBufferedResponse() {
  const headers = new Map();
  const chunks = [];

  const response = {
    statusCode: 200,
    headersSent: false,

    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), {
        name: String(name),
        value
      });
    },

    getHeader(name) {
      return headers.get(String(name).toLowerCase())?.value;
    },

    removeHeader(name) {
      headers.delete(String(name).toLowerCase());
    },

    writeHead(statusCode, outgoingHeaders = {}) {
      this.statusCode = Number(statusCode) || 200;

      for (const [name, value] of Object.entries(
        outgoingHeaders || {}
      )) {
        this.setHeader(name, value);
      }

      return this;
    },

    write(chunk) {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(String(chunk))
        );
      }

      return true;
    },

    end(chunk) {
      if (chunk !== undefined && chunk !== null) {
        this.write(chunk);
      }

      this.headersSent = true;
      return this;
    }
  };

  return {
    response,
    headers,
    body() {
      return Buffer.concat(chunks).toString('utf8');
    }
  };
}

function copyBufferedHeaders(buffered, res) {
  for (const { name, value } of buffered.headers.values()) {
    const lower = name.toLowerCase();

    if (
      lower === 'content-length' ||
      lower === 'cache-control'
    ) {
      continue;
    }

    res.setHeader(name, value);
  }
}

async function handleRoleplayPublic(
  req,
  res,
  env,
  handlePortal
) {
  const developmentStoreUrl = normaliseStoreUrl(
    env.TEBEX_STORE_URL || TEBEX_DEFAULT_STORE_URL
  );

  try {
    await separateRoleplayShop(env, developmentStoreUrl);
  } catch (error) {
    console.warn(
      '[Blackstone RP shop separation]',
      cleanText(
        error?.message ||
          'Could not clean previously synced Development products.',
        240
      )
    );
  }

  const buffered = createBufferedResponse();
  await handlePortal(req, buffered.response, env);

  const rawBody = buffered.body();
  let outputBody = rawBody;

  if (buffered.response.statusCode >= 200 &&
      buffered.response.statusCode < 300) {
    try {
      const payload = rawBody ? JSON.parse(rawBody) : {};
      outputBody = JSON.stringify(
        sanitizeRoleplayPublicPayload(
          payload,
          developmentStoreUrl
        )
      );
    } catch {
      outputBody = rawBody;
    }
  }

  res.statusCode = buffered.response.statusCode;
  copyBufferedHeaders(buffered, res);
  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );
  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0, must-revalidate'
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  return res.end(outputBody);
}

async function handleDevelopmentShop(req, res, env) {
  await maybeSyncTebex(req, env);

  let shop = [];
  let sync = {};

  try {
    shop = parseStoredJson(
      await redisCommand(env, ['GET', DEVELOPMENT_SHOP_KEY]),
      []
    );

    sync = parseStoredJson(
      await redisCommand(env, ['GET', SYNC_META_KEY]),
      {}
    );
  } catch (error) {
    console.warn(
      '[Blackstone Development shop]',
      cleanText(error?.message || 'Development shop cache unavailable.', 220)
    );
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');

  return res.end(
    JSON.stringify({
      ok: true,
      shop: Array.isArray(shop) ? shop : [],
      settings: {
        tebexEnabled: true,
        tebexStoreUrl: normaliseStoreUrl(
          env.TEBEX_STORE_URL || TEBEX_DEFAULT_STORE_URL
        )
      },
      sync
    })
  );
}

module.exports = async function handler(req, res) {
  try {
    req.query = parseQuery(req);
    await parseBody(req);

    const method = String(
      req.method || 'GET'
    ).toUpperCase();
    const action = String(req.query?.action || 'public');

    if (
      method === 'GET' &&
      action === 'development-shop'
    ) {
      return await handleDevelopmentShop(
        req,
        res,
        process.env
      );
    }

    const { handlePortal } = require(
      './_lib/portal-core.cjs'
    );

    if (method === 'GET' && action === 'public') {
      return await handleRoleplayPublic(
        req,
        res,
        process.env,
        handlePortal
      );
    }

    return await handlePortal(req, res, process.env);
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports._test = {
  cleanText,
  normaliseTebexProducts,
  mergeWithExistingShop,
  normaliseStoreUrl,
  optionalStoreUrl,
  isDevelopmentStoreUrl,
  isDevelopmentShopItem,
  filterRoleplayShopItems,
  sanitizeRoleplayPublicPayload,
  packageMediaUrls,
  packageImage,
  packagePurchaseUrl,
  formatPrice
};
