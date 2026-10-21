import {
  CONTACT_EMAIL,
  LEGAL_PAGES,
  PAGE_BY_PATH,
  PAGES,
  REPO_URL,
  type SeoPage,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_UPDATED,
} from './content.js';

const OG_W = 1200;
const OG_H = 630;

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* JSON-LD dans un <script> : on neutralise « < » pour qu'aucune valeur ne puisse fermer la balise. */
function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/* Texte brut → HTML, avec liens automatiques : URL http(s), e-mail, chemins du site connus et #hashtags. */
const KNOWN_PATHS = [...PAGES.map((p) => p.path), '/assets/logo/logo.png']
  .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length)
  .join('|');
const LINK_RE = new RegExp(
  `(https?:\\/\\/[^\\s)]+)|([\\w.+-]+@[\\w-]+\\.[\\w.-]*\\w)|(${KNOWN_PATHS})|(#[\\p{L}\\p{N}_]{1,80})`,
  'gu',
);
function rich(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const i = m.index ?? 0;
    out += esc(text.slice(last, i));
    const token = m[0];
    if (m[1]) out += `<a href="${esc(token)}" rel="noopener noreferrer">${esc(token)}</a>`;
    else if (m[2]) out += `<a href="mailto:${esc(token)}">${esc(token)}</a>`;
    else if (m[3]) out += `<a href="${esc(token)}">${esc(token)}</a>`;
    else out += `<a href="/tag/${encodeURIComponent(token.slice(1))}" rel="nofollow">${esc(token)}</a>`;
    last = i + token.length;
  }
  return out + esc(text.slice(last));
}

export interface HeadOptions {
  origin: string;
  path: string;
  title: string;
  description: string;
  robots: string;
  /** Chemin de l'image de partage (sous /assets/og/). */
  ogImage?: string;
  ogType?: 'website' | 'article';
  published?: string;
  updated?: string;
  canonical?: boolean;
  jsonLd?: unknown[];
}

export const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
export const ROBOTS_NOINDEX = 'noindex, nofollow';

/* Balises <head> communes aux pages rendues par le serveur et à la coquille de l'appli. */
export function headTags(o: HeadOptions): string {
  const url = o.origin + (o.path === '/' ? '/' : o.path);
  const image = o.ogImage?.startsWith('/')
    ? o.origin + o.ogImage
    : `${o.origin}/assets/og/${o.ogImage ?? 'default.png'}`;
  const lines = [
    `<title>${esc(o.title)}</title>`,
    `<meta name="description" content="${esc(o.description)}" />`,
    `<meta name="robots" content="${o.robots}" />`,
    o.canonical === false ? '' : `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    '<meta property="og:locale" content="fr_FR" />',
    `<meta property="og:type" content="${o.ogType ?? 'website'}" />`,
    `<meta property="og:title" content="${esc(o.title)}" />`,
    `<meta property="og:description" content="${esc(o.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="${OG_W}" />`,
    `<meta property="og:image:height" content="${OG_H}" />`,
    `<meta property="og:image:alt" content="${esc(o.title)}" />`,
    o.published ? `<meta property="article:published_time" content="${o.published}" />` : '',
    o.updated ? `<meta property="article:modified_time" content="${o.updated}" />` : '',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(o.title)}" />`,
    `<meta name="twitter:description" content="${esc(o.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    ...(o.jsonLd ?? []).map(jsonLd),
  ];
  return lines.filter(Boolean).join('\n  ');
}

export function organization(origin: string) {
  return {
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: SITE_NAME,
    url: `${origin}/`,
    logo: `${origin}/assets/logo/logo.png`,
    email: CONTACT_EMAIL,
    description: SITE_DESCRIPTION,
    sameAs: [REPO_URL],
  };
}

export function website(origin: string) {
  return {
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: `${origin}/`,
    name: SITE_NAME,
    inLanguage: 'fr-FR',
    publisher: { '@id': `${origin}/#organization` },
  };
}

function webApplication(origin: string) {
  return {
    '@type': 'WebApplication',
    '@id': `${origin}/#app`,
    name: SITE_NAME,
    url: `${origin}/`,
    applicationCategory: 'SocialNetworkingApplication',
    operatingSystem: 'Web, Windows, macOS, Linux',
    inLanguage: 'fr-FR',
    description: SITE_DESCRIPTION,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    publisher: { '@id': `${origin}/#organization` },
  };
}

/* ───────────────────────── Pages de contenu ───────────────────────── */

const CSS = `
:root{--bg:#020617;--card:#111827;--fg:#e5e7eb;--mut:#94a3b8;--link:#38bdf8;--bd:#2d3746;--ac:#00a6f4;--acfg:#021526}
@media (prefers-color-scheme:light){:root{--bg:#eef2f7;--card:#fff;--fg:#0f172a;--mut:#526071;--link:#0369a1;--bd:#d5dce6;--ac:#0a84c6;--acfg:#fff}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--link)}a:focus-visible,button:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.skip{position:absolute;left:-999px;top:0;background:var(--ac);color:var(--acfg);padding:8px 14px;z-index:9}.skip:focus{left:8px;top:8px}
.top{border-bottom:1px solid var(--bd);background:var(--card)}
.top-in{max-width:760px;margin:0 auto;padding:12px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;color:var(--fg);text-decoration:none;font-weight:800;margin-right:auto}
.brand img{width:32px;height:32px;border-radius:9px}
.nav{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:15px}.nav a{color:var(--mut);text-decoration:none}.nav a:hover{color:var(--fg)}
.btn{display:inline-block;background:var(--ac);color:var(--acfg)!important;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:999px}
.btn.alt{background:transparent;color:var(--fg)!important;border:1px solid var(--bd)}
main{max-width:760px;margin:0 auto;padding:28px 16px 48px}
.crumbs{font-size:14px;color:var(--mut);margin:0 0 14px}.crumbs a{color:var(--mut)}
.kicker{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ac);margin:0 0 8px}
h1{font-size:clamp(1.6rem,5vw,2.3rem);line-height:1.2;margin:0 0 14px;font-weight:900}
h2{font-size:1.35rem;line-height:1.3;margin:36px 0 10px}h3{font-size:1.05rem;margin:18px 0 4px}
.lead{font-size:1.1rem;color:var(--fg);margin:0 0 6px}.meta{font-size:14px;color:var(--mut);margin:0 0 20px}
ul,ol{padding-left:22px}li{margin:6px 0}p{margin:10px 0}
.cta{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:20px;margin:30px 0}
.cta p{margin:0 0 14px}.cta .row{display:flex;gap:10px;flex-wrap:wrap}
.tags{display:flex;gap:8px;flex-wrap:wrap;padding:0;list-style:none;margin:12px 0}
.tags a{display:inline-block;border:1px solid var(--bd);border-radius:999px;padding:3px 12px;text-decoration:none;font-size:15px}
.rel{list-style:none;padding:0;display:grid;gap:10px}.rel a{display:block;background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;text-decoration:none}
.src{font-size:15px;color:var(--mut)}
footer{border-top:1px solid var(--bd);padding:22px 16px;color:var(--mut);font-size:14px;text-align:center}footer a{color:var(--mut)}
.post{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:18px;margin:18px 0}.post .who{font-weight:800}.post .who span{font-weight:400;color:var(--mut)}.post .txt{font-size:1.15rem;white-space:pre-wrap;word-break:break-word;margin:10px 0}.post img,.post video{max-width:100%;border-radius:12px}.post audio{width:100%}
.plist{list-style:none;padding:0}.plist li{margin:0}.plist a.card{display:block;background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:14px 16px;margin:10px 0;text-decoration:none;color:var(--fg)}.plist .by{font-size:14px;color:var(--mut)}
`;

function renderSection(s: { h2: string; paras?: string[]; bullets?: string[] }): string {
  return [
    `<section>`,
    `<h2>${esc(s.h2)}</h2>`,
    ...(s.paras ?? []).map((p) => `<p>${rich(p)}</p>`),
    s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${rich(b)}</li>`).join('')}</ul>` : '',
    `</section>`,
  ].join('');
}

function frenchDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

export function layout(head: string, inner: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#020617" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#eef2f7" media="(prefers-color-scheme: light)" />
  ${head}
  <link rel="icon" href="/assets/logo/logo.png" />
  <link rel="apple-touch-icon" href="/assets/logo/logo.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <style>${CSS}</style>
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="top"><div class="top-in">
  <a class="brand" href="/"><img src="/assets/logo/logo.png" width="32" height="32" alt="" /><span>${esc(SITE_NAME)}</span></a>
  <nav class="nav" aria-label="Navigation principale">
    <a href="/mobilisations-en-france">Mobilisations</a>
    <a href="/publications">Publications</a>
    <a href="/espace-presse">Presse</a>
    <a class="btn" href="/auth">Rejoindre</a>
  </nav>
</div></header>
${inner}<footer>
  <p>${esc(SITE_NAME)} — ${esc(SITE_TAGLINE)}. <a href="/legal/conditions">Conditions</a> · <a href="/legal/confidentialite">Confidentialité</a> · <a href="/legal/regles">Règles</a> · <a href="/publications">Publications</a> · <a href="/espace-presse">Presse</a> · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</footer>
</body>
</html>
`;
}

export function renderPage(page: SeoPage, origin: string): string {
  const url = origin + page.path;
  const hub = PAGE_BY_PATH.get('/mobilisations-en-france');
  const crumbs: { name: string; path: string }[] = [{ name: 'Accueil', path: '/' }];
  if (page.kind === 'mobilisation' && hub && page.path !== hub.path) {
    crumbs.push({ name: hub.breadcrumb, path: hub.path });
  }
  crumbs.push({ name: page.breadcrumb, path: page.path });

  const graph: unknown[] = [
    organization(origin),
    website(origin),
    {
      '@type': page.kind === 'presse' ? 'AboutPage' : 'Article',
      '@id': `${url}#page`,
      url,
      mainEntityOfPage: url,
      headline: page.h1,
      name: page.title,
      description: page.description,
      inLanguage: 'fr-FR',
      datePublished: page.published,
      dateModified: page.updated,
      image: `${origin}/assets/og/${page.ogImage}`,
      author: { '@id': `${origin}/#organization` },
      publisher: { '@id': `${origin}/#organization` },
      isPartOf: { '@id': `${origin}/#website` },
      ...(page.sources?.length
        ? { citation: page.sources.map((s) => ({ '@type': 'WebPage', name: s.label, url: s.url })) }
        : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: origin + c.path,
      })),
    },
  ];

  const head = headTags({
    origin,
    path: page.path,
    title: page.title,
    description: page.description,
    robots: ROBOTS_INDEX,
    ogImage: page.ogImage,
    ogType: page.kind === 'presse' ? 'website' : 'article',
    published: page.published,
    updated: page.updated,
    jsonLd: [{ '@context': 'https://schema.org', '@graph': graph }],
  });

  const related = page.related
    .map((p) => PAGE_BY_PATH.get(p))
    .filter((p): p is SeoPage => Boolean(p))
    .map(
      (p) =>
        `<li><a href="${p.path}"><strong>${esc(p.breadcrumb)}</strong><br /><span class="src">${esc(p.description)}</span></a></li>`,
    )
    .join('');

  return layout(
    head,
    `<main id="contenu">
<article>
  <nav class="crumbs" aria-label="Fil d’Ariane">${crumbs
    .map((c, i) =>
      i === crumbs.length - 1
        ? `<span aria-current="page">${esc(c.name)}</span>`
        : `<a href="${c.path}">${esc(c.name)}</a>`,
    )
    .join(' › ')}</nav>
  <header>
    <span class="kicker">${esc(page.kicker)}</span>
    <h1>${esc(page.h1)}</h1>
    <p class="lead">${esc(page.lead)}</p>
    <p class="meta">Mis à jour le <time datetime="${page.updated}">${frenchDate(page.updated)}</time> · ${esc(SITE_NAME)}</p>
  </header>
  ${page.sections.map(renderSection).join('\n  ')}
  ${
    page.faq?.length
      ? `<section><h2>Questions fréquentes</h2>${page.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${rich(f.a)}</p>`).join('')}</section>`
      : ''
  }
  <aside class="cta" aria-label="Rejoindre la discussion">
    <p><strong>Rejoins la discussion sur ${esc(SITE_NAME)}.</strong> ${esc(SITE_TAGLINE)} : zéro publicité, fil chronologique, données hébergées en France.</p>
    <div class="row"><a class="btn" href="/auth">Créer un compte</a><a class="btn alt" href="/auth">Se connecter</a></div>
    <ul class="tags" aria-label="Hashtags">${page.hashtags
      .map((h) => `<li><a href="/tag/${encodeURIComponent(h)}" rel="nofollow">#${esc(h)}</a></li>`)
      .join('')}</ul>
  </aside>
  ${
    page.sources?.length
      ? `<section><h2>Sources</h2><ol class="src">${page.sources
          .map((s) => `<li><a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.label)}</a></li>`)
          .join('')}</ol></section>`
      : ''
  }
  <section><h2>À lire aussi</h2><ul class="rel">${related}</ul></section>
</article>
</main>
`,
  );
}

/* ───────────────────── Coquille de l'application (SPA) ───────────────────── */

const START = '<!--SEO:START-->';
const END = '<!--SEO:END-->';
const BLOCK_RE = /<!--SEO:START-->[\s\S]*?<!--SEO:END-->/;

export interface ShellMeta {
  head: string;
  /** true = page privée : à ne pas indexer (balise + en-tête X-Robots-Tag). */
  noindex: boolean;
}

export function shellMeta(pathname: string, origin: string): ShellMeta {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const homeTitle = `${SITE_NAME} — ${SITE_TAGLINE}, sans pub`;

  if (clean === '/' || clean === '/auth') {
    return {
      noindex: false,
      head: headTags({
        origin,
        path: '/',
        title: homeTitle,
        description: SITE_DESCRIPTION,
        robots: ROBOTS_INDEX,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@graph': [organization(origin), website(origin), webApplication(origin)],
          },
        ],
      }),
    };
  }

  const legal = /^\/legal\/([^/]+)$/.exec(clean);
  if (legal && LEGAL_PAGES[legal[1]]) {
    const name = LEGAL_PAGES[legal[1]];
    return {
      noindex: false,
      head: headTags({
        origin,
        path: clean,
        title: `${name} — ${SITE_NAME}`,
        description: `${name} de ${SITE_NAME}, le réseau social français et souverain, sans publicité, hébergé en France.`,
        robots: ROBOTS_INDEX,
      }),
    };
  }

  /* Tout le reste (fil, profils, posts, paramètres, jetons de réinitialisation…) est privé ou personnel. */
  return {
    noindex: true,
    head: headTags({
      origin,
      path: clean,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      robots: ROBOTS_NOINDEX,
      canonical: false,
    }),
  };
}

export function injectShell(template: string, meta: ShellMeta): string {
  const block = `${START}\n  ${meta.head}\n  ${END}`;
  return BLOCK_RE.test(template) ? template.replace(BLOCK_RE, () => block) : template;
}

/* ─────────────────────────── sitemap & robots ─────────────────────────── */

export function sitemapIndexXml(origin: string, postsLastmod?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${esc(origin)}/sitemap-pages.xml</loc><lastmod>${SITE_UPDATED}</lastmod></sitemap>
  <sitemap><loc>${esc(origin)}/sitemap-posts.xml</loc>${postsLastmod ? `<lastmod>${postsLastmod}</lastmod>` : ''}</sitemap>
</sitemapindex>
`;
}

export function sitemapPagesXml(origin: string, publicationsLastmod?: string): string {
  const urls: { loc: string; lastmod: string }[] = [
    { loc: `${origin}/`, lastmod: SITE_UPDATED },
    ...PAGES.map((p) => ({ loc: origin + p.path, lastmod: p.updated })),
    { loc: `${origin}/publications`, lastmod: publicationsLastmod ?? SITE_UPDATED },
    ...Object.keys(LEGAL_PAGES).map((slug) => ({ loc: `${origin}/legal/${slug}`, lastmod: SITE_UPDATED })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
}

export function robotsTxt(origin: string): string {
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /uploads/
Disallow: /admin
Disallow: /settings
Disallow: /notifications
Disallow: /forgot-password

Sitemap: ${origin}/sitemap.xml
`;
}
