import type { PublicPost } from '../services/publicPosts.js';
import { SITE_NAME, SITE_TAGLINE } from './content.js';
import { esc, headTags, layout, organization, ROBOTS_INDEX, ROBOTS_NOINDEX, website } from './render.js';

/* Pages des posts que leurs auteurs ont choisi de rendre publics (opt-in). Tout le texte vient d'utilisateurs :
   il est toujours échappé, les liens portent rel="ugc nofollow" (aucun jus de lien pour du spam) et les mentions
   restent du texte brut. */

const USER_TOKEN_RE = /(https?:\/\/[^\s<]+)|(#[\p{L}\p{N}_]{1,80})/gu;

function userHtml(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(USER_TOKEN_RE)) {
    const i = m.index ?? 0;
    out += esc(text.slice(last, i));
    const token = m[0];
    if (m[1]) {
      /* La ponctuation finale d'une phrase ne fait pas partie du lien. */
      const url = token.replace(/[.,;:!?)\]]+$/, '');
      out += `<a href="${esc(url)}" rel="ugc nofollow noopener noreferrer">${esc(url)}</a>${esc(token.slice(url.length))}`;
    } else {
      out += `<a href="/tag/${encodeURIComponent(token.slice(1))}" rel="nofollow">${esc(token)}</a>`;
    }
    last = i + token.length;
  }
  return out + esc(text.slice(last));
}

function excerpt(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2)))}…`;
}

const authorName = (p: PublicPost) => p.displayName || p.pseudo;
const frenchDateTime = (d: Date) =>
  d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });

export function renderPostPage(post: PublicPost, origin: string): string {
  const path = `/p/${post.id}`;
  const url = origin + path;
  const name = authorName(post);
  const body = post.text ?? '';
  const summary = body
    ? excerpt(body, 110)
    : post.video
      ? 'Une vidéo'
      : post.audio
        ? 'Un message vocal'
        : post.image
          ? 'Une image'
          : 'Un post';
  const title = `${name} sur ${SITE_NAME} : « ${excerpt(summary, 48)} »`;
  const description = excerpt(`${body || summary} — ${name} (@${post.pseudo}) sur ${SITE_NAME}.`, 155);
  const modified = (post.editedAt ?? post.createdAt).toISOString();

  const head = headTags({
    origin,
    path,
    title,
    description,
    robots: ROBOTS_INDEX,
    ogImage: post.image ?? undefined,
    ogType: 'article',
    published: post.createdAt.toISOString(),
    updated: modified,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@graph': [
          organization(origin),
          website(origin),
          {
            '@type': 'SocialMediaPosting',
            '@id': `${url}#post`,
            url,
            mainEntityOfPage: url,
            headline: excerpt(summary, 110),
            ...(body ? { articleBody: body } : {}),
            inLanguage: 'fr-FR',
            datePublished: post.createdAt.toISOString(),
            dateModified: modified,
            author: { '@type': 'Person', name, alternateName: `@${post.pseudo}` },
            publisher: { '@id': `${origin}/#organization` },
            isPartOf: { '@id': `${origin}/#website` },
            ...(post.image ? { image: origin + post.image } : {}),
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${origin}/` },
              { '@type': 'ListItem', position: 2, name: 'Publications', item: `${origin}/publications` },
              { '@type': 'ListItem', position: 3, name: summary.slice(0, 60), item: url },
            ],
          },
        ],
      },
    ],
  });

  return layout(
    head,
    `<main id="contenu">
<article>
  <nav class="crumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a> › <a href="/publications">Publications</a> › <span aria-current="page">Post de @${esc(post.pseudo)}</span></nav>
  <h1 class="kicker" style="font-size:13px">Publication publique</h1>
  <div class="post">
    <div class="who">${esc(name)} <span>@${esc(post.pseudo)}</span></div>
    ${body ? `<p class="txt">${userHtml(body)}</p>` : ''}
    ${post.image ? `<p><img src="${esc(post.image)}" alt="Image jointe au post de ${esc(name)}" loading="lazy" /></p>` : ''}
    ${post.video ? `<p><video src="${esc(post.video)}" controls preload="none"></video></p>` : ''}
    ${post.audio ? `<p><audio src="${esc(post.audio)}" controls preload="none"></audio></p>` : ''}
    <p class="meta"><time datetime="${post.createdAt.toISOString()}">${frenchDateTime(post.createdAt)}</time>${post.editedAt ? ' · modifié' : ''}</p>
  </div>
  <aside class="cta" aria-label="Rejoindre la discussion">
    <p><strong>Réponds, partage, suis @${esc(post.pseudo)} sur ${esc(SITE_NAME)}.</strong> ${esc(SITE_TAGLINE)} : zéro publicité, fil chronologique, données hébergées en France.</p>
    <div class="row"><a class="btn" href="/post/${post.id}">Ouvrir dans l’appli</a><a class="btn alt" href="/auth">Créer un compte</a></div>
  </aside>
  <p class="src">Ce post est public parce que son auteur a choisi de le rendre visible sans connexion. <a href="/legal/confidentialite">En savoir plus</a>.</p>
</article>
</main>
`,
  );
}

export function renderPublicationsPage(posts: PublicPost[], origin: string): string {
  const path = '/publications';
  const title = `Publications publiques — ${SITE_NAME}`;
  const description = `Les derniers posts que leurs auteurs ont choisi de rendre publics sur ${SITE_NAME}, le réseau social français et souverain, sans pub.`;
  const head = headTags({
    origin,
    path,
    title,
    description,
    robots: posts.length > 0 ? ROBOTS_INDEX : ROBOTS_NOINDEX,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@graph': [
          organization(origin),
          website(origin),
          {
            '@type': 'CollectionPage',
            '@id': `${origin}${path}#page`,
            url: origin + path,
            name: title,
            description,
            inLanguage: 'fr-FR',
            isPartOf: { '@id': `${origin}/#website` },
          },
        ],
      },
    ],
  });
  const items = posts
    .map((p) => {
      const sum = excerpt(p.text || (p.video ? 'Une vidéo' : p.audio ? 'Un message vocal' : 'Une image'), 160);
      return `<li><a class="card" href="/p/${p.id}"><span class="by">${esc(authorName(p))} · @${esc(p.pseudo)} · <time datetime="${p.createdAt.toISOString()}">${frenchDateTime(p.createdAt)}</time></span><br />${esc(sum)}</a></li>`;
    })
    .join('');
  return layout(
    head,
    `<main id="contenu">
<article>
  <nav class="crumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a> › <span aria-current="page">Publications</span></nav>
  <header>
    <span class="kicker">Publications</span>
    <h1>Publications publiques</h1>
    <p class="lead">Les derniers posts que leurs auteurs ont choisi de rendre visibles sans connexion sur ${esc(SITE_NAME)}.</p>
  </header>
  ${posts.length ? `<ul class="plist">${items}</ul>` : '<p>Aucune publication publique pour le moment.</p>'}
  <aside class="cta" aria-label="Rejoindre la discussion">
    <p><strong>Publie à ton tour.</strong> Sur ${esc(SITE_NAME)}, tu choisis, post par post, ce qui est public. ${esc(SITE_TAGLINE)}.</p>
    <div class="row"><a class="btn" href="/auth">Créer un compte</a><a class="btn alt" href="/mobilisations-en-france">Mobilisations en France</a></div>
  </aside>
</article>
</main>
`,
  );
}

/* Post inexistant, retiré, repassé en privé, ou compte suspendu/banni : 410 pour que les moteurs le désindexent vite. */
export function renderGonePage(origin: string, path: string): string {
  const head = headTags({
    origin,
    path,
    title: `Contenu retiré — ${SITE_NAME}`,
    description: 'Ce contenu n’est plus public.',
    robots: ROBOTS_NOINDEX,
    canonical: false,
  });
  return layout(
    head,
    `<main id="contenu"><article>
  <h1>Ce contenu n’est plus public</h1>
  <p>Le post a été supprimé ou son auteur l’a repassé en privé.</p>
  <p><a class="btn" href="/publications">Voir les publications publiques</a></p>
</article></main>
`,
  );
}

export function sitemapPostsXml(origin: string, posts: PublicPost[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${posts
  .map(
    (p) =>
      `  <url><loc>${esc(`${origin}/p/${p.id}`)}</loc><lastmod>${(p.editedAt ?? p.createdAt).toISOString()}</lastmod></url>`,
  )
  .join('\n')}
</urlset>
`;
}
