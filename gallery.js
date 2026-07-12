(() => {
  const $ = (selector) => document.querySelector(selector);
  const API_ENDPOINTS = ['/api/discord-gallery'];
  const allowedHost = /(^|\.)((cdn|media)\.discordapp\.(com|net)|discord\.com)$/i;
  let loading = false;

  $('#galleryYear').textContent = new Date().getFullYear();

  function safeImageUrl(value) {
    try {
      const url = new URL(value, location.href);
      return url.protocol === 'https:' && allowedHost.test(url.hostname) ? url.href : '';
    } catch {
      return '';
    }
  }

  async function requestFeed() {
    let lastError = null;
    for (const endpoint of API_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
        clearTimeout(timeout);
        const payload = await response.json().catch(() => ({ ok: false, message: `The gallery API returned a non-JSON response (${response.status}).` }));
        if (!response.ok || payload.ok === false) throw new Error(payload.message || `Gallery request failed (${response.status}).`);
        return payload;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Gallery feed is unavailable.');
  }

  function showEmpty(title, message) {
    $('#galleryGrid').hidden = true;
    $('#galleryEmpty').hidden = false;
    $('#galleryEmptyTitle').textContent = title;
    $('#galleryEmptyMessage').textContent = message;
  }

  function openLightbox(image) {
    $('#lightboxImage').src = image.url;
    $('#lightboxImage').alt = image.caption || image.filename || 'Blackstone RP gallery image';
    $('#lightboxCaption').textContent = image.caption || image.filename || 'Blackstone RP gallery';
    $('#galleryLightbox').classList.add('open');
    $('#galleryLightbox').setAttribute('aria-hidden', 'false');
  }

  function closeLightbox() {
    $('#galleryLightbox').classList.remove('open');
    $('#galleryLightbox').setAttribute('aria-hidden', 'true');
    $('#lightboxImage').removeAttribute('src');
  }

  document.querySelectorAll('[data-close-lightbox]').forEach((button) => button.addEventListener('click', closeLightbox));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeLightbox(); });

  function render(images) {
    const usable = (Array.isArray(images) ? images : [])
      .map((image) => ({ ...image, url: safeImageUrl(image?.url) }))
      .filter((image) => image.url)
      .slice(0, 60);

    if (!usable.length) {
      showEmpty('NO GALLERY IMAGES YET', 'Images uploaded to the Discord gallery channel will appear here.');
      $('#galleryStatus').textContent = 'DISCORD CONNECTED · NO IMAGES';
      $('#galleryCount').textContent = '0 IMAGES';
      return;
    }

    const grid = $('#galleryGrid');
    const fragment = document.createDocumentFragment();
    usable.forEach((image) => {
      const card = document.createElement('article');
      card.className = 'gallery-card';
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `View ${image.caption || image.filename || 'gallery image'}`);
      const picture = document.createElement('img');
      picture.src = image.url;
      picture.alt = image.caption || image.filename || 'Blackstone RP gallery image';
      picture.loading = 'lazy';
      picture.decoding = 'async';
      button.append(picture);
      button.addEventListener('click', () => openLightbox(image));
      const copy = document.createElement('div');
      copy.className = 'gallery-card-copy';
      const title = document.createElement('strong');
      title.textContent = image.caption || image.filename || 'Blackstone RP image';
      const date = document.createElement('span');
      const created = new Date(image.createdAt || image.timestamp || 0);
      date.textContent = Number.isNaN(created.getTime()) ? 'Discord gallery' : created.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
      copy.append(title, date);
      card.append(button, copy);
      fragment.append(card);
    });
    grid.replaceChildren(fragment);
    grid.hidden = false;
    grid.setAttribute('aria-busy', 'false');
    $('#galleryEmpty').hidden = true;
    $('#galleryStatus').textContent = 'DISCORD GALLERY ONLINE';
    $('#galleryCount').textContent = `${usable.length} IMAGE${usable.length === 1 ? '' : 'S'}`;
  }

  async function loadGallery() {
    if (loading) return;
    loading = true;
    const button = $('#refreshGallery');
    button.disabled = true;
    button.textContent = 'Refreshing…';
    $('#galleryStatus').textContent = 'CONNECTING TO DISCORD…';
    try {
      const payload = await requestFeed();
      render(payload.images || []);
    } catch (error) {
      showEmpty('GALLERY TEMPORARILY UNAVAILABLE', error.message || 'The Discord gallery could not be loaded.');
      $('#galleryStatus').textContent = 'FEED UNAVAILABLE';
      $('#galleryCount').textContent = 'TRY AGAIN';
    } finally {
      loading = false;
      button.disabled = false;
      button.textContent = 'Refresh Gallery';
    }
  }

  $('#refreshGallery').addEventListener('click', loadGallery);
  loadGallery();
  setInterval(() => { if (!document.hidden) loadGallery(); }, 180000);
})();
