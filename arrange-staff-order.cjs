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
  'pabs-lefe.webp'
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

const pabsCard = `          <article class="staff-card">
            <div class="staff-image"><img decoding="async" src="assets/staff/pabs-lefe.webp?v=4" loading="lazy" width="512" height="512" alt="pabs lefe staff profile image" /></div>
            <div class="staff-copy"><span>ADMINISTRATOR</span><h3>pabs lefe</h3><p>Administrator.</p></div>
          </article>`;

function findArticle(source, name) {
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

  const end = closing + '</article>'.length;

  return {
    start,
    end,
    html: source.slice(start, end)
  };
}

function removeNamedArticle(source, name) {
  let article = findArticle(source, name);

  while (article) {
    source =
      source.slice(0, article.start) +
      source.slice(article.end);

    article = findArticle(source, name);
  }

  return source;
}

const groupPattern =
  /(<div class="staff-group reveal">\s*<div class="staff-group-heading">\s*<span>02<\/span>\s*<h3>Our Staff<\/h3>\s*<\/div>\s*)<div class="staff-grid[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/;

const groupMatch = index.match(groupPattern);

if (!groupMatch) {
  throw new Error(
    'Could not locate the complete Our Staff section.'
  );
}

const groupPrefix = groupMatch[1];
let gridContent = groupMatch[2];

const bear = findArticle(gridContent, 'BEAR');
const lilFrog = findArticle(gridContent, 'Lil frog');

if (!bear || !lilFrog) {
  throw new Error(
    'Could not locate BEAR and Lil frog cards.'
  );
}

// Remove all three target cards, including any old misspelling.
for (const name of [
  'BEAR',
  'Lil frog',
  'pads lefe',
  'pabs lefe'
]) {
  gridContent = removeNamedArticle(
    gridContent,
    name
  );
}

// Keep any unrelated staff cards after the requested three.
const remainingCards = gridContent.trim();

const orderedCards = [
  bear.html.trim(),
  pabsCard.trim(),
  lilFrog.html.trim(),
  remainingCards
].filter(Boolean);

const replacement = `${groupPrefix}<div class="staff-grid staff-grid-three">
          ${orderedCards.join('\n          ')}
        </div>
      </div>
    </section>`;

index = index.replace(
  groupMatch[0],
  replacement
);

index = index.replace(
  /styles\.css\?v=\d+/g,
  'styles.css?v=15'
);

const cssMarkers = [
  [
    '/* PADS LEFE STAFF GRID START */',
    '/* PADS LEFE STAFF GRID END */'
  ],
  [
    '/* PABS LEFE STAFF GRID START */',
    '/* PABS LEFE STAFF GRID END */'
  ],
  [
    '/* STAFF ORDER GRID START */',
    '/* STAFF ORDER GRID END */'
  ]
];

for (const [startMarker, endMarker] of cssMarkers) {
  const start = styles.indexOf(startMarker);
  const end = styles.indexOf(endMarker);

  if (start >= 0 && end >= start) {
    styles =
      styles.slice(0, start) +
      styles.slice(end + endMarker.length);
  }
}

styles = styles.trimEnd() + `

/* STAFF ORDER GRID START */
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
/* STAFF ORDER GRID END */
`;

const bearPosition =
  index.indexOf('<h3>BEAR</h3>');
const pabsPosition =
  index.indexOf('<h3>pabs lefe</h3>');
const frogPosition =
  index.indexOf('<h3>Lil frog</h3>');

if (
  bearPosition < 0 ||
  pabsPosition < 0 ||
  frogPosition < 0
) {
  throw new Error(
    'One or more required staff cards are missing.'
  );
}

if (
  !(
    bearPosition <
    pabsPosition &&
    pabsPosition <
    frogPosition
  )
) {
  throw new Error(
    'Staff order verification failed.'
  );
}

if (
  index.split('<h3>pabs lefe</h3>').length - 1 !== 1
) {
  throw new Error(
    'pabs lefe must appear exactly once.'
  );
}

if (index.includes('<h3>pads lefe</h3>')) {
  throw new Error(
    'The old pads lefe name is still present.'
  );
}

fs.writeFileSync(indexPath, index, 'utf8');
fs.writeFileSync(stylesPath, styles, 'utf8');

console.log(
  'Staff order applied: BEAR, pabs lefe, Lil frog.'
);
