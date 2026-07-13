(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  // Progressive enhancement: the website remains fully readable without JavaScript.
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('animations-ready');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
    );
    $$('.reveal').forEach((element) => observer.observe(element));
  } else {
    $$('.reveal').forEach((element) => element.classList.add('visible'));
  }

  const header = $('.site-header');
  const navToggle = $('#navToggle');
  const navMenu = $('#navMenu');
  const cursorGlow = $('#cursorGlow');

  window.addEventListener('scroll', () => {
    header?.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  navToggle?.addEventListener('click', () => {
    if (!navMenu) return;
    const open = navMenu.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  $$('.nav a').forEach((link) => {
    link.addEventListener('click', () => {
      navMenu?.classList.remove('open');
      navToggle?.setAttribute('aria-expanded', 'false');
    });
  });

  // Throttle the decorative cursor glow to one DOM write per animation frame.
  // It is disabled on touch/coarse-pointer devices where it cannot be used.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches && !reducedMotion;
  let cursorFrame = 0;
  let cursorX = 0;
  let cursorY = 0;
  if (cursorGlow && finePointer) {
    window.addEventListener('mousemove', (event) => {
      cursorX = event.clientX;
      cursorY = event.clientY;
      if (cursorFrame) return;
      cursorFrame = window.requestAnimationFrame(() => {
        cursorFrame = 0;
        cursorGlow.style.transform = `translate3d(${cursorX - 190}px, ${cursorY - 190}px, 0)`;
      });
    }, { passive: true });
  } else if (cursorGlow) {
    cursorGlow.hidden = true;
  }

  const counters = $$('[data-count]');
  if ('IntersectionObserver' in window && counters.length) {
    const countObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target;
          const target = Number(element.dataset.count || 0);
          let current = 0;
          const step = Math.max(1, Math.floor(target / 45));
          const timer = window.setInterval(() => {
            current += step;
            if (current >= target) {
              current = target;
              window.clearInterval(timer);
            }
            element.textContent = String(current);
          }, 28);
          countObserver.unobserve(element);
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((counter) => countObserver.observe(counter));
  }

  const departments = {
    police: {
      code: 'LSPD // 01',
      title: 'Protect. Serve. Investigate.',
      text: 'Patrol the city, respond to critical incidents, investigate organised crime and build cases with advanced policing tools.',
      items: ['Structured ranks and training', 'Specialist divisions', 'Advanced evidence systems'],
      num: '01'
    },
    ems: {
      code: 'EMS // 02',
      title: 'Respond. Treat. Save.',
      text: 'Provide emergency medical care, manage major incidents and support realistic injury roleplay throughout the city.',
      items: ['Clinical training pathways', 'Emergency response units', 'Hospital roleplay systems'],
      num: '02'
    },
    fire: {
      code: 'FIRE // 03',
      title: 'Respond. Rescue. Protect.',
      text: 'Fight fires, perform technical rescues, manage hazardous incidents and support major emergency scenes across the city.',
      items: ['Fire and rescue training', 'Specialist response units', 'Major incident operations'],
      num: '03'
    },
    civilian: {
      code: 'CIV // 04',
      title: 'Create. Trade. Build.',
      text: 'Start a business, develop relationships, build a career and shape the social and economic life of Blackstone.',
      items: ['Player-owned businesses', 'Custom civilian careers', 'Property and lifestyle progression'],
      num: '04'
    },
    criminal: {
      code: 'ORG // 05',
      title: 'Plan. Risk. Rise.',
      text: 'Build your network through street-level crime, organised operations and high-risk opportunities with real consequences.',
      items: ['Progressive criminal systems', 'Gang and organisation pathways', 'Investigation-driven consequences'],
      num: '05'
    }
  };

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const department = departments[tab.dataset.tab];
      if (!department) return;
      $$('.tab').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      const code = $('#departmentCode');
      const title = $('#departmentTitle');
      const text = $('#departmentText');
      const list = $('#departmentList');
      const art = $('#departmentArt > span');
      if (code) code.textContent = department.code;
      if (title) title.textContent = department.title;
      if (text) text.textContent = department.text;
      if (list) { const fragment=document.createDocumentFragment(); department.items.forEach((value)=>{const li=document.createElement('li');li.textContent=value;fragment.append(li)});list.replaceChildren(fragment); }
      if (art) art.textContent = department.num;
    });
  });



  // Public shop. Products are created and maintained in the admin panel.
  const shopGrid = $('#shopGrid');
  const shopStatus = $('#shopStatus');
  const tebexStoreBar = $('#tebexStoreBar');
  const tebexStoreLink = $('#tebexStoreLink');
  let shopLoaded = false;

  function safeHttpsUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function createShopCard(item) {
    const card = document.createElement('article');
    card.className = `shop-card${item.featured ? ' featured' : ''}`;

    const imageWrap = document.createElement('div');
    imageWrap.className = 'shop-image';
    const image = document.createElement('img');
    const imageUrl = safeHttpsUrl(item.imageUrl);
    image.src = imageUrl || 'assets/blackstone-logo.webp';
    image.alt = item.title ? `${item.title} shop item` : 'Blackstone RP shop item';
    image.loading = 'lazy';
    image.decoding = 'async';
    if (!imageUrl) imageWrap.classList.add('logo-fallback');
    image.addEventListener('error', () => {
      if (image.dataset.fallbackApplied === 'true') return;
      image.dataset.fallbackApplied = 'true';
      image.src = 'assets/blackstone-logo.webp';
      imageWrap.classList.add('logo-fallback');
    });

    const stock = document.createElement('span');
    stock.className = `shop-stock${item.soldOut ? ' sold-out' : ''}`;
    stock.textContent = item.soldOut ? 'SOLD OUT' : 'AVAILABLE';
    imageWrap.append(image, stock);

    const copy = document.createElement('div');
    copy.className = 'shop-card-copy';
    const category = document.createElement('span');
    category.textContent = item.category || 'BLACKSTONE SHOP';
    const title = document.createElement('h3');
    title.textContent = item.title || 'Shop Item';
    const description = document.createElement('p');
    description.textContent = item.description || 'More information will be available soon.';

    const footer = document.createElement('div');
    footer.className = 'shop-card-footer';
    const price = document.createElement('strong');
    price.className = 'shop-price';
    price.textContent = item.priceLabel || 'View Details';

    const purchaseUrl = safeHttpsUrl(item.purchaseUrl);
    let action;
    if (purchaseUrl && !item.soldOut) {
      action = document.createElement('a');
      action.href = purchaseUrl;
      action.target = '_blank';
      action.rel = 'noopener noreferrer';
      action.className = 'shop-action';
      action.textContent = item.buttonLabel || 'View Item';
    } else {
      action = document.createElement('span');
      action.className = 'shop-action disabled';
      action.textContent = item.soldOut ? 'Sold Out' : 'Coming Soon';
    }

    footer.append(price, action);
    copy.append(category, title, description, footer);
    card.append(imageWrap, copy);
    return card;
  }

  function renderShop(items, configured = true, settings = {}) {
    const tebexUrl = safeHttpsUrl(settings?.tebexStoreUrl);
    const tebexEnabled = settings?.tebexEnabled !== false && Boolean(tebexUrl);
    if (tebexStoreBar && tebexStoreLink) {
      tebexStoreBar.hidden = !tebexEnabled;
      if (tebexEnabled) tebexStoreLink.href = tebexUrl;
    }
    if (!shopGrid) return;
    const list = Array.isArray(items) ? items : [];
    shopGrid.replaceChildren();
    shopGrid.setAttribute('aria-busy', 'false');

    if (!list.length) {
      const empty = document.createElement('article');
      empty.className = 'shop-empty glass-card';
      const label = document.createElement('span');
      label.textContent = configured ? 'BLACKSTONE STORE' : 'SHOP SETUP';
      const title = document.createElement('h3');
      title.textContent = configured ? 'NEW ITEMS COMING SOON.' : 'SHOP CONNECTION NOT CONFIGURED.';
      const message = document.createElement('p');
      message.textContent = configured
        ? 'There are no published shop items right now. Check back soon or join Discord for store updates.'
        : 'Connect the website database, then add products from Shop inside the administration panel.';
      empty.append(label, title, message);
      shopGrid.append(empty);
      if (shopStatus) shopStatus.textContent = configured ? 'NO PUBLISHED ITEMS · CHECK BACK SOON' : 'ADMIN SETUP REQUIRED';
      return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach((item) => fragment.append(createShopCard(item)));
    shopGrid.append(fragment);
    if (shopStatus) shopStatus.textContent = `${list.length} ITEM${list.length === 1 ? '' : 'S'} CURRENTLY LISTED`;
  }

  async function loadShop() {
    if (!shopGrid || shopLoaded) return;
    shopLoaded = true;
    try {
      const response = await fetch('api/portal?action=public', {
        headers: { Accept: 'application/json' },
        cache: 'default',
        credentials: 'same-origin'
      });
      if (!response.ok) throw new Error(`Shop request failed (${response.status}).`);
      const payload = await response.json();
      renderShop(payload.shop, payload.configured !== false, payload.settings || {});
    } catch (error) {
      console.warn('Blackstone RP shop update failed:', error);
      shopLoaded = false;
      renderShop([], true);
      if (shopStatus) shopStatus.textContent = 'SHOP TEMPORARILY UNAVAILABLE';
    }
  }

  const shopSection = shopGrid?.closest('section');
  if (shopSection && 'IntersectionObserver' in window) {
    const shopObserver = new IntersectionObserver((entries, observer) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      loadShop();
    }, { rootMargin: '500px 0px' });
    shopObserver.observe(shopSection);
  } else {
    loadShop();
  }

  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  const modal = $('#trailerModal');
  const trailerButton = $('#trailerButton');
  trailerButton?.addEventListener('click', () => {
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
  });
  modal?.querySelectorAll('[data-close]').forEach((element) => {
    element.addEventListener('click', () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      modal?.classList.remove('open');
      modal?.setAttribute('aria-hidden', 'true');
    }
  });

  // Discord-powered gallery. The bot token is used only by the server-side endpoint.
  const galleryConfig = {
    refreshMs: 180000,
    requestTimeoutMs: 6000,
    maxImages: 24
  };

  const galleryElements = {
    grid: $('#discordGallery'),
    status: $('#galleryStatus'),
    refresh: $('#refreshGallery'),
    empty: $('#galleryEmpty'),
    emptyTitle: $('#galleryEmptyTitle'),
    emptyMessage: $('#galleryEmptyMessage'),
    modal: $('#galleryModal'),
    modalImage: $('#galleryModalImage'),
    modalCaption: $('#galleryModalCaption')
  };

  let galleryRequestInProgress = false;

  function setGalleryText(element, value) {
    if (element) element.textContent = value;
  }

  function isAllowedGalleryUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname);
    } catch {
      return false;
    }
  }

  function getGallerySources() {
    if (!['http:', 'https:'].includes(window.location.protocol)) return [];
    return [[new URL('api/discord-gallery', document.baseURI).href, 'WEBSITE GALLERY API']];
  }

  async function fetchGallerySource(url, label) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), galleryConfig.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'default',
        signal: controller.signal
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`${label} returned an invalid response.`);
      }

      if (!response.ok || payload?.ok === false) {
        const error = new Error(payload?.message || `${label} request failed (${response.status}).`);
        error.payload = payload;
        throw error;
      }

      if (!Array.isArray(payload?.images)) {
        throw new Error(`${label} returned no image list.`);
      }

      return payload;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function getDiscordGalleryData() {
    const sources = getGallerySources();
    if (!sources.length) {
      return {
        ok: false,
        configured: false,
        message: 'The live Discord gallery requires the website to be opened from its hosted address.'
      };
    }

    const errors = [];

    for (const [url, label] of sources) {
      try {
        return await fetchGallerySource(url, label);
      } catch (error) {
        if (error?.payload?.configured === false) {
          // A valid API response saying setup is missing will not be fixed by
          // retrying another endpoint on the same deployment.
          return error.payload;
        }
        const reason = error?.name === 'AbortError' ? 'request timed out' : error.message;
        errors.push(`${label}: ${reason}`);
      }
    }

    return {
      ok: false,
      configured: true,
      message: 'The Discord gallery feed is temporarily unavailable.'
    };
  }

  function closeGalleryModal() {
    if (!galleryElements.modal) return;
    galleryElements.modal.classList.remove('open');
    galleryElements.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('gallery-modal-open');
    if (galleryElements.modalImage) galleryElements.modalImage.removeAttribute('src');
  }

  function openGalleryModal(image) {
    if (!galleryElements.modal || !galleryElements.modalImage) return;
    galleryElements.modalImage.src = image.url;
    galleryElements.modalImage.alt = image.alt || image.caption || 'Blackstone RP gallery image';
    setGalleryText(galleryElements.modalCaption, image.caption || 'Blackstone RP community gallery');
    galleryElements.modal.classList.add('open');
    galleryElements.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gallery-modal-open');
  }

  galleryElements.modal?.querySelectorAll('[data-gallery-close]').forEach((element) => {
    element.addEventListener('click', closeGalleryModal);
  });

  function formatGalleryDate(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  }

  function createGalleryItem(image) {
    if (!image || !isAllowedGalleryUrl(image.url)) return null;

    const item = document.createElement('article');
    item.className = 'gallery-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-image-button';
    button.setAttribute('aria-label', `View ${image.caption || image.filename || 'gallery image'}`);

    const picture = document.createElement('img');
    picture.src = image.url;
    picture.alt = image.alt || image.caption || image.filename || 'Blackstone RP gallery image';
    picture.loading = 'lazy';
    picture.decoding = 'async';
    picture.referrerPolicy = 'no-referrer';
    if (Number(image.width) > 0) picture.width = Number(image.width);
    if (Number(image.height) > 0) picture.height = Number(image.height);
    button.appendChild(picture);
    button.addEventListener('click', () => openGalleryModal(image));

    const copy = document.createElement('div');
    copy.className = 'gallery-item-copy';

    const caption = document.createElement('p');
    caption.className = 'gallery-caption';
    caption.textContent = image.caption || 'Blackstone RP community screenshot';

    const date = document.createElement('time');
    date.className = 'gallery-date';
    date.dateTime = image.timestamp || '';
    date.textContent = formatGalleryDate(image.timestamp);

    copy.append(caption, date);
    item.append(button, copy);
    return item;
  }

  function showGalleryEmpty(title, message) {
    if (galleryElements.grid) {
      galleryElements.grid.replaceChildren();
      galleryElements.grid.hidden = true;
      galleryElements.grid.setAttribute('aria-busy', 'false');
    }
    if (galleryElements.empty) galleryElements.empty.hidden = false;
    setGalleryText(galleryElements.emptyTitle, title);
    setGalleryText(galleryElements.emptyMessage, message);
  }

  function renderDiscordGallery(payload) {
    const images = Array.isArray(payload.images)
      ? payload.images.filter((image) => isAllowedGalleryUrl(image?.url)).slice(0, galleryConfig.maxImages)
      : [];

    if (!images.length) {
      showGalleryEmpty(
        'NO GALLERY IMAGES YET',
        'Upload image attachments to the connected Discord channel and they will appear here automatically.'
      );
      setGalleryText(galleryElements.status, 'DISCORD CONNECTED · NO IMAGES');
      return;
    }

    const fragment = document.createDocumentFragment();
    images.forEach((image) => {
      const item = createGalleryItem(image);
      if (item) fragment.appendChild(item);
    });

    if (!fragment.childNodes.length) {
      showGalleryEmpty('NO SUPPORTED IMAGES', 'The gallery channel does not currently contain supported Discord image attachments.');
      return;
    }

    if (galleryElements.empty) galleryElements.empty.hidden = true;
    if (galleryElements.grid) {
      galleryElements.grid.hidden = false;
      galleryElements.grid.replaceChildren(fragment);
      galleryElements.grid.setAttribute('aria-busy', 'false');
    }

    const fetchedAt = new Date(payload.fetchedAt || Date.now());
    const time = fetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setGalleryText(galleryElements.status, `${images.length} IMAGE${images.length === 1 ? '' : 'S'} · UPDATED ${time}`);
  }

  async function updateDiscordGallery() {
    if (!galleryElements.grid || galleryRequestInProgress) return;
    galleryRequestInProgress = true;
    galleryElements.grid.hidden = false;
    galleryElements.grid.setAttribute('aria-busy', 'true');
    if (galleryElements.empty) galleryElements.empty.hidden = true;
    setGalleryText(galleryElements.status, 'CONNECTING TO DISCORD...');

    if (galleryElements.refresh) {
      galleryElements.refresh.disabled = true;
      galleryElements.refresh.textContent = 'REFRESHING...';
    }

    try {
      const payload = await getDiscordGalleryData();
      if (!payload.ok) {
        showGalleryEmpty(
          payload.configured === false ? 'DISCORD GALLERY NOT CONNECTED' : 'GALLERY TEMPORARILY UNAVAILABLE',
          payload.message || 'The Discord gallery feed could not be loaded.'
        );
        setGalleryText(galleryElements.status, payload.configured === false ? 'SETUP REQUIRED' : 'FEED UNAVAILABLE');
        return;
      }
      renderDiscordGallery(payload);
    } catch (error) {
      console.warn('Blackstone RP Discord gallery update failed:', error);
      showGalleryEmpty('GALLERY TEMPORARILY UNAVAILABLE', 'The Discord gallery feed could not be loaded. Please try again shortly.');
      setGalleryText(galleryElements.status, 'FEED UNAVAILABLE');
    } finally {
      galleryRequestInProgress = false;
      if (galleryElements.refresh) {
        galleryElements.refresh.disabled = false;
        galleryElements.refresh.textContent = 'REFRESH GALLERY';
      }
    }
  }

  let galleryStarted = false;
  function startDiscordGallery() {
    if (galleryStarted || !galleryElements.grid) return;
    galleryStarted = true;
    updateDiscordGallery();
    window.setInterval(() => {
      if (!document.hidden) updateDiscordGallery();
    }, galleryConfig.refreshMs);
  }

  galleryElements.refresh?.addEventListener('click', () => {
    startDiscordGallery();
    updateDiscordGallery();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeGalleryModal();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && galleryStarted && galleryElements.grid?.childElementCount === 0) updateDiscordGallery();
  });

  // The gallery is far below the fold. Delay its API call and image downloads
  // until the user is close to it, improving the initial page load.
  const gallerySection = galleryElements.grid?.closest('section');
  if (gallerySection && 'IntersectionObserver' in window) {
    const galleryObserver = new IntersectionObserver((entries, observer) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      startDiscordGallery();
    }, { rootMargin: '600px 0px' });
    galleryObserver.observe(gallerySection);
  } else {
    startDiscordGallery();
  }

  // Updated live FiveM server status.
  const serverConfig = {
    endpoint: '163.227.178.25:30123',
    joinCode: '4xlaj5',
    refreshMs: 30000,
    requestTimeoutMs: 5000,
    playerListLimit: 12
  };

  const liveElements = {
    card: $('#liveServerCard'),
    status: $('#liveStatusText'),
    message: $('#liveStatusMessage'),
    source: $('#statusSource'),
    name: $('#liveServerName'),
    players: $('#livePlayers'),
    maxPlayers: $('#liveMaxPlayers'),
    updated: $('#liveUpdated'),
    response: $('#liveResponse'),
    nextRefresh: $('#nextRefresh'),
    capacityFill: $('#capacityFill'),
    capacityText: $('#capacityText'),
    refresh: $('#refreshStatus'),
    copy: $('#copyEndpoint'),
    playerPanel: $('#livePlayersPanel'),
    playerList: $('#livePlayerList'),
    playerSummary: $('#livePlayerSummary'),
    heroStatus: $('#serverStatus'),
    heroPlayers: $('#heroPlayerCount'),
    networkStatus: $('#networkStatus')
  };

  let statusRequestInProgress = false;
  let nextRefreshAt = Date.now() + serverConfig.refreshMs;

  function text(element, value) {
    if (element) element.textContent = value;
  }

  function removeFiveMFormatting(value = '') {
    return String(value)
      .replace(/\^[0-9]/g, '')
      .replace(/\^[A-Za-z]/g, '')
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

  function parsePlayerList(data, payload) {
    const list = Array.isArray(data.players)
      ? data.players
      : Array.isArray(payload.playerList)
        ? payload.playerList
        : [];

    return list
      .map((player) => removeFiveMFormatting(typeof player === 'string' ? player : player?.name))
      .filter(Boolean);
  }

  function parseServerPayload(payload, source = 'LIVE FEED', responseMs = 0) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Empty server response.');
    }

    if (payload.online === false) {
      return {
        online: false,
        name: removeFiveMFormatting(payload.name) || 'BLACKSTONE RP',
        players: 0,
        maxPlayers: firstNumber(payload.maxPlayers),
        playerList: [],
        source: payload.source || source,
        message: payload.message || 'The server is currently offline or restarting.',
        checkedAt: payload.checkedAt || new Date().toISOString(),
        responseMs: firstNumber(payload.responseMs, payload.latencyMs, responseMs)
      };
    }

    const data = payload.Data ?? payload.data ?? payload;
    if (!data || typeof data !== 'object' || payload.error) {
      throw new Error('The server returned no usable data.');
    }

    const vars = data.vars ?? {};
    const playerList = parsePlayerList(data, payload);
    const players = firstNumber(
      data.clients,
      data.playerCount,
      payload.players,
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
    const rawName = data.hostname
      ?? payload.name
      ?? vars.sv_projectName
      ?? vars.sv_projectDesc
      ?? 'Blackstone RP';

    return {
      online: true,
      name: removeFiveMFormatting(rawName) || 'Blackstone RP',
      players: Math.max(0, Math.round(players)),
      maxPlayers: Math.max(0, Math.round(maxPlayers)),
      playerList,
      source: payload.source || source,
      message: payload.message || 'Live server data received successfully.',
      checkedAt: payload.checkedAt || new Date().toISOString(),
      responseMs: Math.max(0, Math.round(firstNumber(payload.responseMs, payload.latencyMs, responseMs)))
    };
  }

  async function fetchJsonWithTimeout(url, label) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), serverConfig.requestTimeoutMs);
    const startedAt = performance.now();

    try {
      const response = await fetch(url, {
        cache: 'default',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Request failed (${response.status}).`);
      const payload = await response.json();
      return parseServerPayload(payload, label, performance.now() - startedAt);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function getStatusSources() {
    if (!['http:', 'https:'].includes(window.location.protocol)) return [];
    return [[new URL('api/server-status', document.baseURI).href, 'WEBSITE STATUS PROXY']];
  }

  async function getLiveServerData() {
    const sources = getStatusSources();
    if (!sources.length) {
      return {
        online: false,
        name: 'BLACKSTONE RP', players: 0, maxPlayers: 0, playerList: [],
        source: 'HOSTED WEBSITE REQUIRED',
        message: 'Live status is available from the hosted Blackstone RP website.',
        checkedAt: new Date().toISOString(), responseMs: 0
      };
    }
    const [url, label] = sources[0];
    return fetchJsonWithTimeout(url, label);
  }

  function renderPlayerList(data) {
    if (!liveElements.playerPanel || !liveElements.playerList) return;

    liveElements.playerList.replaceChildren();
    const names = Array.isArray(data.playerList) ? data.playerList : [];

    if (!data.online || data.players <= 0 || names.length === 0) {
      liveElements.playerPanel.hidden = true;
      return;
    }

    const visibleNames = names.slice(0, serverConfig.playerListLimit);
    visibleNames.forEach((name) => {
      const item = document.createElement('span');
      item.className = 'live-player-name';
      item.textContent = name;
      liveElements.playerList.appendChild(item);
    });

    liveElements.playerPanel.hidden = false;
    const hiddenCount = Math.max(0, data.players - visibleNames.length);
    text(
      liveElements.playerSummary,
      hiddenCount > 0
        ? `Showing ${visibleNames.length} players · ${hiddenCount} more online`
        : `${data.players} player${data.players === 1 ? '' : 's'} online`
    );
  }

  function setCheckingState() {
    if (!liveElements.card) return;
    liveElements.card.dataset.state = 'checking';
    text(liveElements.status, 'CHECKING...');
    text(liveElements.message, 'Connecting to the live FiveM server feed.');
    text(liveElements.source, 'LIVE CHECK IN PROGRESS');
    text(liveElements.response, '—');
    text(liveElements.heroStatus, 'CHECKING...');
    text(liveElements.networkStatus, 'CHECKING LIVE STATUS');
    if (liveElements.refresh) {
      liveElements.refresh.disabled = true;
      liveElements.refresh.textContent = 'CHECKING...';
    }
  }

  function setOnlineState(data) {
    const checked = new Date(data.checkedAt || Date.now());
    const ratio = data.maxPlayers > 0 ? Math.min(100, (data.players / data.maxPlayers) * 100) : 0;
    const capacityLabel = data.maxPlayers > 0
      ? `${data.players} of ${data.maxPlayers} player slots currently in use`
      : `${data.players} player${data.players === 1 ? '' : 's'} currently online`;

    if (liveElements.card) liveElements.card.dataset.state = 'online';
    text(liveElements.status, 'ONLINE');
    text(liveElements.message, data.message);
    text(liveElements.source, data.source || 'LIVE SERVER FEED');
    text(liveElements.name, data.name);
    text(liveElements.players, String(data.players));
    text(liveElements.maxPlayers, data.maxPlayers > 0 ? String(data.maxPlayers) : '—');
    text(liveElements.updated, checked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    text(liveElements.response, data.responseMs > 0 ? `${data.responseMs}MS` : 'LIVE');
    if (liveElements.capacityFill) liveElements.capacityFill.style.width = `${ratio}%`;
    text(liveElements.capacityText, capacityLabel);
    text(liveElements.heroStatus, 'ONLINE');
    text(liveElements.heroPlayers, data.maxPlayers > 0 ? `${data.players} / ${data.maxPlayers}` : String(data.players));
    text(liveElements.networkStatus, 'LIVE SERVER FEED');
    renderPlayerList(data);
  }

  function setOfflineState(data) {
    const checked = new Date(data.checkedAt || Date.now());
    if (liveElements.card) liveElements.card.dataset.state = 'offline';
    text(liveElements.status, 'OFFLINE');
    text(liveElements.message, data.message || 'The server is currently offline or restarting.');
    text(liveElements.source, data.source || 'LIVE CHECK COMPLETE');
    text(liveElements.name, data.name || 'BLACKSTONE RP');
    text(liveElements.players, '0');
    text(liveElements.maxPlayers, data.maxPlayers > 0 ? String(data.maxPlayers) : '—');
    text(liveElements.updated, checked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    text(liveElements.response, data.responseMs > 0 ? `${data.responseMs}MS` : 'NO RESPONSE');
    if (liveElements.capacityFill) liveElements.capacityFill.style.width = '0%';
    text(liveElements.capacityText, 'No active player data is currently available');
    text(liveElements.heroStatus, 'OFFLINE');
    text(liveElements.heroPlayers, '0 / —');
    text(liveElements.networkStatus, 'SERVER CURRENTLY OFFLINE');
    renderPlayerList(data);
  }

  async function updateLiveServerStatus() {
    if (!liveElements.card || statusRequestInProgress) return;
    statusRequestInProgress = true;
    setCheckingState();

    try {
      const data = await getLiveServerData();
      if (data.online) setOnlineState(data);
      else setOfflineState(data);
    } catch (error) {
      console.warn('Blackstone RP live status update failed:', error);
      setOfflineState({
        online: false,
        message: 'The live status check could not be completed. Use the Connect button to test the server directly.',
        source: 'STATUS CHECK ERROR',
        checkedAt: new Date().toISOString(),
        responseMs: 0,
        playerList: []
      });
    } finally {
      statusRequestInProgress = false;
      nextRefreshAt = Date.now() + serverConfig.refreshMs;
      if (liveElements.refresh) {
        liveElements.refresh.disabled = false;
        liveElements.refresh.textContent = 'REFRESH STATUS';
      }
    }
  }

  function updateRefreshCountdown() {
    const seconds = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
    text(liveElements.nextRefresh, statusRequestInProgress ? 'CHECKING' : `${seconds}S`);
  }

  liveElements.refresh?.addEventListener('click', updateLiveServerStatus);

  liveElements.copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(serverConfig.endpoint);
    } catch {
      const temporaryInput = document.createElement('input');
      temporaryInput.value = serverConfig.endpoint;
      temporaryInput.style.position = 'fixed';
      temporaryInput.style.opacity = '0';
      document.body.appendChild(temporaryInput);
      temporaryInput.select();
      document.execCommand('copy');
      temporaryInput.remove();
    }
    liveElements.copy.textContent = 'IP COPIED';
    window.setTimeout(() => {
      if (liveElements.copy) liveElements.copy.textContent = 'COPY IP';
    }, 1800);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() >= nextRefreshAt) updateLiveServerStatus();
  });

  updateLiveServerStatus();
  window.setInterval(() => {
    if (!document.hidden) updateLiveServerStatus();
  }, serverConfig.refreshMs);
  window.setInterval(updateRefreshCountdown, 1000);
  updateRefreshCountdown();

})();
