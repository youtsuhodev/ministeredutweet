import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import { PAGES } from '../seo/content.js';
import { injectShell, renderPage, robotsTxt, shellMeta, sitemapXml } from '../seo/render.js';

/* robots.txt, sitemap.xml et pages de contenu référencées, rendues côté serveur (HTML complet, sans JS).
   À monter avant le fallback de la SPA. Le middleware noCache (index.ts) s'applique : on ne pose pas de Cache-Control ici. */
export function seoRouter(origin: string): Router {
  const router = Router();

  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain; charset=utf-8').send(robotsTxt(origin));
  });

  router.get('/sitemap.xml', (_req, res) => {
    res.type('application/xml; charset=utf-8').send(sitemapXml(origin));
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
