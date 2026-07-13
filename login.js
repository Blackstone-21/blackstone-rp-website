(() => {
  'use strict';

  const API = 'api/portal';
  const loginButton = document.querySelector('#discordLogin');
  const status = document.querySelector('#setupStatus');
  const params = new URLSearchParams(location.search);
  const REQUEST_TIMEOUT_MS = 10000;

  document.querySelector('#loginYear').textContent = new Date().getFullYear();

  async function api(action) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${API}?${new URLSearchParams({ action })}`, {
        method: 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store', signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('The sign-in service timed out. Please try again.');
      throw error;
    } finally { window.clearTimeout(timeout); }

    const payload = await response.json().catch(() => ({
      ok: false,
      message: 'The website returned an invalid response.'
    }));

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || `Request failed (${response.status}).`);
    }
    return payload;
  }

  function hasStaffAccess(user) {
    return Boolean(user?.permissions?.includes('dashboard.view'));
  }

  function setReady() {
    loginButton.href = 'api/discord-login?returnTo=admin';
    loginButton.classList.remove('disabled');
    loginButton.removeAttribute('aria-disabled');
    status.classList.add('ready');
    status.classList.remove('error');
    status.querySelector('span').textContent = 'Discord staff sign-in is ready';
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
        setup.siteUrlConfigured &&
        setup.discordOAuthConfigured
      );

      if (!ready) {
        setError('Staff sign-in is temporarily unavailable. Please contact a Founder.');
        return;
      }
      setReady();
    } catch (error) {
      setError(error.message || 'Staff sign-in is temporarily unavailable.');
    }
  }

  async function restoreSession() {
    try {
      const data = await api('me');
      if (!data.user) return;
      if (hasStaffAccess(data.user)) {
        location.replace('admin.html');
        return;
      }
      setError('This Discord account does not have authorised staff access.');
    } catch {
      // No active session. Remain on the staff login page.
    }
  }

  const loginError = params.get('loginError');
  if (loginError) setError(loginError);

  checkSetup().then(() => {
    if (loginError) setError(loginError);
  });
  restoreSession();
})();
