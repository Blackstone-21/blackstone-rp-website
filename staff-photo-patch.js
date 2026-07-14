(() => {
  'use strict';

  const PANOX_IMAGE = 'assets/staff/panox-profile.webp';
  const PANOX_ALT = 'Panox profile picture';

  function normalise(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function setImageSource(image) {
    if (!image) return;
    const current = image.getAttribute('src') || '';
    if (!current.endsWith(PANOX_IMAGE)) {
      image.setAttribute('src', PANOX_IMAGE);
    }
    image.removeAttribute('srcset');
    image.setAttribute('alt', PANOX_ALT);
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
    image.style.objectFit = image.style.objectFit || 'cover';
    image.style.objectPosition = image.style.objectPosition || 'center';
  }

  function setBackgroundImage(element) {
    if (!element || !element.style) return;
    element.style.backgroundImage = `url("${PANOX_IMAGE}")`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.style.backgroundRepeat = 'no-repeat';
  }

  function patchCard(card) {
    if (!card || card.dataset.panoxPhotoPatched === 'true') return;

    card.querySelectorAll('img').forEach(setImageSource);

    card.querySelectorAll(
      '[class*="avatar"], [class*="photo"], [class*="image"], [class*="portrait"], [style*="background"]'
    ).forEach(setBackgroundImage);

    if (!card.querySelector('img')) {
      const likelyVisual = card.querySelector(
        '[class*="avatar"], [class*="photo"], [class*="image"], [class*="portrait"]'
      );
      if (likelyVisual) setBackgroundImage(likelyVisual);
    }

    card.dataset.panoxPhotoPatched = 'true';
  }

  function cardLooksLikePanox(card) {
    if (!card) return false;
    const ownName = normalise(
      card.getAttribute('data-staff-name') ||
      card.getAttribute('data-name') ||
      card.getAttribute('aria-label') ||
      ''
    );

    if (ownName.includes('panox')) return true;

    const text = normalise(card.textContent || '');
    return /\bpanox\b/.test(text);
  }

  function scanAndPatch(root = document) {
    const selectors = [
      '[data-staff-name]',
      '[data-name]',
      '.staff-card',
      '.staff-member',
      '.staff-profile',
      '.team-card',
      '.profile-card',
      'article',
      'li',
      'div'
    ];

    const seen = new Set();

    root.querySelectorAll(selectors.join(',')).forEach((element) => {
      if (seen.has(element)) return;
      seen.add(element);
      if (cardLooksLikePanox(element)) patchCard(element);
    });

    root.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, span, strong, small'
    ).forEach((node) => {
      if (!/\bpanox\b/.test(normalise(node.textContent || ''))) return;
      const card = node.closest(
        '[data-staff-name], [data-name], .staff-card, .staff-member, .staff-profile, .team-card, .profile-card, article, li, div'
      );
      if (card) patchCard(card);
    });
  }

  function start() {
    scanAndPatch(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          scanAndPatch(node);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => scanAndPatch(document), 400);
    setTimeout(() => scanAndPatch(document), 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
