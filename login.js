(() => {
  const API = 'api/portal';
  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const requestedNext = params.get('next') === 'admin' ? 'admin' : 'portal';
  let csrfToken = '';

  const loginError = params.get('loginError');
  if (loginError) {
    const message = $('#loginMessage');
    if (message) message.textContent = loginError;
  }

  $('#loginYear').textContent = new Date().getFullYear();
  $('#discordLogin').href = `/api/discord-login?returnTo=${requestedNext}`;

  async function api(action, options = {}) {
    const response = await fetch(`${API}?${new URLSearchParams({ action })}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({ ok: false, message: 'Invalid server response.' }));
    if (!response.ok || payload.ok === false) throw new Error(payload.message || `Request failed (${response.status}).`);
    if (payload.csrfToken) csrfToken = payload.csrfToken;
    return payload;
  }

  function targetFor(user) {
    const canAdmin = Boolean(user?.permissions?.includes('dashboard.view'));
    if (requestedNext === 'admin' && canAdmin) return 'admin.html';
    return canAdmin ? 'admin.html' : 'portal.html';
  }

  async function checkSetup() {
    const status = $('#setupStatus');
    try {
      const setup = await api('setup-status');
      const ready = setup.databaseConfigured && setup.authConfigured;
      status.classList.toggle('ready', ready);
      status.classList.toggle('error', !ready);
      status.querySelector('span').textContent = ready ? 'Secure backend ready' : 'Vercel database or authentication setup required';
      const discordReady = Boolean(setup.discordOAuthConfigured);
      $('#discordLogin').hidden = !discordReady;
      $('#loginDivider').hidden = !discordReady;
    } catch (error) {
      status.classList.add('error');
      status.querySelector('span').textContent = error.message;
    }
  }

  async function restoreSession() {
    try {
      const data = await api('me');
      if (data.user) location.replace(targetFor(data.user));
    } catch {
      // No active session. Stay on the login page.
    }
  }

  $('#secureLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('#loginSubmit');
    const message = $('#loginMessage');
    message.textContent = '';
    button.disabled = true;
    button.textContent = 'Signing In…';
    try {
      const body = Object.fromEntries(new FormData(form));
      delete body.remember;
      const data = await api('login', { method: 'POST', body });
      location.replace(targetFor(data.user));
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Sign In';
    }
  });

  checkSetup();
  restoreSession();
})();
