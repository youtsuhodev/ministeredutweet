import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { PAGES } from '../seo/content.js';
import { injectShell, renderPage, robotsTxt, shellMeta, sitemapIndexXml, sitemapPagesXml } from '../seo/render.js';
import { renderGonePage, renderPostPage, renderPublicationsPage, sitemapPostsXml } from '../seo/renderPosts.js';
import { indexNowKey } from '../services/indexnow.js';
import { recordViews, viewerHash } from '../services/postViews.js';
import { explainHidden, getPublicPost, listPublicPosts } from '../services/publicPosts.js';
import { parseId } from '../utils/validation.js';

/* Pages publiques servies sans connexion et lisant la base : un robot ne doit pas pouvoir la saturer. */
const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, message: 'Trop de requêtes, ralentis un peu' });
const BOT_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|discord|telegram|curl|wget|python-requests/i;
const newest = (posts: { createdAt: Date; editedAt: Date | null }[]) =>
  posts.length ? (posts[0].editedAt ?? posts[0].createdAt).toISOString() : undefined;

/* robots.txt, sitemap.xml et pages de contenu référencées, rendues côté serveur (HTML complet, sans JS).
   À monter avant le fallback de la SPA. Le middleware noCache (index.ts) s'applique : on ne pose pas de Cache-Control ici. */
export function seoRouter(origin: string): Router {
  const router = Router();

  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain; charset=utf-8').send(robotsTxt(origin));
  });

  router.get('/sitemap.xml', publicLimiter, async (_req, res, next) => {
    try {
      const posts = await listPublicPosts(1);
      res.type('application/xml; charset=utf-8').send(sitemapIndexXml(origin, newest(posts)));
    } catch (err) {
      next(err);
    }
  });

  router.get('/sitemap-pages.xml', publicLimiter, async (_req, res, next) => {
    try {
      const posts = await listPublicPosts(1);
      res.type('application/xml; charset=utf-8').send(sitemapPagesXml(origin, newest(posts)));
    } catch (err) {
      next(err);
    }
  });

  /* Les 10 000 posts publics les plus récents (limite d'un sitemap : 50 000 URL). */
  router.get('/sitemap-posts.xml', publicLimiter, async (_req, res, next) => {
    try {
      res.type('application/xml; charset=utf-8').send(sitemapPostsXml(origin, await listPublicPosts(10000)));
    } catch (err) {
      next(err);
    }
  });

  router.get('/publications', publicLimiter, async (_req, res, next) => {
    try {
      res.type('text/html; charset=utf-8').send(renderPublicationsPage(await listPublicPosts(50), origin));
    } catch (err) {
      next(err);
    }
  });

  router.get('/p/:id', publicLimiter, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const post = id ? await getPublicPost(id) : null;
      if (!post) {
        console.warn(`[SEO] /p/${req.params.id} → 410 : ${id ? await explainHidden(id) : 'identifiant invalide'}`);
        res.status(410).type('text/html; charset=utf-8').send(renderGonePage(origin, req.path));
        return;
      }
      /* Une visite de la page publique compte comme une vue (sauf robots et aperçus de lien). */
      if (!BOT_RE.test(req.get('user-agent') ?? '')) {
        recordViews([post.id], viewerHash(req.ip)).catch((err) => console.warn('[VUES]', (err as Error).message));
      }
      res.type('text/html; charset=utf-8').send(renderPostPage(post, origin));
    } catch (err) {
      next(err);
    }
  });

  /* Fichier de vérification IndexNow : /<clé>.txt contient la clé (INDEXNOW_KEY). */
  router.get(/^\/([A-Za-z0-9-]{8,128})\.txt$/, (req, res, next) => {
    const key = indexNowKey();
    if (key && req.params[0] === key) {
      res.type('text/plain; charset=utf-8').send(key);
      return;
    }
    next();
  });

  for (const page of PAGES) {
    router.get(page.path, (_req, res) => {
      res.type('text/html; charset=utf-8').send(renderPage(page, origin));
    });
  }

  return router;
}

/* Fallback de la SPA en production : même index.html, mais avec les balises SEO adaptées à l'URL
   (titre, description, canonical, Open Graph, JSON-LD) et un X-Robots-Tag pour les pages privées. */
export function spaFallback(distPath: string, origin: string): RequestHandler {
  let template: string | undefined;
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      template ??= readFileSync(resolve(distPath, 'index.html'), 'utf8');
      const meta = shellMeta(req.path, origin);
      if (meta.noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.type('text/html; charset=utf-8').send(injectShell(template, meta));
    } catch (err) {
      next(err);
    }
  };
}
