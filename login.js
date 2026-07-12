(() => {
  'use strict';

  const API = 'api/portal';
  const loginButton = document.querySelector('#discordLogin');
  const status = document.querySelector('#setupStatus');
  const params = new URLSearchParams(location.search);
  const requestedNext = params.get('next') === 'admin' ? 'admin' : 'portal';

  document.querySelector('#loginYear').textContent = new Date().getFullYear();

  async function api(action) {
    const response = await fetch(
      `${API}?${new URLSearchParams({ action })}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store'
      }
    );

    const payload = await response.json().catch(() => ({
      ok: false,
      message: 'The website returned an invalid response.'
    }));

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || `Request failed (${response.status}).`);
    }
    return payload;
  }

  function targetFor(user) {
    const canAdmin = Boolean(user?.permissions?.includes('dashboard.view'));
    if (requestedNext === 'admin' && canAdmin) return 'admin.html';
    return canAdmin ? 'admin.html' : 'portal.html';
  }

  function setReady() {
    loginButton.href = `api/discord-login?returnTo=${encodeURIComponent(requestedNext)}`;
    loginButton.classList.remove('disabled');
    loginButton.removeAttribute('aria-disabled');
    status.classList.add('ready');
    status.classList.remove('error');
    status.querySelector('span').textContent = 'Discord sign-in is ready';
  }

  function setError(message) {
    loginButton.href = '#';
    loginButton.classList.add('disabled');
    loginButton.setAttribute('aria-disabled', 'true');
    status.classList.add('error');
    status.classList.remove('ready');
    status.querySelector('span').textContent = message;
  }

  loginButton.addEventListener('click', (event) => {
    if (loginButton.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
    }
  });

  async function checkSetup() {
    try {
      const setup = await api('setup-status');
      const ready = Boolean(
        setup.databaseConfigured &&
        setup.authConfigured &&
        setup.discordOAuthConfigured
      );

      if (!ready) {
        setError('Discord sign-in is temporarily unavailable. Please contact staff through Discord.');
        return;
      }
      setReady();
    } catch (error) {
      setError(error.message || 'Discord sign-in is temporarily unavailable.');
    }
  }

  async function restoreSession() {
    try {
      const data = await api('me');
      if (data.user) location.replace(targetFor(data.user));
    } catch {
      // No active session. Remain on the login page.
    }
  }

  checkSetup();
  restoreSession();
})();
