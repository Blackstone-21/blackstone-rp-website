(() => {
  const API = 'api/portal';
  let csrfToken = sessionStorage.getItem('bsrp_csrf') || '';
  let currentUser = null;
  let currentMember = null;
  let refreshPromise = null;
  const REQUEST_TIMEOUT_MS = 10000;

  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeText = (value) => String(value ?? '');

  async function timedFetch(url, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    catch (error) {
      if (error?.name === 'AbortError') throw new Error('The request timed out. Please try again.');
      throw error;
    } finally { window.clearTimeout(timeout); }
  }

  async function refreshSession() {
    if (!refreshPromise) {
      refreshPromise = api('refresh', { method: 'POST', retry: false })
        .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  async function api(action, options = {}) {
    const response = await timedFetch(`${API}?action=${encodeURIComponent(action)}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      cache: action === 'public' ? 'default' : 'no-store'
    });
    const payload = await response.json().catch(() => ({ ok: false, message: 'Invalid server response.' }));
    if (response.status === 401 && options.retry !== false && !['refresh','login'].includes(action)) {
      try {
        await refreshSession();
        return api(action, { ...options, retry: false });
      } catch { clearAccount(); }
    }
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.message || `Request failed (${response.status}).`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    if (payload.csrfToken) {
      csrfToken = payload.csrfToken;
      sessionStorage.setItem('bsrp_csrf', csrfToken);
    }
    return payload;
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  async function loadServerStatus() {
    try {
      const started = performance.now();
      const response = await timedFetch('api/server-status', { cache: 'default' });
      const data = await response.json();
      const responseTime = data.responseMs || Math.round(performance.now() - started);
      setText('#portalServerStatus', data.online ? 'ONLINE' : 'OFFLINE');
      setText('#portalPlayers', `${Number(data.players || 0)} / ${Number(data.maxPlayers || 0) || '—'}`);
      setText('#portalResponse', data.online ? `${responseTime}MS` : '—');
      setText('#networkLabel', data.online ? 'BLACKSTONE SERVER ONLINE' : 'SERVER CURRENTLY OFFLINE');
      document.querySelector('.network-card')?.setAttribute('data-online', String(Boolean(data.online)));
    } catch {
      setText('#portalServerStatus', 'UNAVAILABLE');
      setText('#networkLabel', 'LIVE STATUS UNAVAILABLE');
    }
  }

  function renderAnnouncements(items) {
    const container = $('#announcementGrid');
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<div class="loading-card">No announcements are currently published.</div>';
      return;
    }
    items.forEach((item) => {
      const article = document.createElement('article');
      article.className = `announcement-card${item.pinned ? ' pinned' : ''}`;
      const header = document.createElement('header');
      const category = document.createElement('span');
      category.textContent = escapeText(item.category || 'Community').toUpperCase();
      const badge = document.createElement('b');
      badge.textContent = item.pinned ? 'PINNED' : new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }).toUpperCase();
      header.append(category, badge);
      const title = document.createElement('h3');
      title.textContent = escapeText(item.title);
      const body = document.createElement('p');
      body.textContent = escapeText(item.body);
      article.append(header, title, body);
      if (item.imageUrl && /^https:\/\//i.test(String(item.imageUrl))) {
        const image = document.createElement('img');
        image.className = 'announcement-image';
        image.src = item.imageUrl;
        image.alt = escapeText(item.title || 'Announcement image');
        image.loading = 'lazy';
        article.appendChild(image);
      }
      if (item.discordUrl || item.authorName) {
        const footer = document.createElement('footer');
        if (item.authorName) {
          const author = document.createElement('span');
          author.textContent = `Posted by ${escapeText(item.authorName)}`;
          footer.appendChild(author);
        }
        if (item.discordUrl && /^https:\/\/discord\.com\//i.test(String(item.discordUrl))) {
          const link = document.createElement('a');
          link.href = item.discordUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'View in Discord ↗';
          footer.appendChild(link);
        }
        article.appendChild(footer);
      }
      container.appendChild(article);
    });
  }

  function renderDepartments(items) {
    const container = $('#portalDepartments');
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<div class="loading-card">No departments are currently published.</div>';
      return;
    }
    items.forEach((item, index) => {
      const article = document.createElement('article');
      article.className = 'portal-department';
      article.dataset.code = String(index + 1).padStart(2, '0');
      const header = document.createElement('header');
      const code = document.createElement('span');
      code.textContent = escapeText(item.code || item.name).toUpperCase();
      const status = document.createElement('b');
      status.className = 'status-chip';
      status.textContent = item.open ? 'APPLICATIONS OPEN' : 'CLOSED';
      header.append(code, status);
      const title = document.createElement('h3');
      title.textContent = escapeText(item.tagline || item.name);
      const description = document.createElement('p');
      description.textContent = escapeText(item.description);
      const list = document.createElement('ul');
      (item.features || []).forEach((feature) => {
        const li = document.createElement('li');
        li.textContent = escapeText(feature);
        list.appendChild(li);
      });
      article.append(header, title, description, list);
      container.appendChild(article);
    });
  }

  function renderEvents(items) {
    const container = $('#eventList');
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<div class="loading-card">No events are currently scheduled.</div>';
      return;
    }
    items.forEach((item) => {
      const date = item.startsAt ? new Date(item.startsAt) : null;
      const article = document.createElement('article');
      article.className = 'event-card';
      const dateBox = document.createElement('div');
      dateBox.className = 'event-date';
      const day = document.createElement('strong');
      day.textContent = date && !Number.isNaN(date.getTime()) ? String(date.getDate()).padStart(2, '0') : 'TBA';
      const month = document.createElement('small');
      month.textContent = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase() : 'DATE';
      dateBox.append(day, month);
      const copy = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = escapeText(item.title);
      const description = document.createElement('p');
      description.textContent = escapeText(item.description);
      copy.append(title, description);
      const location = document.createElement('span');
      location.className = 'event-location';
      location.textContent = escapeText(item.location || 'LOS SANTOS').toUpperCase();
      article.append(dateBox, copy, location);
      container.appendChild(article);
    });
  }

  function initials(value) {
    return String(value || 'B').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

  function renderStaff(items) {
    const container = $('#portalStaff');
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<div class="loading-card">Staff roster is currently unavailable.</div>';
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('article');
      row.className = 'staff-row';
      const avatar = document.createElement('div');
      avatar.className = 'staff-avatar';
      avatar.textContent = initials(item.displayName);
      const copy = document.createElement('div');
      const name = document.createElement('h3');
      name.textContent = escapeText(item.displayName);
      const note = document.createElement('p');
      note.textContent = escapeText(item.notes || item.department || 'Blackstone RP Staff');
      copy.append(name, note);
      const rank = document.createElement('span');
      rank.textContent = escapeText(item.rank || item.roleId || 'Staff').toUpperCase();
      row.append(avatar, copy, rank);
      container.appendChild(row);
    });
  }

  function renderImages(items) {
    const section = $('#featuredImagesSection');
    const container = $('#featuredImages');
    container.innerHTML = '';
    if (!items.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    items.slice(0, 6).forEach((item) => {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = item.url;
      image.alt = item.title || item.caption || 'Blackstone RP image';
      image.loading = 'lazy';
      const caption = document.createElement('figcaption');
      caption.textContent = item.caption || item.title || 'Blackstone RP';
      figure.append(image, caption);
      container.appendChild(figure);
    });
  }

  async function loadAuthOptions() {
    // Member sign-in has been removed. Staff authenticate on login.html.
  }

  async function loadPublicContent() {
    try {
      const data = await api('public');
      $('#setupBanner').hidden = data.configured !== false;
      renderAnnouncements(data.announcements || []);
      renderDepartments(data.departments || []);
      renderEvents(data.events || []);
      renderStaff(data.staff || []);
      renderImages(data.images || []);
    } catch (error) {
      renderAnnouncements([]);
      renderDepartments([]);
      renderEvents([]);
      renderStaff([]);
      console.error(error);
    }
  }


  function applyAccount(user, member) {
    currentUser = user;
    currentMember = member;
    $('#accountSection').hidden = false;
    $('#accountButton').textContent = user.displayName || 'My Account';
    setText('#profileRole', user.roleName || 'Member');
    setText('#profileName', user.displayName || 'Blackstone Member');
    setText('#profileEmail', user.email || '');
    setText('#profileAvatar', initials(user.displayName));
    setText('#profileCharacter', member?.characterName || 'Not set');
    setText('#profileDepartment', member?.department || 'Not assigned');
    setText('#profileRank', member?.rank || user.roleName || 'Member');
    setText('#profileDiscord', member?.discordUsername || 'Not linked');
    const form = $('#profileForm');
    form.elements.displayName.value = member?.displayName || user.displayName || '';
    form.elements.discordUsername.value = member?.discordUsername || '';
    form.elements.discordId.value = member?.discordId || '';
    form.elements.characterName.value = member?.characterName || '';
    $('#openAdmin').hidden = !(user.permissions || []).includes('dashboard.view');
  }

  function clearAccount() {
    currentUser = null;
    currentMember = null;
    csrfToken = '';
    sessionStorage.removeItem('bsrp_csrf');
    $('#accountSection').hidden = true;
    $('#accountButton').textContent = 'Staff Login';
  }

  async function restoreSession() {
    try {
      const data = await api('me');
      applyAccount(data.user, data.member);
    } catch { clearAccount(); }
  }

  $('#accountButton').addEventListener('click', () => {
    if (currentUser && (currentUser.permissions || []).includes('dashboard.view')) {
      location.href = 'admin.html';
      return;
    }
    location.href = 'login.html';
  });

  $('#profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('#profileSaveStatus');
    status.textContent = 'SAVING…';
    try {
      const data = await api('profile', { method: 'PUT', body: Object.fromEntries(new FormData(event.currentTarget)) });
      currentMember = data.member;
      applyAccount(currentUser, currentMember);
      status.textContent = 'SAVED';
    } catch (error) {
      status.textContent = error.message;
    }
  });

  $('#logoutButton').addEventListener('click', async () => {
    try { await api('logout', { method: 'POST' }); } catch {}
    clearAccount();
  });

  function handleLoginResult() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('loginError');
    if (error) {
      location.replace(`login.html?loginError=${encodeURIComponent(error)}`);
    }
  }

  handleLoginResult();
  loadAuthOptions();
  setText('#portalYear', new Date().getFullYear());
  loadServerStatus();
  loadPublicContent();
  restoreSession();
  setInterval(() => { if (!document.hidden) loadServerStatus(); }, 30000);
})();
