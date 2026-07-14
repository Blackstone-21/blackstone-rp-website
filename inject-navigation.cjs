'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const roleplayPath = path.join(root, 'index.html');
const developmentPath = path.join(root, 'development', 'index.html');

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required website file was not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function writeIfChanged(filePath, original, updated) {
  if (updated === original) return false;
  fs.writeFileSync(filePath, updated, 'utf8');
  return true;
}

function updateRoleplayNavigation(source) {
  let updated = source;

  const topLink = '<a href="development/">Development</a>';
  const staffLogin = '      <a class="nav-cta" href="login.html">Staff Login</a>';

  if (!updated.includes(topLink)) {
    if (!updated.includes(staffLogin)) {
      throw new Error('Could not locate the Roleplay top-navigation insertion point.');
    }

    updated = updated.replace(
      staffLogin,
      `      ${topLink}\n${staffLogin}`
    );
  }

  const footerLink = '<a href="development/">Development</a>';
  const footerMarker = '<div class="footer-links">';

  // The top link and footer link use the same href. Confirm the footer area
  // separately before adding it.
  const footerStart = updated.indexOf(footerMarker);
  const footerEnd = footerStart >= 0
    ? updated.indexOf('</div>', footerStart)
    : -1;
  const footerBlock = footerStart >= 0 && footerEnd >= 0
    ? updated.slice(footerStart, footerEnd)
    : '';

  if (!footerBlock.includes(footerLink)) {
    if (!updated.includes(footerMarker)) {
      throw new Error('Could not locate the Roleplay footer insertion point.');
    }

    updated = updated.replace(
      footerMarker,
      `${footerMarker}${footerLink}`
    );
  }

  return updated;
}

function updateDevelopmentNavigation(source) {
  let updated = source;

  const existingLink =
    '<a class="nav-link nav-link-external" href="../">Roleplay Site</a>';
  const preferredLink =
    '<a class="nav-link nav-link-external" href="../">Roleplay</a>';

  if (updated.includes(existingLink)) {
    updated = updated.replace(existingLink, preferredLink);
  } else if (!updated.includes(preferredLink)) {
    const navEnd = '      </nav>';

    if (!updated.includes(navEnd)) {
      throw new Error(
        'Could not locate the Development top-navigation insertion point.'
      );
    }

    updated = updated.replace(
      navEnd,
      `        ${preferredLink}\n${navEnd}`
    );
  }

  const footerLink = '<a href="../">Roleplay</a>';
  const footerMarker = '<div class="footer-links">';
  const footerStart = updated.indexOf(footerMarker);
  const footerEnd = footerStart >= 0
    ? updated.indexOf('</div>', footerStart)
    : -1;
  const footerBlock = footerStart >= 0 && footerEnd >= 0
    ? updated.slice(footerStart, footerEnd)
    : '';

  if (!footerBlock.includes(footerLink)) {
    if (!updated.includes(footerMarker)) {
      throw new Error(
        'Could not locate the Development footer insertion point.'
      );
    }

    updated = updated.replace(
      footerMarker,
      `${footerMarker}${footerLink}`
    );
  }

  return updated;
}

const roleplayOriginal = readRequired(roleplayPath);
const developmentOriginal = readRequired(developmentPath);

const roleplayUpdated = updateRoleplayNavigation(roleplayOriginal);
const developmentUpdated = updateDevelopmentNavigation(developmentOriginal);

const roleplayChanged = writeIfChanged(
  roleplayPath,
  roleplayOriginal,
  roleplayUpdated
);

const developmentChanged = writeIfChanged(
  developmentPath,
  developmentOriginal,
  developmentUpdated
);

console.log(
  `Navigation links ready: Roleplay ${
    roleplayChanged ? 'updated' : 'already correct'
  }, Development ${
    developmentChanged ? 'updated' : 'already correct'
  }.`
);
