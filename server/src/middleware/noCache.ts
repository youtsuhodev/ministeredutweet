import type { NextFunction, Request, Response } from 'express';

/* Politique « aucun cache » : ni le navigateur, ni la PWA, ni un proxy ou un CDN ne doivent conserver
   la moindre réponse (pages, scripts, API, médias). Posé en tout premier : les routes et fichiers
   statiques ne doivent pas le contredire (ils désactivent aussi leur propre Cache-Control / ETag). */
export function noCache(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
}
