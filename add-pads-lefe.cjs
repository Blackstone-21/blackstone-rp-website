'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const stylesPath = path.join(root, 'styles.css');
const imagePath = path.join(
  root,
  'assets',
  'staff',
  'pads-lefe.webp'
);

for (const filePath of [
  indexPath,
  stylesPath,
  imagePath
]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Required website file is missing: ${filePath}`
    );
  }
}

let index = fs.readFileSync(indexPath, 'utf8');
let styles = fs.readFileSync(stylesPath, 'utf8');

const padsCard = `          <article class="staff-card">
            <div class="staff-image"><img decoding="async" src="assets/staff/pads-lefe.webp?v=2" loading="lazy" width="512" height="512" alt="pads lefe staff profile image" /></div>
            <div class="staff-copy"><span>ADMINISTRATOR</span><h3>pads lefe</h3><p>Administrator.</p></div>
          </article>`;

function articleBounds(source, name) {
  const marker = `<h3>${name}</h3>`;
  const markerPosition = source.indexOf(marker);

  if (markerPosition < 0) return null;

  const start = source.lastIndexOf(
    '<article class="staff-card">',
    markerPosition
  );
  const closing = source.indexOf(
    '</article>',
    markerPosition
  );

  if (start < 0 || closing < 0) return null;

  return [
    start,
    closing + '</article>'.length
  ];
}

const existingPads = articleBounds(index, 'pads lefe');

if (existingPads) {
  index =
    index.slice(0, existingPads[0]) +
    padsCard +
    index.slice(existingPads[1]);
} else {
  const insertionTarget =
    articleBounds(index, 'Lil frog') ||
    articleBounds(index, 'BEAR');

  if (!insertionTarget) {
    throw new Error(
      'Could not locate BEAR or Lil frog in the Our Staff section.'
    );
  }

  index =
    index.slice(0, insertionTarget[1]) +
    '\n' +
    padsCard +
    index.slice(insertionTarget[1]);
}

const staffGridPattern =
  /(<div class="staff-group reveal">\s*<div class="staff-group-heading">\s*<span>02<\/span>\s*<h3>Our Staff<\/h3>\s*<\/div>\s*)<div class="staff-grid[^"]*">/s;

if (!staffGridPattern.test(index)) {
  throw new Error(
    'Could not locate the Our Staff grid.'
  );
}

index = index.replace(
  staffGridPattern,
  '$1<div class="staff-grid staff-grid-three">'
);

index = index.replace(
  /styles\.css\?v=\d+/g,
  'styles.css?v=13'
);

const cssStart =
  '/* PADS LEFE STAFF GRID START */';
const cssEnd =
  '/* PADS LEFE STAFF GRID END */';

const startIndex = styles.indexOf(cssStart);
const endIndex = styles.indexOf(cssEnd);

if (startIndex >= 0 && endIndex >= startIndex) {
  styles =
    styles.slice(0, startIndex) +
    styles.slice(endIndex + cssEnd.length);
}

styles = styles.trimEnd() + `

${cssStart}
.staff-grid-three {
  grid-template-columns:
    repeat(3, minmax(260px, 300px));
}

@media (max-width: 980px) {
  .staff-grid-three {
    grid-template-columns:
      repeat(2, minmax(260px, 300px));
  }
}

@media (max-width: 680px) {
  .staff-grid-three {
    grid-template-columns:
      minmax(0, 1fr);
  }
}
${cssEnd}
`;

const padsCount =
  index.split('<h3>pads lefe</h3>').length - 1;

if (padsCount !== 1) {
  throw new Error(
    'pads lefe must appear exactly once.'
  );
}

fs.writeFileSync(indexPath, index, 'utf8');
fs.writeFileSync(stylesPath, styles, 'utf8');

console.log(
  'pads lefe staff card applied to this deployment.'
);
