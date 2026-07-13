const crypto = require('crypto');

const PREFIX = 'bsrp:v2:';
const ACCESS_COOKIE = 'bsrp_access';
const REFRESH_COOKIE = 'bsrp_refresh';
const OAUTH_STATE_COOKIE = 'bsrp_oauth_state';
const ACCESS_TTL = 15 * 60;
const REFRESH_TTL = 7 * 24 * 60 * 60;
const OAUTH_STATE_TTL = 10 * 60;
const MAX_BODY_BYTES = 128 * 1024;
const MAX_PASSWORD_LENGTH = 256;
const REDIS_TIMEOUT_MS = 6000;
const DISCORD_TIMEOUT_MS = 8000;
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_CACHE_TTL_MS = 10 * 1000;
const ALL_PERMISSIONS = [
  'dashboard.view',
  'announcements.manage',
  'members.manage',
  'users.manage',
  'roles.manage',
  'departments.manage',
  'events.manage',
  'applications.manage',
  'shop.manage',
  'images.manage',
  'audit.view',
  'discord.sync',
  'settings.manage'
];

const ENTITY_PERMISSIONS = {
  announcements: 'announcements.manage',
  members: 'members.manage',
  users: 'users.manage',
  roles: 'roles.manage',
  departments: 'departments.manage',
  events: 'events.manage',
  applications: 'applications.manage',
  shop: 'shop.manage',
  images: 'images.manage',
  settings: 'settings.manage'
};

const PUBLIC_ENTITIES = new Set(['announcements', 'departments', 'events', 'shop', 'images']);
const ADMIN_ENTITIES = new Set(Object.keys(ENTITY_PERMISSIONS));
let seedCache = { expiresAt: 0, promise: null };
let publicPayloadCache = { expiresAt: 0, value: null, promise: null };

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

function cleanText(value, max = 4000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
    .trim()
    .slice(0, max);
}

function httpError(status, message, code = 'REQUEST_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function badRequest(message, code = 'INVALID_INPUT') {
  return httpError(400, message, code);
}

function safeUrl(value, options = {}) {
  const text = cleanText(value, options.max || 2000);
  if (!text) return '';
  let url;
  try {
    url = new URL(text);
  } catch {
    throw badRequest(options.message || 'A valid URL is required.');
  }
  const allowedProtocols = options.protocols || ['https:'];
  if (!allowedProtocols.includes(url.protocol) || url.username || url.password) {
    throw badRequest(options.message || 'Only secure HTTPS URLs are allowed.');
  }
  if (options.hosts && !options.hosts.includes(url.hostname.toLowerCase())) {
    throw badRequest(options.message || 'This URL host is not allowed.');
  }
  return url.href;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function invalidatePublicCache() {
  publicPayloadCache.expiresAt = 0;
  publicPayloadCache.value = null;
}

function cleanEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}



const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DEFAULT_ANNOUNCEMENTS_CHANNEL_ID = '1520408782520193115';
let discordAnnouncementsCache = { channelId: '', expiresAt: 0, items: [] };

function discordAnnouncementsChannelId(env) {
  const value = cleanText(env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID || DEFAULT_ANNOUNCEMENTS_CHANNEL_ID, 30);
  return /^\d{15,22}$/.test(value) ? value : '';
}

function discordAnnouncementsConfigured(env) {
  return Boolean(cleanText(env.DISCORD_BOT_TOKEN, 4000) && discordAnnouncementsChannelId(env));
}

function discordAnnouncementLimit(env) {
  const number = Number(env.DISCORD_ANNOUNCEMENTS_LIMIT || 50);
  return Number.isFinite(number) ? Math.max(1, Math.min(100, Math.round(number))) : 50;
}

function discordAnnouncementUrl(env, channelId, messageId) {
  const guildId = cleanText(env.DISCORD_GUILD_ID, 30);
  if (!guildId || !channelId || !messageId) return '';
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function discordErrorMessage(status, payload = {}) {
  const detail = cleanText(payload.message || '', 240);
  if (status === 401) return 'Discord rejected the bot token. Reset DISCORD_BOT_TOKEN in Vercel.';
  if (status === 403) return 'The Discord bot needs View Channel, Read Message History, Send Messages and Embed Links permissions in the announcements channel.';
  if (status === 404) return 'Discord could not find the announcements channel or message. Check DISCORD_ANNOUNCEMENTS_CHANNEL_ID and the bot channel permissions.';
  if (status === 429) return 'Discord rate-limited the announcements connection. Try again shortly.';
  return detail || `Discord announcements request failed (${status}).`;
}

async function discordAnnouncementRequest(env, path, options = {}) {
  const token = cleanText(env.DISCORD_BOT_TOKEN, 4000);
  if (!token) {
    const error = new Error('DISCORD_BOT_TOKEN is not configured.');
    error.code = 'DISCORD_ANNOUNCEMENTS_NOT_CONFIGURED';
    throw error;
  }
  const response = await fetchWithTimeout(`${DISCORD_API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bot ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  }, DISCORD_TIMEOUT_MS);
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(discordErrorMessage(response.status, payload));
    error.code = 'DISCORD_ANNOUNCEMENTS_ERROR';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function stripDiscordHeading(value) {
  return cleanText(value, 300)
    .replace(/^#{1,3}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^__(.+)__$/, '$1')
    .trim();
}

function discordMessageToAnnouncement(env, message) {
  if (!message || !message.id || !message.channel_id) return null;
  if (![0, 19].includes(Number(message.type || 0))) return null;
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  const embed = embeds.find((entry) => entry && (entry.title || entry.description)) || {};
  const content = cleanText(message.content, 5000);
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = cleanText(embed.title || stripDiscordHeading(lines[0]) || `Announcement from ${message.author?.global_name || message.author?.username || 'Blackstone RP'}`, 160);
  let body = cleanText(embed.description || (lines.length > 1 ? lines.slice(1).join('\n') : content), 5000);
  if (!body && title) body = title;
  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const categoryField = fields.find((field) => /category/i.test(String(field?.name || '')));
  const category = cleanText(categoryField?.value || 'Discord', 80);
  const attachment = (Array.isArray(message.attachments) ? message.attachments : []).find((item) => String(item?.content_type || '').startsWith('image/'));
  const imageUrl = cleanText(embed.image?.url || attachment?.url || '', 2000);
  if (!title && !body && !imageUrl) return null;
  const createdAt = cleanText(message.timestamp || nowIso(), 80);
  const updatedAt = cleanText(message.edited_timestamp || message.timestamp || nowIso(), 80);
  return {
    id: `discord_${message.id}`,
    title: title || 'Blackstone RP announcement',
    body,
    category,
    pinned: Boolean(message.pinned),
    published: true,
    source: 'discord',
    discordMessageId: cleanText(message.id, 30),
    discordChannelId: cleanText(message.channel_id, 30),
    discordUrl: discordAnnouncementUrl(env, message.channel_id, message.id),
    authorName: cleanText(message.author?.global_name || message.author?.username || 'Blackstone RP', 120),
    imageUrl,
    createdAt,
    updatedAt
  };
}

async function getDiscordAnnouncements(env, options = {}) {
  const channelId = discordAnnouncementsChannelId(env);
  if (!discordAnnouncementsConfigured(env)) {
    const error = new Error('Discord announcements are not configured.');
    error.code = 'DISCORD_ANNOUNCEMENTS_NOT_CONFIGURED';
    throw error;
  }
  const now = Date.now();
  const cacheSeconds = Math.max(10, Math.min(300, Number(env.DISCORD_ANNOUNCEMENTS_CACHE_SECONDS || 45)));
  if (!options.force && discordAnnouncementsCache.channelId === channelId && discordAnnouncementsCache.expiresAt > now) {
    return discordAnnouncementsCache.items;
  }
  const limit = discordAnnouncementLimit(env);
  const messages = await discordAnnouncementRequest(env, `/channels/${channelId}/messages?limit=${limit}`);
  const items = (Array.isArray(messages) ? messages : [])
    .map((message) => discordMessageToAnnouncement(env, message))
    .filter(Boolean)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt)));
  discordAnnouncementsCache = { channelId, expiresAt: now + cacheSeconds * 1000, items };
  return items;
}

function discordAnnouncementPayload(item) {
  const category = cleanText(item.category || 'Community', 80);
  const title = cleanText(item.title || 'Blackstone RP announcement', 256);
  const body = cleanText(item.body || '', 4096);
  return {
    embeds: [{
      title,
      description: body || ' ',
      color: 0xB8BEC7,
      fields: [{ name: 'Category', value: category || 'Community', inline: true }],
      timestamp: nowIso(),
      footer: { text: `Blackstone RP Website • ${cleanText(item.id || 'announcement', 80)}` }
    }],
    allowed_mentions: { parse: [] }
  };
}

async function syncAnnouncementToDiscord(env, item, existing = null) {
  const channelId = discordAnnouncementsChannelId(env);
  if (!discordAnnouncementsConfigured(env)) {
    return { item, warning: 'Announcement saved on the website, but Discord announcements are not configured.' };
  }
  const existingMessageId = cleanText(existing?.discordMessageId || item.discordMessageId, 30);
  if (!item.published) {
    if (existingMessageId) {
      await discordAnnouncementRequest(env, `/channels/${channelId}/messages/${existingMessageId}`, { method: 'DELETE' });
    }
    discordAnnouncementsCache.expiresAt = 0;
    return {
      item: {
        ...item,
        discordMessageId: '',
        discordChannelId: channelId,
        discordUrl: '',
        discordSyncedAt: nowIso()
      }
    };
  }

  const payload = discordAnnouncementPayload(item);
  let message = null;
  if (existingMessageId) {
    try {
      message = await discordAnnouncementRequest(env, `/channels/${channelId}/messages/${existingMessageId}`, { method: 'PATCH', body: payload });
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  if (!message) {
    message = await discordAnnouncementRequest(env, `/channels/${channelId}/messages`, { method: 'POST', body: payload });
  }

  if (bool(env.DISCORD_ANNOUNCEMENTS_CROSSPOST, false)) {
    try {
      await discordAnnouncementRequest(env, `/channels/${channelId}/messages/${message.id}/crosspost`, { method: 'POST' });
    } catch (error) {
      console.warn('[Blackstone announcements crosspost]', error.message);
    }
  }

  discordAnnouncementsCache.expiresAt = 0;
  return {
    item: {
      ...item,
      source: 'website',
      discordMessageId: cleanText(message.id, 30),
      discordChannelId: channelId,
      discordUrl: discordAnnouncementUrl(env, channelId, message.id),
      discordSyncedAt: nowIso()
    }
  };
}

async function deleteAnnouncementFromDiscord(env, item) {
  const channelId = cleanText(item?.discordChannelId || discordAnnouncementsChannelId(env), 30);
  const messageId = cleanText(item?.discordMessageId, 30);
  if (!discordAnnouncementsConfigured(env) || !channelId || !messageId) return;
  await discordAnnouncementRequest(env, `/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' });
  discordAnnouncementsCache.expiresAt = 0;
}

function mergeWebsiteAndDiscordAnnouncements(localAnnouncements, discordAnnouncements, discordLoaded) {
  const local = Array.isArray(localAnnouncements) ? localAnnouncements : [];
  if (!discordLoaded) {
    return local.filter((item) => item.published)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  const localByDiscordId = new Map(local.filter((item) => item.discordMessageId).map((item) => [String(item.discordMessageId), item]));
  const merged = [];
  for (const discordItem of Array.isArray(discordAnnouncements) ? discordAnnouncements : []) {
    const websiteItem = localByDiscordId.get(String(discordItem.discordMessageId));
    if (websiteItem && !websiteItem.published) continue;
    merged.push(websiteItem ? { ...websiteItem, ...discordItem, id: websiteItem.id, pinned: Boolean(websiteItem.pinned || discordItem.pinned), source: 'discord' } : discordItem);
  }
  for (const item of local) {
    if (!item.published || item.discordMessageId) continue;
    merged.push(item);
  }
  const seen = new Set();
  return merged.filter((item) => {
    const key = item.discordMessageId ? `discord:${item.discordMessageId}` : `local:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function getRedisConfig(env) {
  return {
    url: String(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, ''),
    token: String(env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '')
  };
}

function isRedisConfigured(env) {
  const config = getRedisConfig(env);
  return Boolean(config.url && config.token);
}

async function redisCommand(env, command) {
  const config = getRedisConfig(env);
  if (!config.url || !config.token) {
    const error = new Error('Persistent database is not configured.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetchWithTimeout(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command),
    cache: 'no-store'
  }, REDIS_TIMEOUT_MS);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const error = new Error(payload.error || `Database request failed (${response.status}).`);
    error.code = 'DATABASE_ERROR';
    throw error;
  }
  return payload.result;
}

async function redisPipeline(env, commands) {
  const config = getRedisConfig(env);
  if (!config.url || !config.token) {
    const error = new Error('Persistent database is not configured.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetchWithTimeout(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands),
    cache: 'no-store'
  }, REDIS_TIMEOUT_MS);
  const payload = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(payload)) {
    const error = new Error(`Database pipeline failed (${response.status}).`);
    error.code = 'DATABASE_ERROR';
    throw error;
  }
  const firstError = payload.find((entry) => entry && entry.error);
  if (firstError) {
    const error = new Error(firstError.error);
    error.code = 'DATABASE_ERROR';
    throw error;
  }
  return payload.map((entry) => entry.result);
}

async function getJson(env, name, fallback) {
  const value = await redisCommand(env, ['GET', `${PREFIX}${name}`]);
  if (value === null || value === undefined || value === '') return structuredClone(fallback);
  try {
    return JSON.parse(value);
  } catch {
    return structuredClone(fallback);
  }
}

async function setJson(env, name, value) {
  await redisCommand(env, ['SET', `${PREFIX}${name}`, JSON.stringify(value)]);
  return value;
}

function defaultData() {
  const createdAt = nowIso();
  return {
    roles: [
      { id: 'founder', name: 'Founder', permissions: [...ALL_PERMISSIONS], system: true, priority: 100 },
      {
        id: 'admin',
        name: 'Administrator',
        permissions: ALL_PERMISSIONS.filter((permission) => permission !== 'roles.manage' && permission !== 'settings.manage'),
        system: true,
        priority: 80
      },
      {
        id: 'moderator',
        name: 'Moderator',
        permissions: ['dashboard.view', 'announcements.manage', 'members.manage', 'events.manage', 'applications.manage', 'audit.view'],
        system: true,
        priority: 60
      },
      { id: 'staff', name: 'Staff', permissions: ['dashboard.view', 'applications.manage'], system: true, priority: 40 },
      { id: 'member', name: 'Member', permissions: [], system: true, priority: 0 }
    ].map((role) => ({ ...role, discordRoleIds: [], department: '', defaultRank: '' })),
    users: [],
    members: [
      { id: 'member_hellcat007', displayName: 'hellcat007', email: '', discordId: '', discordUsername: 'hellcat007', characterName: '', department: 'Leadership', rank: 'Founder', roleId: 'founder', roleMode: 'manual', departmentMode: 'manual', status: 'Active', public: true, notes: 'Founder and primary developer.', createdAt, updatedAt: createdAt },
      { id: 'member_blackstone', displayName: 'Blackstone', email: '', discordId: '', discordUsername: 'Blackstone', characterName: '', department: 'Leadership', rank: 'Founder', roleId: 'founder', roleMode: 'manual', departmentMode: 'manual', status: 'Active', public: true, notes: 'Founder & Emergency Services Coordinator.', createdAt, updatedAt: createdAt },
      { id: 'member_panox', displayName: 'Panox', email: '', discordId: '', discordUsername: 'Panox', characterName: '', department: 'Leadership', rank: 'Founder', roleId: 'founder', roleMode: 'manual', departmentMode: 'manual', status: 'Active', public: true, notes: "Founder & Blackstone's Wife.", createdAt, updatedAt: createdAt },
      { id: 'member_smokeinterceptor', displayName: 'Smokeinterceptor', email: '', discordId: '', discordUsername: 'Smokeinterceptor', characterName: '', department: 'Staff', rank: 'Community Manager', roleId: 'admin', roleMode: 'manual', departmentMode: 'manual', status: 'Active', public: true, notes: 'Community Manager.', createdAt, updatedAt: createdAt },
      { id: 'member_bear', displayName: 'BEAR', email: '', discordId: '', discordUsername: 'BEAR', characterName: '', department: 'Staff', rank: 'Head Administrator', roleId: 'admin', roleMode: 'manual', departmentMode: 'manual', status: 'Active', public: true, notes: 'Head Administrator.', createdAt, updatedAt: createdAt }
    ],
    announcements: [
      { id: 'announcement_launch', title: 'Development in progress', body: 'Blackstone RP is not open to the public yet. Join Discord to follow development and launch updates.', category: 'Development', pinned: true, published: true, createdAt, updatedAt: createdAt },
      { id: 'announcement_recruitment', title: 'Department recruitment', body: 'Police, EMS, Fire and community staff applications will open as staffing needs are confirmed.', category: 'Recruitment', pinned: false, published: true, createdAt, updatedAt: createdAt }
    ],
    departments: [
      { id: 'department_police', name: 'Police', code: 'LSPD // 01', tagline: 'Protect. Serve. Investigate.', description: 'Patrol the city, respond to critical incidents, investigate organised crime and build cases with advanced policing tools.', features: ['Structured ranks and training', 'Specialist divisions', 'Advanced evidence systems'], open: true, published: true, sortOrder: 1, createdAt, updatedAt: createdAt },
      { id: 'department_ems', name: 'EMS', code: 'EMS // 02', tagline: 'Respond. Stabilise. Care.', description: 'Provide emergency medical response, hospital care and realistic medical roleplay across Los Santos.', features: ['Medical training pathways', 'Ambulance and hospital roles', 'Meaningful patient roleplay'], open: true, published: true, sortOrder: 2, createdAt, updatedAt: createdAt },
      { id: 'department_fire', name: 'Fire Department', code: 'FIRE // 03', tagline: 'Respond. Rescue. Protect.', description: 'Fight fires, perform technical rescues, manage hazardous incidents and support major emergency scenes across Los Santos.', features: ['Fire and rescue training', 'Specialist response units', 'Major incident operations'], open: true, published: true, sortOrder: 3, createdAt, updatedAt: createdAt },
      { id: 'department_civilian', name: 'Civilian', code: 'CIV // 04', tagline: 'Build a life. Create a legacy.', description: 'Create businesses, careers, friendships and long-running stories in a player-driven city.', features: ['Player-owned businesses', 'Civilian careers', 'Character-led stories'], open: true, published: true, sortOrder: 4, createdAt, updatedAt: createdAt },
      { id: 'department_criminal', name: 'Criminal', code: 'CRIM // 05', tagline: 'Take risks. Face consequences.', description: 'Build layered criminal stories with progression, investigations and consequences that respect serious roleplay.', features: ['Progressive opportunities', 'Investigation-driven scenes', 'Balanced risk and reward'], open: true, published: true, sortOrder: 5, createdAt, updatedAt: createdAt }
    ],
    events: [
      { id: 'event_community', title: 'Community Night', description: 'Street meet, cruise and community roleplay night. Final time will be confirmed in Discord.', startsAt: '', location: 'Los Santos', published: true, createdAt, updatedAt: createdAt }
    ],
    shop: [],
    images: [],
    applications: [],
    audit: [],
    settings: {
      communityName: 'Blackstone RP',
      serverEndpoint: '163.227.178.25:30123',
      joinUrl: 'https://cfx.re/join/4xlaj5',
      discordUrl: 'https://discord.gg/bqHJqCFC7E',
      galleryChannelId: '1520414735772811394',
      tebexStoreUrl: '',
      tebexEnabled: false,
      applicationsOpen: true,
      updatedAt: createdAt
    }
  };
}

async function hashPassword(password, salt = crypto.randomBytes(24).toString('hex')) {
  const input = String(password || '');
  if (input.length < 10 || input.length > MAX_PASSWORD_LENGTH) {
    throw badRequest(`Passwords must be between 10 and ${MAX_PASSWORD_LENGTH} characters.`, 'INVALID_PASSWORD');
  }
  const digest = await new Promise((resolve, reject) => {
    crypto.pbkdf2(input, salt, 210000, 64, 'sha512', (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey.toString('hex'));
    });
  });
  return `pbkdf2_sha512$210000$${salt}$${digest}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, iterationsText, salt, digest] = String(stored || '').split('$');
  if (algorithm !== 'pbkdf2_sha512' || !salt || !digest) return false;
  const iterations = Number(iterationsText);
  if (!Number.isFinite(iterations) || iterations < 100000 || iterations > 1000000) return false;
  if (!/^[a-f0-9]{48}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(digest)) return false;
  const input = String(password || '');
  if (input.length > MAX_PASSWORD_LENGTH) return false;
  const calculated = await new Promise((resolve, reject) => {
    crypto.pbkdf2(input, salt, iterations, 64, 'sha512', (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
  const expected = Buffer.from(digest, 'hex');
  return expected.length === calculated.length && crypto.timingSafeEqual(expected, calculated);
}

function authSecret(env) {
  return String(env.AUTH_SECRET || env.ADMIN_AUTH_SECRET || '');
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signToken(payload, env) {
  const secret = authSecret(env);
  if (secret.length < 32) {
    const error = new Error('AUTH_SECRET must be at least 32 characters.');
    error.code = 'AUTH_NOT_CONFIGURED';
    throw error;
  }
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token, env, expectedType) {
  const [header, body, signature] = String(token || '').split('.');
  if (!header || !body || !signature) return null;
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    if (parsedHeader?.alg !== 'HS256' || parsedHeader?.typ !== 'JWT') return null;
  } catch {
    return null;
  }
  const secret = authSecret(env);
  if (secret.length < 32) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest();
  let received;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(Number(payload.iat)) || !Number.isFinite(Number(payload.exp))) return null;
  if (now >= Number(payload.exp) || Number(payload.iat) > now + 60) return null;
  if (expectedType && payload.type !== expectedType) return null;
  return payload;
}

function parseCookies(req) {
  const cookies = {};
  const source = String(req.headers?.cookie || '');
  for (const item of source.split(';')) {
    const index = item.indexOf('=');
    if (index < 0) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!key) continue;
    try { cookies[key] = decodeURIComponent(value); } catch { /* Ignore malformed cookie values. */ }
  }
  return cookies;
}

function cookieString(name, value, maxAge, req, httpOnly = true, sameSite = 'Strict') {
  const forwardedProto = cleanText(String(req.headers?.['x-forwarded-proto'] || '').split(',')[0], 20);
  const secure = forwardedProto === 'https' || process.env.NODE_ENV === 'production';
  const safeSameSite = ['Strict', 'Lax', 'None'].includes(sameSite) ? sameSite : 'Strict';
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `Max-Age=${Math.max(0, maxAge)}`, `SameSite=${safeSameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  parts.push('Priority=High');
  return parts.join('; ');
}

function clearCookie(name, req, sameSite = 'Strict') {
  return cookieString(name, '', 0, req, true, sameSite);
}

function clientIp(req) {
  const value = String(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown');
  return cleanText(value.split(',')[0], 128) || 'unknown';
}

function clientFingerprint(req) {
  // OAuth already requires a one-time HttpOnly state cookie. Binding it to
  // stable browser headers avoids false failures when mobile/public IPs change.
  const agent = cleanText(req.headers?.['user-agent'] || '', 300);
  const language = cleanText(req.headers?.['accept-language'] || '', 120);
  return crypto.createHash('sha256').update(`${agent}|${language}`).digest('hex').slice(0, 32);
}

function sessionFingerprint(req) {
  const agent = cleanText(req.headers?.['user-agent'] || '', 300);
  const language = cleanText(req.headers?.['accept-language'] || '', 120);
  return crypto.createHash('sha256').update(`${agent}|${language}`).digest('hex').slice(0, 32);
}

async function rateLimit(env, bucket, limit, windowSeconds) {
  const key = `${PREFIX}ratelimit:${bucket}`;
  const [count] = await redisPipeline(env, [
    ['INCR', key],
    ['EXPIRE', key, windowSeconds, 'NX']
  ]);
  return Number(count) <= limit;
}

async function ensureBootstrapAdmin(env) {
  const adminEmail = cleanEmail(env.ADMIN_EMAIL || env.ADMIN_BOOTSTRAP_EMAIL || '');
  const adminPassword = String(env.ADMIN_PASSWORD || env.ADMIN_BOOTSTRAP_PASSWORD || '');
  if (!adminEmail || !isEmail(adminEmail) || adminPassword.length < 10) return false;

  const users = await getJson(env, 'users', []);
  if (users.some((user) => user.email === adminEmail)) return false;

  const timestamp = nowIso();
  users.unshift({
    id: randomId('user'),
    email: adminEmail,
    displayName: cleanText(env.ADMIN_NAME || 'Blackstone Founder', 100),
    passwordHash: await hashPassword(adminPassword),
    roleId: 'founder',
    roleMode: 'manual',
    memberId: '',
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: ''
  });
  await setJson(env, 'users', users);
  return true;
}


async function runDataMigrations(env) {
  const migrationKey = `${PREFIX}migration:v3-role-sync`;
  const completed = await redisCommand(env, ['GET', migrationKey]);
  if (completed === '1') return false;

  const defaults = defaultData();
  const [roles, members, users] = await Promise.all([
    getJson(env, 'roles', defaults.roles),
    getJson(env, 'members', defaults.members),
    getJson(env, 'users', defaults.users)
  ]);

  const priorityDefaults = { founder: 100, admin: 80, moderator: 60, staff: 40, member: 0 };
  for (const role of roles) {
    if (!Number.isFinite(Number(role.priority))) role.priority = priorityDefaults[role.id] ?? 20;
    if (!Array.isArray(role.discordRoleIds)) role.discordRoleIds = [];
    if (typeof role.department !== 'string') role.department = '';
    if (typeof role.defaultRank !== 'string') role.defaultRank = '';
  }

  for (const member of members) {
    const isHellcat = String(member.displayName || member.discordUsername || '').toLowerCase() === 'hellcat007';
    if (isHellcat && (member.rank === 'Server Owner' || !member.rank)) member.rank = 'Founder';
    if (isHellcat && member.notes === 'Server owner and primary developer.') member.notes = 'Founder and primary developer.';
    const discordManaged = ['Imported from Discord.', 'Linked through Discord sign-in.'].includes(member.notes) || Boolean(member.discordId && !member.public && !member.department && !member.rank);
    if (!['manual', 'discord'].includes(member.roleMode)) member.roleMode = discordManaged ? 'discord' : 'manual';
    if (!['manual', 'discord'].includes(member.departmentMode)) member.departmentMode = member.department ? 'manual' : (discordManaged ? 'discord' : 'manual');
  }

  for (const user of users) {
    if (!['manual', 'discord'].includes(user.roleMode)) {
      user.roleMode = user.authProvider === 'discord' && !user.passwordHash ? 'discord' : 'manual';
    }
  }

  await redisPipeline(env, [
    ['SET', `${PREFIX}roles`, JSON.stringify(roles)],
    ['SET', `${PREFIX}members`, JSON.stringify(members)],
    ['SET', `${PREFIX}users`, JSON.stringify(users)],
    ['SET', migrationKey, '1']
  ]);
  return true;
}

async function runFireDepartmentMigration(env) {
  const migrationKey = `${PREFIX}migration:v4-fire-department`;
  const completed = await redisCommand(env, ['GET', migrationKey]);
  if (completed === '1') return false;

  const defaults = defaultData();
  const departments = await getJson(env, 'departments', defaults.departments);
  const fireDefault = defaults.departments.find((department) => department.id === 'department_fire');
  const hasFireDepartment = departments.some((department) => {
    const id = String(department.id || '').toLowerCase();
    const name = String(department.name || '').toLowerCase();
    return id === 'department_fire' || /(^|\s)fire(\s|$)/.test(name);
  });

  if (!hasFireDepartment && fireDefault) {
    const civilian = departments.find((department) => department.id === 'department_civilian');
    if (civilian) {
      if (civilian.code === 'CIV // 03') civilian.code = 'CIV // 04';
      if (Number(civilian.sortOrder) === 3) civilian.sortOrder = 4;
    }

    const criminal = departments.find((department) => department.id === 'department_criminal');
    if (criminal) {
      if (criminal.code === 'CRIM // 04') criminal.code = 'CRIM // 05';
      if (Number(criminal.sortOrder) === 4) criminal.sortOrder = 5;
    }

    departments.push(structuredClone(fireDefault));
    departments.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    await setJson(env, 'departments', departments);
  }

  await redisCommand(env, ['SET', migrationKey, '1']);
  return !hasFireDepartment;
}


async function runShopMigration(env) {
  const migrationKey = `${PREFIX}migration:v5-shop`;
  const completed = await redisCommand(env, ['GET', migrationKey]);
  if (completed === '1') return false;

  const defaults = defaultData();
  const [roles, shop] = await Promise.all([
    getJson(env, 'roles', defaults.roles),
    getJson(env, 'shop', defaults.shop)
  ]);

  for (const role of roles) {
    if (!Array.isArray(role.permissions)) role.permissions = [];
    if (['founder', 'admin'].includes(role.id) && !role.permissions.includes('shop.manage')) {
      role.permissions.push('shop.manage');
    }
  }

  await redisPipeline(env, [
    ['SET', `${PREFIX}roles`, JSON.stringify(roles)],
    ['SET', `${PREFIX}shop`, JSON.stringify(Array.isArray(shop) ? shop : [])],
    ['SET', migrationKey, '1']
  ]);
  return true;
}

async function ensureSeededInternal(env) {
  const seeded = await redisCommand(env, ['GET', `${PREFIX}seeded`]);
  if (seeded === '1') {
    await ensureBootstrapAdmin(env);
    await runDataMigrations(env);
    await runFireDepartmentMigration(env);
    await runShopMigration(env);
    return { configured: true, seeded: true };
  }

  const defaults = defaultData();
  const commands = [
    ['SET', `${PREFIX}roles`, JSON.stringify(defaults.roles)],
    ['SET', `${PREFIX}users`, JSON.stringify(defaults.users)],
    ['SET', `${PREFIX}members`, JSON.stringify(defaults.members)],
    ['SET', `${PREFIX}announcements`, JSON.stringify(defaults.announcements)],
    ['SET', `${PREFIX}departments`, JSON.stringify(defaults.departments)],
    ['SET', `${PREFIX}events`, JSON.stringify(defaults.events)],
    ['SET', `${PREFIX}shop`, JSON.stringify(defaults.shop)],
    ['SET', `${PREFIX}images`, JSON.stringify(defaults.images)],
    ['SET', `${PREFIX}applications`, JSON.stringify(defaults.applications)],
    ['SET', `${PREFIX}audit`, JSON.stringify(defaults.audit)],
    ['SET', `${PREFIX}settings`, JSON.stringify(defaults.settings)],
    ['SET', `${PREFIX}seeded`, '1']
  ];
  await redisPipeline(env, commands);
  await ensureBootstrapAdmin(env);
  await runDataMigrations(env);
  await runFireDepartmentMigration(env);
  await runShopMigration(env);
  return { configured: true, seeded: true };
}

async function ensureSeeded(env, options = {}) {
  if (!isRedisConfigured(env)) return { configured: false, seeded: false };
  const now = Date.now();
  if (!options.force && seedCache.expiresAt > now) return { configured: true, seeded: true };
  if (seedCache.promise) return seedCache.promise;
  seedCache.promise = ensureSeededInternal(env)
    .then((result) => {
      seedCache.expiresAt = Date.now() + SEED_CACHE_TTL_MS;
      return result;
    })
    .finally(() => {
      seedCache.promise = null;
    });
  return seedCache.promise;
}

async function getAllData(env) {
  const defaults = defaultData();
  const names = ['roles', 'users', 'members', 'announcements', 'departments', 'events', 'shop', 'images', 'applications', 'audit', 'settings'];
  const results = await redisPipeline(env, names.map((name) => ['GET', `${PREFIX}${name}`]));
  const output = {};
  names.forEach((name, index) => {
    try {
      output[name] = results[index] ? JSON.parse(results[index]) : structuredClone(defaults[name]);
    } catch {
      output[name] = structuredClone(defaults[name]);
    }
  });
  return output;
}

async function appendAudit(env, entry) {
  const audit = await getJson(env, 'audit', []);
  audit.unshift({ id: randomId('audit'), at: nowIso(), ...entry });
  if (audit.length > 500) audit.length = 500;
  await setJson(env, 'audit', audit);
}

function roleFor(user, roles) {
  return roles.find((role) => role.id === user.roleId) || roles.find((role) => role.id === 'member') || { id: 'member', name: 'Member', permissions: [] };
}

function publicUser(user, roles) {
  const role = roleFor(user, roles);
  return {
    id: user.id,
    email: user.authProvider === 'discord' ? (user.discordEmail || '') : user.email,
    displayName: user.displayName,
    authProvider: user.authProvider || 'local',
    discordId: user.discordId || '',
    discordUsername: user.discordUsername || '',
    roleId: role.id,
    roleName: role.name,
    rolePriority: Number(role.priority || 0),
    permissions: Array.isArray(role.permissions) ? role.permissions : [],
    memberId: user.memberId || '',
    active: Boolean(user.active)
  };
}

async function authenticate(req, env) {
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies[ACCESS_COOKIE], env, 'access');
  if (!payload?.sub || !payload?.sid) return null;
  const keys = [`${PREFIX}users`, `${PREFIX}roles`, `${PREFIX}session:${payload.sid}`];
  const values = await redisCommand(env, ['MGET', ...keys]);
  const defaults = defaultData();
  let users = [];
  let roles = defaults.roles;
  let session = null;
  try { users = values?.[0] ? JSON.parse(values[0]) : []; } catch { users = []; }
  try { roles = values?.[1] ? JSON.parse(values[1]) : defaults.roles; } catch { roles = defaults.roles; }
  try { session = values?.[2] ? JSON.parse(values[2]) : null; } catch { session = null; }
  if (!session || session.userId !== payload.sub || session.csrf !== payload.csrf) return null;
  const user = users.find((candidate) => candidate.id === payload.sub && candidate.active !== false);
  if (!user) return null;
  const result = publicUser(user, roles);
  result.csrf = payload.csrf || '';
  result.sessionId = payload.sid;
  return result;
}

function allowedRequestOrigin(req, env) {
  const origin = cleanText(req.headers?.origin || '', 1000);
  if (!origin) return true;
  const expected = requestOrigin(req, env);
  return Boolean(expected && origin === expected);
}

function requireCsrf(req, user, env) {
  const method = String(req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  if (!allowedRequestOrigin(req, env)) return false;
  const token = cleanText(req.headers?.['x-csrf-token'] || '', 256);
  const expected = Buffer.from(String(user?.csrf || ''));
  const received = Buffer.from(token);
  return Boolean(token && expected.length === received.length && crypto.timingSafeEqual(expected, received));
}

function hasPermission(user, permission) {
  return Boolean(user && Array.isArray(user.permissions) && user.permissions.includes(permission));
}

async function issueSession(req, res, env, user, additionalCookies = []) {
  const now = Math.floor(Date.now() / 1000);
  const sessionId = randomId('session');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const access = signToken({ sub: user.id, type: 'access', sid: sessionId, iat: now, exp: now + ACCESS_TTL, csrf }, env);
  const refresh = signToken({ sub: user.id, type: 'refresh', sid: sessionId, iat: now, exp: now + REFRESH_TTL }, env);
  const indexKey = `${PREFIX}user-sessions:${user.id}`;
  await redisPipeline(env, [
    ['SETEX', `${PREFIX}session:${sessionId}`, REFRESH_TTL, JSON.stringify({ userId: user.id, csrf, fingerprint: sessionFingerprint(req), createdAt: nowIso() })],
    ['SADD', indexKey, sessionId],
    ['EXPIRE', indexKey, REFRESH_TTL]
  ]);
  res.setHeader('Set-Cookie', [
    cookieString(ACCESS_COOKIE, access, ACCESS_TTL, req),
    cookieString(REFRESH_COOKIE, refresh, REFRESH_TTL, req),
    ...additionalCookies
  ]);
  return csrf;
}

async function revokeUserSessions(env, userId) {
  const id = cleanText(userId, 120);
  if (!id) return;
  const indexKey = `${PREFIX}user-sessions:${id}`;
  const sessionIds = await redisCommand(env, ['SMEMBERS', indexKey]).catch(() => []);
  const commands = (Array.isArray(sessionIds) ? sessionIds : []).map((sid) => ['DEL', `${PREFIX}session:${cleanText(sid, 160)}`]);
  commands.push(['DEL', indexKey]);
  await redisPipeline(env, commands);
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body !== 'string' || Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
    throw httpError(413, 'Request body is too large.', 'BODY_TOO_LARGE');
  }
  try {
    const parsed = JSON.parse(req.body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw badRequest('The request body must be valid JSON.', 'INVALID_JSON');
  }
}

function json(res, status, body, cacheControl = 'no-store, max-age=0') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return res.end(JSON.stringify(body));
}

function sanitizeEntityItem(entity, input, existing = null) {
  const timestamp = nowIso();
  const base = existing ? { ...existing } : { id: cleanText(input.id, 100) || randomId(entity.slice(0, -1) || 'item'), createdAt: timestamp };
  base.updatedAt = timestamp;

  if (entity === 'announcements') {
    return {
      ...base,
      title: cleanText(input.title, 160),
      body: cleanText(input.body, 5000),
      category: cleanText(input.category || 'Community', 80),
      pinned: bool(input.pinned),
      published: bool(input.published, true),
      source: cleanText(input.source || base.source || 'website', 40),
      discordMessageId: cleanText(input.discordMessageId || base.discordMessageId, 30),
      discordChannelId: cleanText(input.discordChannelId || base.discordChannelId, 30),
      discordUrl: cleanText(input.discordUrl || base.discordUrl, 1000),
      discordSyncedAt: cleanText(input.discordSyncedAt || base.discordSyncedAt, 80)
    };
  }
  if (entity === 'departments') {
    const features = Array.isArray(input.features) ? input.features : String(input.features || '').split(/\r?\n/);
    return {
      ...base,
      name: cleanText(input.name, 120),
      code: cleanText(input.code, 80),
      tagline: cleanText(input.tagline, 180),
      description: cleanText(input.description, 5000),
      features: features.map((item) => cleanText(item, 220)).filter(Boolean).slice(0, 20),
      open: bool(input.open, true),
      published: bool(input.published, true),
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0
    };
  }
  if (entity === 'events') {
    return {
      ...base,
      title: cleanText(input.title, 180),
      description: cleanText(input.description, 5000),
      startsAt: cleanText(input.startsAt, 80),
      location: cleanText(input.location, 180),
      published: bool(input.published, true)
    };
  }

  if (entity === 'shop') {
    const imageUrl = safeUrl(input.imageUrl, { message: 'Shop image URLs must use HTTPS.' });
    const purchaseUrl = safeUrl(input.purchaseUrl, { message: 'Shop purchase URLs must use HTTPS.' });
    return {
      ...base,
      title: cleanText(input.title, 180),
      category: cleanText(input.category || 'Blackstone Shop', 100),
      description: cleanText(input.description, 4000),
      priceLabel: cleanText(input.priceLabel, 100),
      imageUrl,
      purchaseUrl,
      buttonLabel: cleanText(input.buttonLabel || 'View Item', 60),
      featured: bool(input.featured),
      soldOut: bool(input.soldOut),
      published: bool(input.published, true),
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0
    };
  }
  if (entity === 'images') {
    const url = safeUrl(input.url, { message: 'Image URLs must use HTTPS.' });
    return {
      ...base,
      title: cleanText(input.title, 180),
      url,
      caption: cleanText(input.caption, 1000),
      published: bool(input.published, true),
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0
    };
  }
  if (entity === 'members') {
    return {
      ...base,
      displayName: cleanText(input.displayName, 120),
      email: cleanEmail(input.email),
      discordId: cleanText(input.discordId, 30),
      discordUsername: cleanText(input.discordUsername, 120),
      characterName: cleanText(input.characterName, 160),
      department: cleanText(input.department, 160),
      rank: cleanText(input.rank, 160),
      roleId: cleanText(input.roleId || base.roleId || 'member', 80),
      roleMode: ['manual', 'discord'].includes(cleanText(input.roleMode || base.roleMode, 20)) ? cleanText(input.roleMode || base.roleMode, 20) : (base.id ? 'manual' : 'discord'),
      departmentMode: ['manual', 'discord'].includes(cleanText(input.departmentMode || base.departmentMode, 20)) ? cleanText(input.departmentMode || base.departmentMode, 20) : (base.id ? 'manual' : 'discord'),
      status: cleanText(input.status || 'Active', 80),
      public: bool(input.public),
      discordRoles: Array.isArray(input.discordRoles) ? input.discordRoles.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 100) : (base.discordRoles || []),
      notes: cleanText(input.notes, 5000)
    };
  }
  if (entity === 'applications') {
    return {
      ...base,
      applicationType: cleanText(input.applicationType, 120),
      discord: cleanText(input.discord, 160),
      discordId: cleanText(input.discordId, 30),
      age: Number.isFinite(Number(input.age)) ? Number(input.age) : null,
      timezone: cleanText(input.timezone, 100),
      steam: cleanText(input.steam, 500),
      fivem: cleanText(input.fivem, 160),
      source: cleanText(input.source, 160),
      experience: cleanText(input.experience, 160),
      availability: cleanText(input.availability, 160),
      history: cleanText(input.history, 8000),
      character: cleanText(input.character, 8000),
      quality: cleanText(input.quality, 8000),
      scenario1: cleanText(input.scenario1, 8000),
      scenario2: cleanText(input.scenario2, 8000),
      scenario3: cleanText(input.scenario3, 8000),
      status: cleanText(input.status || base.status || 'Pending', 80),
      staffNotes: cleanText(input.staffNotes || base.staffNotes, 8000),
      submittedAt: base.submittedAt || timestamp
    };
  }
  if (entity === 'roles') {
    const permissions = Array.isArray(input.permissions) ? input.permissions : [];
    const discordRoleIds = Array.isArray(input.discordRoleIds)
      ? input.discordRoleIds
      : String(input.discordRoleIds || '').split(/[\s,]+/);
    return {
      ...base,
      id: existing?.id || cleanText(input.id || base.id, 80),
      name: cleanText(input.name, 120),
      permissions: existing?.id === 'founder' ? [...ALL_PERMISSIONS] : permissions.filter((permission) => ALL_PERMISSIONS.includes(permission)),
      discordRoleIds: [...new Set(discordRoleIds.map((value) => cleanText(value, 30)).filter((value) => /^\d{15,22}$/.test(value)))],
      department: cleanText(input.department || base.department, 160),
      defaultRank: cleanText(input.defaultRank || base.defaultRank, 160),
      priority: existing?.id === 'founder' ? Math.max(100, Number(input.priority || base.priority || 100)) : (Number.isFinite(Number(input.priority)) ? Math.max(-1000, Math.min(1000, Number(input.priority))) : Number(base.priority || 0)),
      system: Boolean(base.system)
    };
  }
  if (entity === 'settings') {
    return {
      communityName: cleanText(input.communityName || base.communityName || 'Blackstone RP', 160),
      serverEndpoint: cleanText(input.serverEndpoint || base.serverEndpoint, 160),
      joinUrl: safeUrl(input.joinUrl || base.joinUrl, { message: 'The FiveM join URL must be a secure HTTPS address.' }),
      discordUrl: safeUrl(input.discordUrl || base.discordUrl, { hosts: ['discord.gg', 'discord.com', 'www.discord.com'], message: 'The Discord invite must use discord.gg or discord.com.' }),
      galleryChannelId: cleanText(input.galleryChannelId || base.galleryChannelId, 30),
      tebexStoreUrl: safeUrl(input.tebexStoreUrl || base.tebexStoreUrl, { message: 'The Tebex store URL must use HTTPS.' }),
      tebexEnabled: bool(input.tebexEnabled, false),
      applicationsOpen: bool(input.applicationsOpen, true),
      updatedAt: timestamp
    };
  }
  return { ...base };
}

async function sanitizeUserInput(input, existing = null) {
  const timestamp = nowIso();
  const email = cleanEmail(input.email || existing?.email);
  if (!isEmail(email)) throw badRequest('A valid email address is required.', 'INVALID_EMAIL');
  const output = {
    ...(existing || {}),
    id: existing?.id || cleanText(input.id, 100) || randomId('user'),
    email,
    displayName: cleanText(input.displayName || existing?.displayName, 120),
    roleId: cleanText(input.roleId || existing?.roleId || 'member', 80),
    roleMode: ['manual', 'discord'].includes(cleanText(input.roleMode || existing?.roleMode, 20)) ? cleanText(input.roleMode || existing?.roleMode, 20) : (existing?.authProvider === 'discord' && !existing?.passwordHash ? 'discord' : 'manual'),
    memberId: cleanText(input.memberId || existing?.memberId, 100),
    active: bool(input.active, existing?.active !== false),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    lastLoginAt: existing?.lastLoginAt || '',
    authProvider: existing?.authProvider || 'local',
    discordId: existing?.discordId || '',
    discordUsername: existing?.discordUsername || '',
    discordEmail: existing?.discordEmail || ''
  };
  const newPassword = String(input.newPassword || input.password || '');
  if (newPassword) {
    if (newPassword.length < 10 || newPassword.length > MAX_PASSWORD_LENGTH) throw badRequest(`Passwords must be between 10 and ${MAX_PASSWORD_LENGTH} characters.`, 'INVALID_PASSWORD');
    output.passwordHash = await hashPassword(newPassword);
  } else if (existing?.passwordHash) {
    output.passwordHash = existing.passwordHash;
  } else if (existing?.authProvider === 'discord') {
    delete output.passwordHash;
  } else {
    throw badRequest('A password is required for a new account.', 'PASSWORD_REQUIRED');
  }
  return output;
}

function validateApplication(input) {
  const required = ['applicationType', 'discord', 'discordId', 'age', 'timezone', 'fivem', 'experience', 'availability', 'history', 'character', 'quality', 'scenario1', 'scenario2', 'scenario3'];
  for (const field of required) {
    if (!cleanText(input[field], 10000)) throw badRequest(`Missing required field: ${field}.`, 'APPLICATION_INCOMPLETE');
  }
  const age = Number(input.age);
  if (!Number.isFinite(age) || age < 16 || age > 99) throw badRequest('Age must be between 16 and 99.', 'INVALID_AGE');
  if (!/^\d{15,22}$/.test(String(input.discordId))) throw badRequest('Discord user ID must contain 15 to 22 digits.', 'INVALID_DISCORD_ID');
  if (!bool(input.rulesConfirmed) || !bool(input.honestConfirmed) || !bool(input.contactConfirmed)) {
    throw badRequest('All applicant declarations must be accepted.', 'DECLARATIONS_REQUIRED');
  }
}

function validateEntityItem(entity, item) {
  const required = {
    announcements: ['title', 'body'],
    departments: ['name'],
    events: ['title'],
    shop: ['title'],
    images: ['url'],
    members: ['displayName'],
    roles: ['id', 'name']
  }[entity] || [];
  for (const field of required) {
    if (!cleanText(item?.[field], 8000)) throw badRequest(`${field} is required.`, 'MISSING_REQUIRED_FIELD');
  }
  if (entity === 'roles' && !/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(item.id)) {
    throw badRequest('Role IDs may contain only letters, numbers, hyphens and underscores.', 'INVALID_ROLE_ID');
  }
  if (entity === 'events' && item.startsAt && Number.isNaN(new Date(item.startsAt).getTime())) {
    throw badRequest('The event start date is invalid.', 'INVALID_EVENT_DATE');
  }
  if (entity === 'applications' && !['Pending', 'Under Review', 'Accepted', 'Declined', 'Changes Requested'].includes(item.status)) {
    throw badRequest('The application status is invalid.', 'INVALID_APPLICATION_STATUS');
  }
}

function roleById(roles, id) {
  return roles.find((role) => role.id === id) || null;
}

function assertRoleAssignmentAllowed(actor, roles, roleId) {
  const target = roleById(roles, roleId || 'member');
  if (!target) throw badRequest('The selected website role does not exist.', 'INVALID_ROLE');
  const actorPriority = Number(actor?.rolePriority || 0);
  const targetPriority = Number(target.priority || 0);
  if (targetPriority > actorPriority) throw httpError(403, 'You cannot assign a role above your own access level.', 'ROLE_ESCALATION_BLOCKED');
  return target;
}

function assertTargetManageable(actor, roles, targetRoleId) {
  const target = roleById(roles, targetRoleId || 'member');
  if (!target) return;
  if (Number(target.priority || 0) > Number(actor?.rolePriority || 0)) {
    throw httpError(403, 'You cannot modify an account above your own access level.', 'TARGET_ACCESS_DENIED');
  }
}

async function buildPublicPayload(env) {
  const defaults = defaultData();
  if (!isRedisConfigured(env)) {
    return {
      configured: false,
      demo: true,
      announcements: defaults.announcements.filter((item) => item.published),
      departments: defaults.departments.filter((item) => item.published),
      events: defaults.events.filter((item) => item.published),
      shop: defaults.shop.filter((item) => item.published),
      images: defaults.images.filter((item) => item.published),
      staff: defaults.members.filter((item) => item.public && item.status === 'Active'),
      settings: defaults.settings
    };
  }
  await ensureSeeded(env);
  const names = ['announcements', 'departments', 'events', 'shop', 'images', 'members', 'settings'];
  const values = await redisCommand(env, ['MGET', ...names.map((name) => `${PREFIX}${name}`)]);
  const data = {};
  names.forEach((name, index) => {
    try { data[name] = values?.[index] ? JSON.parse(values[index]) : structuredClone(defaults[name]); }
    catch { data[name] = structuredClone(defaults[name]); }
  });
  let discordAnnouncements = [];
  let discordLoaded = false;
  if (discordAnnouncementsConfigured(env)) {
    try {
      discordAnnouncements = await getDiscordAnnouncements(env);
      discordLoaded = true;
    } catch (error) {
      console.warn('[Blackstone announcements read]', cleanText(error.message, 240));
    }
  }
  return {
    configured: true,
    demo: false,
    announcements: mergeWebsiteAndDiscordAnnouncements(data.announcements, discordAnnouncements, discordLoaded),
    departments: data.departments.filter((item) => item.published).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    events: data.events.filter((item) => item.published).sort((a, b) => String(a.startsAt || '9999').localeCompare(String(b.startsAt || '9999'))),
    shop: data.shop.filter((item) => item.published).sort((a, b) => Number(b.featured || 0) - Number(a.featured || 0) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    images: data.images.filter((item) => item.published).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    staff: data.members.filter((item) => item.public && item.status === 'Active'),
    settings: data.settings
  };
}

async function getPublicPayload(env) {
  const now = Date.now();
  if (publicPayloadCache.value && publicPayloadCache.expiresAt > now) return publicPayloadCache.value;
  if (publicPayloadCache.promise) return publicPayloadCache.promise;
  publicPayloadCache.promise = buildPublicPayload(env)
    .then((value) => {
      publicPayloadCache.value = value;
      publicPayloadCache.expiresAt = Date.now() + PUBLIC_CACHE_TTL_MS;
      return value;
    })
    .finally(() => { publicPayloadCache.promise = null; });
  return publicPayloadCache.promise;
}

function requestOrigin(req, env) {
  const configured = cleanText(env.PUBLIC_SITE_URL || '', 1000);
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' && !url.username && !url.password) return url.origin;
      if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
    } catch {}
    return '';
  }
  const host = cleanText(req.headers?.host || '', 500);
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) return `http://${host}`;
  return '';
}

function discordRedirectUri(req, env) {
  const origin = requestOrigin(req, env);
  const configured = cleanText(env.DISCORD_REDIRECT_URI || '', 1000);
  if (configured) {
    try {
      const url = new URL(configured);
      const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
      if ((url.protocol === 'https:' || local) && !url.username && !url.password && (!origin || url.origin === origin)) return url.href;
    } catch {}
    return '';
  }
  return origin ? `${origin}/api/discord-callback` : '';
}

function discordOAuthConfigured(env) {
  return Boolean(
    env.DISCORD_CLIENT_ID &&
    env.DISCORD_CLIENT_SECRET &&
    env.DISCORD_BOT_TOKEN &&
    env.DISCORD_GUILD_ID
  );
}

function redirect(res, status, location) {
  res.statusCode = status;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end('');
}

function mappedWebsiteRoleRecord(discordRoleIds, websiteRoles) {
  const incoming = new Set((discordRoleIds || []).map(String));
  const ordered = [...websiteRoles].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  return ordered.find((role) => {
    const mapped = Array.isArray(role.discordRoleIds) ? role.discordRoleIds : [];
    return mapped.some((roleId) => incoming.has(String(roleId)));
  }) || websiteRoles.find((role) => role.id === 'member') || { id: 'member', name: 'Member', permissions: [], department: '', defaultRank: '' };
}

function mappedWebsiteRole(discordRoleIds, websiteRoles) {
  return mappedWebsiteRoleRecord(discordRoleIds, websiteRoles).id;
}

async function startDiscordOAuth(req, res, env) {
  if (!isRedisConfigured(env)) throw Object.assign(new Error('Portal database is not configured.'), { code: 'DATABASE_NOT_CONFIGURED' });
  const allowed = await rateLimit(env, `oauth-start:${clientIp(req)}`, 20, 10 * 60);
  if (!allowed) throw httpError(429, 'Too many sign-in attempts. Try again in a few minutes.', 'RATE_LIMITED');
  if (authSecret(env).length < 32) throw Object.assign(new Error('AUTH_SECRET must be at least 32 characters.'), { code: 'AUTH_NOT_CONFIGURED' });
  if (!discordOAuthConfigured(env)) throw new Error('Discord sign-in is not configured.');
  const redirectUri = discordRedirectUri(req, env);
  if (!redirectUri) throw new Error('Unable to determine the Discord redirect URL.');

  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(24).toString('base64url');
  const returnTo = cleanText(req.query?.returnTo, 20) === 'admin' ? 'admin' : 'portal';
  const state = signToken({ type: 'oauth-state', nonce, returnTo, iat: now, exp: now + OAUTH_STATE_TTL }, env);
  await redisCommand(env, ['SETEX', `${PREFIX}oauth-state:${nonce}`, OAUTH_STATE_TTL, clientFingerprint(req)]);
  const params = new URLSearchParams({
    client_id: String(env.DISCORD_CLIENT_ID),
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify email',
    state
  });
  res.setHeader('Set-Cookie', cookieString(OAUTH_STATE_COOKIE, nonce, OAUTH_STATE_TTL, req, true, 'Lax'));
  return redirect(res, 302, `https://discord.com/oauth2/authorize?${params.toString()}`);
}

async function completeDiscordOAuth(req, res, env) {
  if (!discordOAuthConfigured(env)) throw new Error('Discord sign-in is not configured.');
  if (req.query?.error) throw httpError(400, 'Discord did not approve the sign-in request.', 'DISCORD_OAUTH_DENIED');
  const allowed = await rateLimit(env, `oauth-callback:${clientIp(req)}`, 20, 10 * 60);
  if (!allowed) throw httpError(429, 'Too many sign-in attempts. Try again in a few minutes.', 'RATE_LIMITED');
  const code = cleanText(req.query?.code || '', 1000);
  const state = cleanText(req.query?.state || '', 4000);
  const statePayload = verifyToken(state, env, 'oauth-state');
  const stateCookie = parseCookies(req)[OAUTH_STATE_COOKIE];
  if (!code || !statePayload?.nonce || !stateCookie || statePayload.nonce !== stateCookie) {
    throw httpError(400, 'Discord sign-in security check failed. Please try again.', 'INVALID_OAUTH_STATE');
  }
  const storedFingerprint = await redisCommand(env, ['GETDEL', `${PREFIX}oauth-state:${statePayload.nonce}`]);
  if (!storedFingerprint || storedFingerprint !== clientFingerprint(req)) {
    throw httpError(400, 'This Discord sign-in request has expired or was already used.', 'OAUTH_STATE_REPLAY');
  }

  const redirectUri = discordRedirectUri(req, env);
  if (!redirectUri) throw new Error('Discord redirect URL is not configured correctly.');
  const tokenResponse = await fetchWithTimeout('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: String(env.DISCORD_CLIENT_ID),
      client_secret: String(env.DISCORD_CLIENT_SECRET),
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    }).toString(),
    cache: 'no-store'
  }, DISCORD_TIMEOUT_MS);
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error('Discord did not approve the sign-in request.');

  const discordUserResponse = await fetchWithTimeout('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}`, Accept: 'application/json' },
    cache: 'no-store'
  }, DISCORD_TIMEOUT_MS);
  const discordUser = await discordUserResponse.json().catch(() => ({}));
  if (!discordUserResponse.ok || !discordUser.id) throw new Error('Discord account details could not be loaded.');

  const botHeaders = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, Accept: 'application/json', 'User-Agent': 'BlackstoneRP-Website/4.7' };
  const [guildMemberResponse, guildRolesResponse] = await Promise.all([
    fetchWithTimeout(`https://discord.com/api/v10/guilds/${cleanText(env.DISCORD_GUILD_ID, 30)}/members/${discordUser.id}`, { headers: botHeaders, cache: 'no-store' }, DISCORD_TIMEOUT_MS),
    fetchWithTimeout(`https://discord.com/api/v10/guilds/${cleanText(env.DISCORD_GUILD_ID, 30)}/roles`, { headers: botHeaders, cache: 'no-store' }, DISCORD_TIMEOUT_MS)
  ]);
  if (guildMemberResponse.status === 404) throw new Error('Join the Blackstone RP Discord server before signing in.');
  if (!guildMemberResponse.ok) throw new Error('Blackstone Discord membership could not be verified.');
  const guildMember = await guildMemberResponse.json();
  const guildRoles = guildRolesResponse.ok ? await guildRolesResponse.json() : [];
  const discordRoleIds = Array.isArray(guildMember.roles) ? guildMember.roles.map(String) : [];
  const roleNameMap = new Map((Array.isArray(guildRoles) ? guildRoles : []).map((role) => [String(role.id), cleanText(role.name, 120)]));

  const [members, users, websiteRoles] = await Promise.all([
    getJson(env, 'members', []),
    getJson(env, 'users', []),
    getJson(env, 'roles', defaultData().roles)
  ]);
  const mappedRole = mappedWebsiteRoleRecord(discordRoleIds, websiteRoles);
  const mappedRoleId = mappedRole.id;
  const isAuthorisedStaff = Array.isArray(mappedRole.permissions) && mappedRole.permissions.includes('dashboard.view');
  if (!isAuthorisedStaff) {
    res.setHeader('Set-Cookie', clearCookie(OAUTH_STATE_COOKIE, req, 'Lax'));
    throw httpError(403, 'This Discord account does not have authorised staff access.', 'STAFF_ACCESS_REQUIRED');
  }
  const timestamp = nowIso();
  const displayName = cleanText(guildMember.nick || discordUser.global_name || discordUser.username || 'Discord Member', 120);
  let member = members.find((item) => item.discordId === String(discordUser.id));
  if (member) {
    member.displayName = displayName || member.displayName;
    member.discordUsername = cleanText(discordUser.username, 120);
    member.discordId = String(discordUser.id);
    member.discordRoles = discordRoleIds.map((roleId) => roleNameMap.get(roleId)).filter(Boolean);
    member.discordRoleIds = discordRoleIds;
    member.roleMode = member.roleMode || 'manual';
    member.departmentMode = member.departmentMode || (member.department ? 'manual' : 'discord');
    if (member.roleMode === 'discord') member.roleId = mappedRoleId;
    if (member.departmentMode === 'discord') {
      member.department = cleanText(mappedRole.department || member.department, 160);
      member.rank = cleanText(mappedRole.defaultRank || member.rank, 160);
    }
    member.status = member.status || 'Active';
    member.updatedAt = timestamp;
  } else {
    member = {
      id: randomId('member'),
      displayName,
      email: cleanEmail(discordUser.email || ''),
      discordId: String(discordUser.id),
      discordUsername: cleanText(discordUser.username, 120),
      characterName: '',
      department: cleanText(mappedRole.department, 160),
      departmentMode: 'discord',
      rank: cleanText(mappedRole.defaultRank, 160),
      roleId: mappedRoleId,
      roleMode: 'discord',
      status: 'Active',
      public: false,
      discordRoles: discordRoleIds.map((roleId) => roleNameMap.get(roleId)).filter(Boolean),
      discordRoleIds,
      notes: 'Linked through Discord sign-in.',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    members.push(member);
  }

  let user = users.find((item) => item.discordId === String(discordUser.id)) || users.find((item) => item.memberId === member.id);
  if (user) {
    user.displayName = displayName || user.displayName;
    user.memberId = member.id;
    user.discordId = String(discordUser.id);
    user.discordUsername = cleanText(discordUser.username, 120);
    user.discordEmail = cleanEmail(discordUser.email || '');
    user.roleMode = user.roleMode || (user.passwordHash ? 'manual' : 'discord');
    if (user.roleMode === 'discord') user.roleId = mappedRoleId;
    user.authProvider = user.passwordHash ? (user.authProvider || 'local') : 'discord';
    user.active = user.active !== false;
    user.lastLoginAt = timestamp;
    user.updatedAt = timestamp;
  } else {
    user = {
      id: randomId('user'),
      email: `discord-${discordUser.id}@auth.blackstonerp.local`,
      displayName,
      roleId: mappedRoleId,
      roleMode: 'discord',
      memberId: member.id,
      active: true,
      authProvider: 'discord',
      discordId: String(discordUser.id),
      discordUsername: cleanText(discordUser.username, 120),
      discordEmail: cleanEmail(discordUser.email || ''),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: timestamp
    };
    users.unshift(user);
  }

  await redisPipeline(env, [
    ['SET', `${PREFIX}members`, JSON.stringify(members)],
    ['SET', `${PREFIX}users`, JSON.stringify(users)]
  ]);
  await issueSession(req, res, env, user, [clearCookie(OAUTH_STATE_COOKIE, req, 'Lax')]);
  await appendAudit(env, { actorId: user.id, actorName: user.displayName, action: 'auth.discord_login', entity: 'users', targetId: user.id });
  const origin = requestOrigin(req, env);
  return redirect(res, 302, `${origin}/admin.html`);
}

async function discordSync(env) {
  const token = String(env.DISCORD_BOT_TOKEN || '');
  const guildId = cleanText(env.DISCORD_GUILD_ID || '', 30);
  if (!token || !guildId) throw new Error('DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required for Discord sync.');

  const headers = { Authorization: `Bot ${token}`, Accept: 'application/json', 'User-Agent': 'BlackstoneRP-Website/4.7' };
  const rolesResponse = await fetchWithTimeout(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers, cache: 'no-store' }, DISCORD_TIMEOUT_MS);
  if (!rolesResponse.ok) throw new Error(`Discord roles request failed (${rolesResponse.status}).`);
  const discordRoles = await rolesResponse.json();
  const roleMap = new Map(discordRoles.map((role) => [String(role.id), cleanText(role.name, 120)]));

  const guildMembers = [];
  let after = '0';
  for (let page = 0; page < 10; page += 1) {
    const response = await fetchWithTimeout(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`, { headers, cache: 'no-store' }, DISCORD_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Discord members request failed (${response.status}). Enable Server Members Intent and check bot permissions.`);
    const batch = await response.json();
    if (!Array.isArray(batch)) break;
    guildMembers.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1]?.user?.id || after;
  }

  const [members, users, websiteRoles] = await Promise.all([
    getJson(env, 'members', []),
    getJson(env, 'users', []),
    getJson(env, 'roles', defaultData().roles)
  ]);
  const roleMappingConfigured = websiteRoles.some((role) => Array.isArray(role.discordRoleIds) && role.discordRoleIds.length > 0);
  const byDiscordId = new Map(members.filter((item) => item.discordId).map((item) => [String(item.discordId), item]));
  const timestamp = nowIso();
  let created = 0;
  let updated = 0;
  let roleLinksApplied = 0;
  let manualRolesPreserved = 0;
  let departmentLinksApplied = 0;

  for (const guildMember of guildMembers) {
    const discordUser = guildMember.user || {};
    if (!discordUser.id || discordUser.bot) continue;
    const discordRoleIds = (guildMember.roles || []).map(String);
    const roleNames = discordRoleIds.map((roleId) => roleMap.get(roleId)).filter(Boolean);
    const displayName = cleanText(guildMember.nick || discordUser.global_name || discordUser.username || 'Discord Member', 120);
    const mappedRole = mappedWebsiteRoleRecord(discordRoleIds, websiteRoles);
    const mappedRoleId = mappedRole.id;
    const existing = byDiscordId.get(String(discordUser.id));
    if (existing) {
      existing.displayName = existing.displayName || displayName;
      existing.discordUsername = cleanText(discordUser.username, 120);
      existing.discordRoles = roleNames;
      existing.discordRoleIds = discordRoleIds;
      existing.roleMode = existing.roleMode || 'manual';
      existing.departmentMode = existing.departmentMode || (existing.department ? 'manual' : 'discord');
      if (roleMappingConfigured && existing.roleMode === 'discord') {
        existing.roleId = mappedRoleId;
        roleLinksApplied += 1;
      } else if (roleMappingConfigured && existing.roleMode === 'manual') {
        manualRolesPreserved += 1;
      }
      if (existing.departmentMode === 'discord') {
        existing.department = cleanText(mappedRole.department || '', 160);
        existing.rank = cleanText(mappedRole.defaultRank || existing.rank, 160);
        if (mappedRole.department) departmentLinksApplied += 1;
      }
      existing.updatedAt = timestamp;
      updated += 1;
    } else {
      const record = {
        id: randomId('member'),
        displayName,
        email: '',
        discordId: String(discordUser.id),
        discordUsername: cleanText(discordUser.username, 120),
        characterName: '',
        department: cleanText(mappedRole.department, 160),
        departmentMode: 'discord',
        rank: cleanText(mappedRole.defaultRank, 160),
        roleId: roleMappingConfigured ? mappedRoleId : 'member',
        roleMode: 'discord',
        status: 'Active',
        public: false,
        discordRoles: roleNames,
        discordRoleIds,
        notes: 'Imported from Discord.',
        createdAt: timestamp,
        updatedAt: timestamp
      };
      members.push(record);
      byDiscordId.set(String(discordUser.id), record);
      created += 1;
      if (roleMappingConfigured) roleLinksApplied += 1;
      if (mappedRole.department) departmentLinksApplied += 1;
    }
  }

  for (const user of users) {
    if (user.authProvider !== 'discord' || !user.discordId) continue;
    const member = byDiscordId.get(String(user.discordId));
    if (!member) continue;
    user.memberId = member.id;
    user.roleMode = user.roleMode || 'discord';
    if (roleMappingConfigured && user.roleMode === 'discord' && member.roleMode === 'discord') user.roleId = member.roleId;
    user.discordUsername = member.discordUsername;
    user.updatedAt = timestamp;
  }

  await redisPipeline(env, [
    ['SET', `${PREFIX}members`, JSON.stringify(members)],
    ['SET', `${PREFIX}users`, JSON.stringify(users)]
  ]);
  return {
    totalDiscordMembers: guildMembers.length,
    created,
    updated,
    roles: discordRoles.length,
    roleMappingConfigured,
    roleLinksApplied,
    manualRolesPreserved,
    departmentLinksApplied
  };
}

function canReadAdminEntity(user, entity) {
  if (hasPermission(user, ENTITY_PERMISSIONS[entity])) return true;
  if (entity === 'roles') return hasPermission(user, 'users.manage') || hasPermission(user, 'members.manage');
  if (entity === 'members') return hasPermission(user, 'users.manage');
  if (entity === 'departments') return hasPermission(user, 'members.manage');
  return false;
}

async function handlePortal(req, res, env = process.env) {
  const requestId = randomId('req');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('X-Request-ID', requestId);
  if (req.method === 'OPTIONS') return json(res, 204, {});

  const action = cleanText(req.query?.action || 'public', 80).toLowerCase();

  try {
    const body = readBody(req);
    if (action === 'public' && req.method === 'GET') {
      return json(
        res,
        200,
        { ok: true, ...(await getPublicPayload(env)) },
        'public, max-age=5, s-maxage=15, stale-while-revalidate=60'
      );
    }

    if (action === 'setup-status' && req.method === 'GET') {
      const databaseConfigured = isRedisConfigured(env);
      let bootstrapAdminConfigured = Boolean(env.ADMIN_EMAIL && String(env.ADMIN_PASSWORD || '').length >= 10);
      if (databaseConfigured) {
        try {
          await ensureSeeded(env);
          const users = await getJson(env, 'users', []);
          bootstrapAdminConfigured = bootstrapAdminConfigured || users.some((user) => user.active !== false && user.roleId === 'founder');
        } catch {}
      }
      return json(res, 200, {
        ok: true,
        databaseConfigured,
        authConfigured: authSecret(env).length >= 32,
        bootstrapAdminConfigured,
        siteUrlConfigured: Boolean(requestOrigin(req, env)),
        discordSyncConfigured: Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID),
        discordOAuthConfigured: discordOAuthConfigured(env)
      });
    }

    if (action === 'discord-login' && req.method === 'GET') {
      return await startDiscordOAuth(req, res, env);
    }

    if (action === 'discord-callback' && req.method === 'GET') {
      await ensureSeeded(env);
      return await completeDiscordOAuth(req, res, env);
    }

    if (!isRedisConfigured(env)) {
      return json(res, 503, { ok: false, setupRequired: true, message: 'Connect an Upstash Redis database to the Vercel project before using accounts, applications or admin tools.' });
    }
    await ensureSeeded(env);

    if (action === 'apply' && req.method === 'POST') {
      if (cleanText(body.website || body.company || '', 200)) return json(res, 201, { ok: true, submittedAt: nowIso() });
      const settings = await getJson(env, 'settings', defaultData().settings);
      if (settings.applicationsOpen === false) return json(res, 403, { ok: false, message: 'Blackstone RP applications are currently closed.' });
      const allowed = await rateLimit(env, `apply:${clientIp(req)}`, 5, 24 * 60 * 60);
      if (!allowed) return json(res, 429, { ok: false, message: 'Too many applications were submitted from this connection. Try again later.' });
      validateApplication(body);
      const applications = await getJson(env, 'applications', []);
      const item = sanitizeEntityItem('applications', { ...body, status: 'Pending', staffNotes: '' });
      applications.unshift(item);
      await setJson(env, 'applications', applications);
      await appendAudit(env, { actorId: 'public', actorName: cleanText(body.discord, 160), action: 'application.submitted', entity: 'applications', targetId: item.id });
      return json(res, 201, { ok: true, applicationId: item.id, submittedAt: item.submittedAt });
    }

    if (action === 'login' && req.method === 'POST') {
      const email = cleanEmail(body.email);
      const password = String(body.password || '');
      const ipAllowed = await rateLimit(env, `login-ip:${clientIp(req)}`, 20, 15 * 60);
      const accountKey = crypto.createHash('sha256').update(email || 'missing').digest('hex').slice(0, 32);
      const accountAllowed = await rateLimit(env, `login-account:${accountKey}`, 8, 15 * 60);
      if (!ipAllowed || !accountAllowed) return json(res, 429, { ok: false, message: 'Too many login attempts. Try again in 15 minutes.' });
      const values = await redisCommand(env, ['MGET', `${PREFIX}users`, `${PREFIX}roles`]);
      let users = [];
      let roles = defaultData().roles;
      try { users = values?.[0] ? JSON.parse(values[0]) : []; } catch { users = []; }
      try { roles = values?.[1] ? JSON.parse(values[1]) : defaultData().roles; } catch { roles = defaultData().roles; }
      const user = users.find((candidate) => candidate.email === email && candidate.active !== false);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return json(res, 401, { ok: false, message: 'Incorrect email or password.' });
      }
      const safeUser = publicUser(user, roles);
      if (!safeUser.permissions.includes('dashboard.view')) {
        return json(res, 403, { ok: false, message: 'This account does not have authorised staff access.' });
      }
      user.lastLoginAt = nowIso();
      user.updatedAt = nowIso();
      await setJson(env, 'users', users);
      const csrfToken = await issueSession(req, res, env, user);
      await appendAudit(env, { actorId: user.id, actorName: user.displayName || user.email, action: 'auth.login', entity: 'users', targetId: user.id });
      return json(res, 200, { ok: true, user: safeUser, csrfToken });
    }

    if (action === 'refresh' && req.method === 'POST') {
      if (!allowedRequestOrigin(req, env)) return json(res, 403, { ok: false, message: 'Request origin was not accepted.' });
      const cookies = parseCookies(req);
      const payload = verifyToken(cookies[REFRESH_COOKIE], env, 'refresh');
      if (!payload?.sub || !payload?.sid) return json(res, 401, { ok: false, message: 'Session expired.' });
      const rawSession = await redisCommand(env, ['GETDEL', `${PREFIX}session:${payload.sid}`]);
      await redisCommand(env, ['SREM', `${PREFIX}user-sessions:${payload.sub}`, payload.sid]).catch(() => {});
      if (!rawSession) return json(res, 401, { ok: false, message: 'Session expired.' });
      let session;
      try { session = JSON.parse(rawSession); } catch { session = null; }
      if (!session || session.userId !== payload.sub || (session.fingerprint && session.fingerprint !== sessionFingerprint(req))) {
        return json(res, 401, { ok: false, message: 'Session expired.' });
      }
      const values = await redisCommand(env, ['MGET', `${PREFIX}users`, `${PREFIX}roles`]);
      let users = [];
      let roles = defaultData().roles;
      try { users = values?.[0] ? JSON.parse(values[0]) : []; } catch { users = []; }
      try { roles = values?.[1] ? JSON.parse(values[1]) : defaultData().roles; } catch { roles = defaultData().roles; }
      const user = users.find((candidate) => candidate.id === payload.sub && candidate.active !== false);
      if (!user) return json(res, 401, { ok: false, message: 'Account unavailable.' });
      const safeUser = publicUser(user, roles);
      if (!safeUser.permissions.includes('dashboard.view')) return json(res, 403, { ok: false, message: 'Staff access is no longer available.' });
      const csrfToken = await issueSession(req, res, env, user);
      return json(res, 200, { ok: true, user: safeUser, csrfToken });
    }

    if (action === 'logout' && req.method === 'POST') {
      if (!allowedRequestOrigin(req, env)) return json(res, 403, { ok: false, message: 'Request origin was not accepted.' });
      const cookies = parseCookies(req);
      const payload = verifyToken(cookies[REFRESH_COOKIE], env, 'refresh');
      if (payload?.sid) {
        await redisPipeline(env, [
          ['DEL', `${PREFIX}session:${payload.sid}`],
          ['SREM', `${PREFIX}user-sessions:${payload.sub}`, payload.sid]
        ]).catch(() => {});
      }
      res.setHeader('Set-Cookie', [clearCookie(ACCESS_COOKIE, req), clearCookie(REFRESH_COOKIE, req), clearCookie(OAUTH_STATE_COOKIE, req, 'Lax')]);
      return json(res, 200, { ok: true });
    }

    const currentUser = await authenticate(req, env);
    if (!currentUser) return json(res, 401, { ok: false, message: 'Sign in required.' });
    if (!requireCsrf(req, currentUser, env)) return json(res, 403, { ok: false, message: 'Security token mismatch. Refresh the page and try again.' });

    if (action === 'me' && req.method === 'GET') {
      const members = await getJson(env, 'members', []);
      const member = currentUser.memberId ? members.find((item) => item.id === currentUser.memberId) : members.find((item) => item.email && item.email === currentUser.email);
      return json(res, 200, { ok: true, user: currentUser, member: member || null, csrfToken: currentUser.csrf });
    }

    if (action === 'profile' && ['PUT', 'POST'].includes(req.method)) {
      const users = await getJson(env, 'users', []);
      const members = await getJson(env, 'members', []);
      const userRecord = users.find((item) => item.id === currentUser.id);
      if (!userRecord) return json(res, 404, { ok: false, message: 'Account not found.' });
      let member = userRecord.memberId ? members.find((item) => item.id === userRecord.memberId) : members.find((item) => item.email === userRecord.email);
      const input = {
        ...(member || {}),
        displayName: cleanText(body.displayName || currentUser.displayName, 120),
        email: currentUser.email,
        discordId: cleanText(body.discordId || member?.discordId, 30),
        discordUsername: cleanText(body.discordUsername || member?.discordUsername, 120),
        characterName: cleanText(body.characterName || member?.characterName, 160),
        department: member?.department || '',
        rank: member?.rank || '',
        roleId: member?.roleId || currentUser.roleId,
        status: member?.status || 'Active',
        public: member?.public || false,
        notes: member?.notes || ''
      };
      if (member) {
        const index = members.findIndex((item) => item.id === member.id);
        member = sanitizeEntityItem('members', input, member);
        members[index] = member;
      } else {
        member = sanitizeEntityItem('members', input);
        members.push(member);
      }
      userRecord.memberId = member.id;
      userRecord.displayName = member.displayName;
      userRecord.updatedAt = nowIso();
      await redisPipeline(env, [
        ['SET', `${PREFIX}members`, JSON.stringify(members)],
        ['SET', `${PREFIX}users`, JSON.stringify(users)]
      ]);
      await appendAudit(env, { actorId: currentUser.id, actorName: currentUser.displayName, action: 'profile.updated', entity: 'members', targetId: member.id });
      return json(res, 200, { ok: true, member });
    }

    if (action === 'change-password' && req.method === 'POST') {
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 10 || newPassword.length > MAX_PASSWORD_LENGTH) return json(res, 400, { ok: false, message: `New password must be between 10 and ${MAX_PASSWORD_LENGTH} characters.` });
      const users = await getJson(env, 'users', []);
      const userRecord = users.find((item) => item.id === currentUser.id);
      if (!userRecord || !(await verifyPassword(currentPassword, userRecord.passwordHash))) {
        return json(res, 400, { ok: false, message: 'Current password is incorrect.' });
      }
      userRecord.passwordHash = await hashPassword(newPassword);
      userRecord.updatedAt = nowIso();
      await setJson(env, 'users', users);
      await revokeUserSessions(env, currentUser.id);
      res.setHeader('Set-Cookie', [clearCookie(ACCESS_COOKIE, req), clearCookie(REFRESH_COOKIE, req)]);
      await appendAudit(env, { actorId: currentUser.id, actorName: currentUser.displayName, action: 'auth.password_changed', entity: 'users', targetId: currentUser.id });
      return json(res, 200, { ok: true, reauthenticate: true });
    }

    if (action === 'admin-dashboard' && req.method === 'GET') {
      if (!hasPermission(currentUser, 'dashboard.view')) return json(res, 403, { ok: false, message: 'Permission denied.' });
      const data = await getAllData(env);
      return json(res, 200, {
        ok: true,
        counts: {
          members: data.members.length,
          accounts: data.users.length,
          pendingApplications: data.applications.filter((item) => item.status === 'Pending').length,
          announcements: data.announcements.filter((item) => item.published).length,
          departments: data.departments.length,
          events: data.events.filter((item) => item.published).length,
          shop: data.shop.filter((item) => item.published).length,
          images: data.images.filter((item) => item.published).length
        },
        recentApplications: data.applications.slice(0, 5),
        recentAudit: hasPermission(currentUser, 'audit.view') ? data.audit.slice(0, 10) : []
      });
    }

    if (action === 'admin-list' && req.method === 'GET') {
      const entity = cleanText(req.query?.entity, 40);
      if (!ADMIN_ENTITIES.has(entity)) return json(res, 400, { ok: false, message: 'Unknown admin section.' });
      if (!canReadAdminEntity(currentUser, entity)) return json(res, 403, { ok: false, message: 'Permission denied.' });
      const value = await getJson(env, entity, entity === 'settings' ? defaultData().settings : []);
      let items = value;
      if (entity === 'users') {
        const roles = await getJson(env, 'roles', defaultData().roles);
        items = value.map((user) => ({ ...publicUser(user, roles), createdAt: user.createdAt, updatedAt: user.updatedAt, lastLoginAt: user.lastLoginAt }));
      }
      return json(res, 200, { ok: true, entity, items });
    }

    if (action === 'admin-save' && ['POST', 'PUT'].includes(req.method)) {
      const entity = cleanText(body.entity || req.query?.entity, 40);
      if (!ADMIN_ENTITIES.has(entity)) return json(res, 400, { ok: false, message: 'Unknown admin section.' });
      const permission = ENTITY_PERMISSIONS[entity];
      if (!hasPermission(currentUser, permission)) return json(res, 403, { ok: false, message: 'Permission denied.' });

      if (entity === 'settings') {
        const existing = await getJson(env, 'settings', defaultData().settings);
        const item = sanitizeEntityItem('settings', body.item || {}, existing);
        validateEntityItem('settings', item);
        await setJson(env, 'settings', item);
        invalidatePublicCache();
        await appendAudit(env, { actorId: currentUser.id, actorName: currentUser.displayName, action: 'settings.updated', entity, targetId: 'settings' });
        return json(res, 200, { ok: true, item });
      }

      const list = await getJson(env, entity, []);
      const input = body.item || {};
      const originalId = cleanText(body.originalId || input.originalId || '', 120);
      const lookupId = originalId || cleanText(input.id, 120);
      const index = list.findIndex((candidate) => candidate.id === lookupId);
      const existing = index >= 0 ? list[index] : null;
      if (entity === 'roles' && !originalId && existing) return json(res, 409, { ok: false, message: 'A role with that ID already exists.' });
      let item;
      if (entity === 'users') {
        const roles = await getJson(env, 'roles', defaultData().roles);
        if (existing) assertTargetManageable(currentUser, roles, existing.roleId);
        assertRoleAssignmentAllowed(currentUser, roles, input.roleId || existing?.roleId || 'member');
        if (existing?.id === currentUser.id && bool(input.active, existing.active !== false) === false) {
          return json(res, 400, { ok: false, message: 'You cannot deactivate your own account.' });
        }
        const duplicate = list.find((candidate) => candidate.email === cleanEmail(input.email) && candidate.id !== existing?.id);
        if (duplicate) return json(res, 409, { ok: false, message: 'An account already uses that email address.' });
        item = await sanitizeUserInput(input, existing);
      } else {
        if (entity === 'members') {
          const roles = await getJson(env, 'roles', defaultData().roles);
          if (existing) assertTargetManageable(currentUser, roles, existing.roleId);
          assertRoleAssignmentAllowed(currentUser, roles, input.roleId || existing?.roleId || 'member');
        }
        item = sanitizeEntityItem(entity, input, existing);
      }
      validateEntityItem(entity, item);
      let syncWarning = '';
      if (entity === 'announcements') {
        try {
          const synced = await syncAnnouncementToDiscord(env, item, existing);
          item = synced.item;
          syncWarning = cleanText(synced.warning, 500);
        } catch (error) {
          syncWarning = `Announcement saved on the website, but Discord sync failed: ${cleanText(error.message, 300)}`;
        }
      }
      if (index >= 0) list[index] = item;
      else list.unshift(item);
      await setJson(env, entity, list);
      if (PUBLIC_ENTITIES.has(entity) || entity === 'members') invalidatePublicCache();
      if (entity === 'users' && existing && (existing.active !== item.active || existing.roleId !== item.roleId || existing.passwordHash !== item.passwordHash)) {
        await revokeUserSessions(env, item.id);
      }
      await appendAudit(env, { actorId: currentUser.id, actorName: currentUser.displayName, action: existing ? `${entity}.updated` : `${entity}.created`, entity, targetId: item.id, details: syncWarning ? { syncWarning } : undefined });
      const responseItem = entity === 'users' ? { ...item, passwordHash: undefined } : item;
      return json(res, existing ? 200 : 201, { ok: true, item: responseItem, warning: syncWarning || undefined });
    }

    if (action === 'admin-delete' && req.method === 'DELETE') {
      const entity = cleanText(body.entity || req.query?.entity, 40);
      const id = cleanText(body.id || req.query?.id, 120);
      if (!ADMIN_ENTITIES.has(entity) || entity === 'settings') return json(res, 400, { ok: false, message: 'Unknown or protected admin section.' });
      const permission = ENTITY_PERMISSIONS[entity];
      if (!hasPermission(currentUser, permission)) return json(res, 403, { ok: false, message: 'Permission denied.' });
      if (entity === 'users' && id === currentUser.id) return json(res, 400, { ok: false, message: 'You cannot delete your own account.' });
      const list = await getJson(env, entity, []);
      const target = list.find((item) => item.id === id);
      if (!target) return json(res, 404, { ok: false, message: 'Record not found.' });
      if (['users', 'members'].includes(entity)) {
        const roles = await getJson(env, 'roles', defaultData().roles);
        assertTargetManageable(currentUser, roles, target.roleId);
      }
      if (entity === 'roles' && target.system) return json(res, 400, { ok: false, message: 'System roles cannot be deleted.' });
      let syncWarning = '';
      if (entity === 'announcements') {
        try {
          await deleteAnnouncementFromDiscord(env, target);
        } catch (error) {
          syncWarning = `Website record deleted, but the Discord message could not be removed: ${cleanText(error.message, 300)}`;
        }
      }
      const filtered = list.filter((item) => item.id !== id);
      await setJson(env, entity, filtered);
      if (PUBLIC_ENTITIES.has(entity) || entity === 'members') invalidatePublicCache();
      if (entity === 'users') await revokeUserSessions(env, id);
      await appendAudit(env, { actorId: currentUser.id, actorName: currentUser.displayName, action: `${entity}.deleted`, entity, targetId: id, details: syncWarning ? { syncWarning } : undefined });
      return json(res, 200, { ok: true, warning: syncWarning || undefined });
    }

    if (action === 'discord-sync' && req.method === 'POST') {
      if (!hasPermission(currentUser, 'discord.sync')) return json(res, 403, { ok: false, message: 'Permission denied.' });
      const result = await discordSync(env);
      invalidatePublicCache();
      await appendAudit(env, { actorId: currentUser.id, actorName: currentUser.displayName, action: 'discord.synced', entity: 'members', targetId: 'discord', details: result });
      return json(res, 200, { ok: true, result });
    }

    if (action === 'admin-export' && req.method === 'GET') {
      if (!hasPermission(currentUser, 'settings.manage')) return json(res, 403, { ok: false, message: 'Permission denied.' });
      const data = await getAllData(env);
      data.users = data.users.map(({ passwordHash, ...user }) => user);
      await appendAudit(env, { actorId: currentUser.id, actorName: currentUser.displayName, action: 'data.exported', entity: 'settings', targetId: 'all' });
      return json(res, 200, { ok: true, exportedAt: nowIso(), data });
    }

    return json(res, 404, { ok: false, message: 'Unknown endpoint.' });
  } catch (error) {
    const status = Number(error?.status || 0) || (['DATABASE_NOT_CONFIGURED', 'AUTH_NOT_CONFIGURED'].includes(error?.code) ? 503 : 500);
    if (status >= 500) console.error('[Blackstone portal]', { requestId, action, code: error?.code || 'UNEXPECTED_ERROR', message: cleanText(error?.message, 500) });
    if (action === 'discord-callback') {
      const origin = requestOrigin(req, env);
      const message = status < 500 ? cleanText(error.message || 'Discord sign-in failed.', 240) : 'Discord sign-in failed. Please try again or contact staff.';
      if (origin) return redirect(res, 302, `${origin}/login.html?loginError=${encodeURIComponent(message)}`);
    }
    const setupRequired = ['DATABASE_NOT_CONFIGURED', 'AUTH_NOT_CONFIGURED'].includes(error?.code);
    const publicMessage = status >= 500 && !setupRequired
      ? 'The website service encountered an unexpected error. Please try again.'
      : cleanText(error?.message || 'Request failed.', 300);
    return json(res, status, {
      ok: false,
      setupRequired,
      message: publicMessage,
      errorCode: cleanText(error?.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'), 80),
      requestId
    });
  }

}

module.exports = { handlePortal, ALL_PERMISSIONS, getDiscordAnnouncements, discordAnnouncementsConfigured };
