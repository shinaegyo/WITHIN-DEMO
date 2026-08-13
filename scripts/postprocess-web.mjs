/**
 * Post-processes the Expo web export for sharing as a link.
 *
 * Expo generates a bare index.html with no home-screen metadata, so on iOS the
 * app would open inside Safari's chrome rather than full screen. Adding these
 * tags is what makes "Add to Home Screen" feel like an installed app — which
 * is the whole point of demoing this way instead of through TestFlight.
 *
 * Run via scripts/build-web.sh; re-running is safe.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const htmlPath = join(DIST, 'index.html');

if (!existsSync(htmlPath)) {
  console.error('dist/index.html not found — run the export first.');
  process.exit(1);
}

// Matches the app's own theme backgrounds so the status bar and splash don't
// flash a different colour on launch.
const LIGHT_BG = '#F7F8FA';
const DARK_BG = '#0E0F13';

writeFileSync(
  join(DIST, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'WITHIN',
      short_name: 'WITHIN',
      description: 'One number. Seven guesses.',
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: DARK_BG,
      theme_color: DARK_BG,
      icons: [
        { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    null,
    2,
  ),
);

for (const [from, to] of [
  ['assets/icon.png', 'apple-touch-icon.png'],
  ['assets/icon.png', 'icon.png'],
]) {
  if (existsSync(from)) copyFileSync(from, join(DIST, to));
}

const tags = `
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
    <meta name="description" content="One number. Seven guesses. A new number every day." />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="WITHIN" />
    <!-- Translucent lets the app paint under the status bar, matching the
         edge-to-edge look of the native build. -->
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${LIGHT_BG}" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${DARK_BG}" />
    <meta property="og:title" content="WITHIN" />
    <meta property="og:description" content="One number. Seven guesses. A new number every day." />
    <meta property="og:type" content="website" />`;

let html = readFileSync(htmlPath, 'utf8');

// Expo ships its own viewport tag; ours adds viewport-fit for notched phones.
html = html.replace(
  /\n\s*<meta name="viewport"[^>]*\/>/,
  '',
);

if (!html.includes('apple-mobile-web-app-capable')) {
  html = html.replace('</head>', `${tags}\n  </head>`);
}

// Keeps the page from bouncing when the on-screen keyboard opens, and stops
// double-tap zoom on the guess buttons.
html = html.replace(
  '</style>',
  `  body { overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
      * { -webkit-tap-highlight-color: transparent; }
    </style>`,
);

writeFileSync(htmlPath, html);

// Host rewrite rules, so a refresh on any path still serves the SPA.
writeFileSync(
  join(DIST, '_redirects'),
  '/*  /index.html  200\n', // Netlify
);

console.log('web export post-processed:');
console.log('  manifest.webmanifest, apple-touch-icon.png, home-screen meta tags');
console.log('  _redirects for SPA routing');
