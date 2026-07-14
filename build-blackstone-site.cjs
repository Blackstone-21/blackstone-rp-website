'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const roleplayPath = path.join(root, 'index.html');
const roleplayScriptPath = path.join(root, 'script.js');
const developmentPath = path.join(root, 'development', 'index.html');

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required website file was not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function writeIfChanged(filePath, before, after) {
  if (before === after) return false;
  fs.writeFileSync(filePath, after, 'utf8');
  return true;
}

function insertAfter(source, marker, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(marker)) {
    throw new Error(`Could not locate ${label}.`);
  }
  return source.replace(marker, `${marker}\n${addition}`);
}

function updateRoleplay(source) {
  let updated = source;

  if (/blackstone-premium\.css\?v=\d+/.test(updated)) {
    updated = updated.replace(
      /blackstone-premium\.css\?v=\d+/g,
      'blackstone-premium.css?v=3'
    );
  } else {
    updated = insertAfter(
      updated,
      '<link rel="stylesheet" href="styles.css?v=12" />',
      '  <link rel="stylesheet" href="blackstone-premium.css?v=3" />',
      'the Roleplay stylesheet marker'
    );
  }

  updated = updated.replace(
    /script\.js\?v=\d+/g,
    'script.js?v=13'
  );

  if (/staff-photo-patch\.js\?v=\d+/.test(updated)) {
    updated = updated.replace(
      /staff-photo-patch\.js\?v=\d+/g,
      'staff-photo-patch.js?v=1'
    );
  } else if (updated.includes('</body>')) {
    updated = updated.replace(
      '</body>',
      '  <script src="staff-photo-patch.js?v=1" defer></script>\n</body>'
    );
  } else {
    throw new Error('Could not locate the end of the Roleplay page to inject the Panox staff photo patch.');
  }

  const developmentPlain = '<a href="development/">Development</a>';
  const developmentClassed =
    '<a class="nav-development" href="development/">Development</a>';
  const staffLogin =
    '      <a class="nav-cta" href="login.html">Staff Login</a>';

  if (!updated.includes(developmentClassed)) {
    if (updated.includes(developmentPlain)) {
      updated = updated.replace(developmentPlain, developmentClassed);
    } else {
      if (!updated.includes(staffLogin)) {
        throw new Error('Could not locate the Roleplay navigation insertion point.');
      }
      updated = updated.replace(
        staffLogin,
        `      ${developmentClassed}\n${staffLogin}`
      );
    }
  }

  // The generated design places Development as the final top action. Staff
  // login remains available in the footer and direct /login.html route.
  updated = updated.replace(
    /\s*<a class="nav-cta" href="login\.html">Staff Login<\/a>\s*/,
    '\n'
  );

  const footerMarker = '<div class="footer-links">';
  const footerDevelopment = '<a href="development/">Development</a>';
  const footerStart = updated.indexOf(footerMarker);
  const footerEnd =
    footerStart >= 0 ? updated.indexOf('</div>', footerStart) : -1;
  const footerBlock =
    footerStart >= 0 && footerEnd >= 0
      ? updated.slice(footerStart, footerEnd)
      : '';

  if (!footerBlock.includes(footerDevelopment)) {
    if (!updated.includes(footerMarker)) {
      throw new Error('Could not locate the Roleplay footer.');
    }
    updated = updated.replace(
      footerMarker,
      `${footerMarker}${footerDevelopment}`
    );
  }

  updated = updated
    .replace(
      '<span class="eyebrow"><i></i> BLACKSTONE STORE</span>',
      '<span class="eyebrow"><i></i> BLACKSTONE RP SUPPORT STORE</span>'
    )
    .replace(
      'SUPPORT THE SERVER.<br /><span>REP THE COMMUNITY.</span>',
      'SUPPORT BLACKSTONE.<br /><span>UNLOCK VIP.</span>'
    )
    .replace(
      'Browse Blackstone RP packages through our Tebex-powered store. Purchases open securely through Tebex.',
      'Support Blackstone RP through donations, VIP memberships and supporter packages. This store remains separate from Blackstone Development scripts.'
    )
    .replace(
      '<div><span>OFFICIAL TEBEX STORE</span><strong>Secure packages and server support</strong></div>',
      '<div><span>OFFICIAL ROLEPLAY STORE</span><strong>Donations, VIP packages and supporter perks</strong></div>'
    )
    .replace(
      'The latest shop listings are being loaded from the Blackstone administration system.',
      'Donation and VIP packages are loaded from the independent Blackstone RP shop.'
    );

  const shopTypes = `      <div class="rp-shop-types reveal">
        <article><span>01</span><strong>Donations</strong><p>Optional support packages that help fund hosting, development and community costs.</p></article>
        <article><span>02</span><strong>VIP Membership</strong><p>Clearly listed supporter benefits managed separately from Development script purchases.</p></article>
        <article><span>03</span><strong>Supporter Packs</strong><p>Special server packages, cosmetic benefits and community supporter options.</p></article>
      </div>`;

  const tebexBar =
    '<div class="tebex-store-bar reveal" id="tebexStoreBar" hidden>';

  if (!updated.includes('class="rp-shop-types')) {
    if (!updated.includes(tebexBar)) {
      throw new Error('Could not locate the Roleplay shop layout.');
    }
    updated = updated.replace(tebexBar, `${shopTypes}\n${tebexBar}`);
  }

  return updated;
}


function updateRoleplayScript(source) {
  let updated = source;

  const helperMarker = '  function createShopCard(item) {';
  const guardHelpers = `  function isDevelopmentTebexUrl(value) {
    const safe = safeHttpsUrl(value);
    if (!safe) return false;

    try {
      return new URL(safe).hostname.toLowerCase() ===
        'blackstone-rp-development.tebex.store';
    } catch {
      return false;
    }
  }

  function isDevelopmentShopItem(item) {
    const id = String(item?.id || '').toLowerCase();
    const source = String(item?.source || '').toLowerCase();

    return (
      source === 'tebex' ||
      id.startsWith('tebex-') ||
      isDevelopmentTebexUrl(item?.purchaseUrl)
    );
  }

`;

  if (!updated.includes('function isDevelopmentTebexUrl(value)')) {
    if (!updated.includes(helperMarker)) {
      throw new Error(
        'Could not locate the Roleplay shop helper insertion point.'
      );
    }

    updated = updated.replace(
      helperMarker,
      `${guardHelpers}${helperMarker}`
    );
  }

  const oldTebexSettings = `    const tebexUrl = safeHttpsUrl(settings?.tebexStoreUrl);
    const tebexEnabled = settings?.tebexEnabled !== false && Boolean(tebexUrl);`;

  const newTebexSettings = `    const configuredTebexUrl = safeHttpsUrl(
      settings?.tebexStoreUrl
    );
    const tebexUrl = isDevelopmentTebexUrl(
      configuredTebexUrl
    )
      ? ''
      : configuredTebexUrl;
    const tebexEnabled =
      settings?.tebexEnabled === true &&
      Boolean(tebexUrl);`;

  if (updated.includes(oldTebexSettings)) {
    updated = updated.replace(
      oldTebexSettings,
      newTebexSettings
    );
  }

  const oldList =
    '    const list = Array.isArray(items) ? items : [];';
  const newList = `    const list = Array.isArray(items)
      ? items.filter(
          (item) => !isDevelopmentShopItem(item)
        )
      : [];`;

  if (updated.includes(oldList)) {
    updated = updated.replace(oldList, newList);
  }

  updated = updated.replace(
    /cache:\s*['"]default['"]/,
    "cache: 'no-store'"
  );

  return updated;
}

function updateDevelopment(source) {
  let updated = source;

  if (/premium-theme\.css\?v=\d+/.test(updated)) {
    updated = updated.replace(
      /premium-theme\.css\?v=\d+/g,
      'premium-theme.css?v=5'
    );
  } else {
    updated = insertAfter(
      updated,
      '  <link rel="stylesheet" href="./styles.css">',
      '  <link rel="stylesheet" href="./premium-theme.css?v=3">',
      'the Development stylesheet marker'
    );
  }

  updated = updated.replace(
    '<button class="nav-link" type="button" data-view-target="products">Products</button>',
    '<button class="nav-link" type="button" data-view-target="products">Tebex Shop</button>'
  );

  updated = updated.replace(
    '<a class="nav-link nav-link-external" href="../">Roleplay Site</a>',
    '<a class="nav-link nav-link-external" href="../">Roleplay</a>'
  );

  updated = updated.replace(
    '<h1 id="productsTitle">PRODUCTS.</h1>',
    '<h1 id="productsTitle">TEBEX SHOP.</h1>'
  );

  updated = updated.replace(
    '<p>Search scripts, check compatibility and open the official Tebex package page.</p>',
    '<p>Browse Blackstone Development scripts, check compatibility and purchase securely through the official Development Tebex store.</p>'
  );

  updated = updated.replace(
    'Open Store\n        <span aria-hidden="true">↗</span>',
    'Development Store\n        <span aria-hidden="true">↗</span>'
  );

  const footerMarker = '<div class="footer-links">';
  const footerRoleplay = '<a href="../">Roleplay</a>';
  const footerStart = updated.indexOf(footerMarker);
  const footerEnd =
    footerStart >= 0 ? updated.indexOf('</div>', footerStart) : -1;
  const footerBlock =
    footerStart >= 0 && footerEnd >= 0
      ? updated.slice(footerStart, footerEnd)
      : '';

  if (!footerBlock.includes(footerRoleplay)) {
    if (!updated.includes(footerMarker)) {
      throw new Error('Could not locate the Development footer.');
    }
    updated = updated.replace(
      footerMarker,
      `${footerMarker}${footerRoleplay}`
    );
  }

  updated = updated.replace(
    /app\.js(?:\?v=\d+)?/g,
    'app.js?v=5'
  );

  return updated;
}

const roleplayBefore = readRequired(roleplayPath);
const roleplayScriptBefore = readRequired(roleplayScriptPath);
const developmentBefore = readRequired(developmentPath);

const roleplayAfter = updateRoleplay(roleplayBefore);
const roleplayScriptAfter = updateRoleplayScript(
  roleplayScriptBefore
);
const developmentAfter = updateDevelopment(developmentBefore);

const roleplayChanged = writeIfChanged(
  roleplayPath,
  roleplayBefore,
  roleplayAfter
);
const roleplayScriptChanged = writeIfChanged(
  roleplayScriptPath,
  roleplayScriptBefore,
  roleplayScriptAfter
);
const developmentChanged = writeIfChanged(
  developmentPath,
  developmentBefore,
  developmentAfter
);

console.log(
  `Blackstone silver update ready: Roleplay ${
    roleplayChanged ? 'updated' : 'already current'
  }, Roleplay shop guard ${
    roleplayScriptChanged ? 'updated' : 'already current'
  }, Development ${
    developmentChanged ? 'updated' : 'already current'
  }.`
);
