import type { NextFunction, Request, Response } from 'express';

/* ws:// et wss:// vers notre propre hôte (le schéma ws(s) n'est pas couvert par 'self' partout). */
function wsOrigins(host: string | undefined): string {
  if (!host || !/^[A-Za-z0-9.:-]+$/.test(host)) return '';
  return `wss://${host} ws://${host}`;
}

/* Domaines autorisés à s'afficher dans une iframe (voir client/src/lib/embeds.ts). */
const EMBED_FRAME_HOSTS = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://open.spotify.com',
  'https://w.soundcloud.com',
  'https://www.tiktok.com',
  'https://platform.twitter.com',
  'https://www.instagram.com',
  'https://player.twitch.tv',
  'https://clips.twitch.tv',
].join(' ');

/* En-têtes de sécurité de base (sans dépendance). La CSP n'est posée qu'en production :
   en dev, Vite injecte des scripts inline pour le HMR. */
export function securityHeaders(isProd: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    res.removeHeader('X-Powered-By');
    if (isProd) {
      if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          /* 'wasm-unsafe-eval' et blob: : le captcha Cap calcule sa preuve de travail dans un Worker WebAssembly. */
          "script-src 'self' 'wasm-unsafe-eval'",
          "worker-src 'self' blob:",
          "style-src 'self' 'unsafe-inline'",
          /* Pas de https: ici : aucune image/vidéo externe (pixel espion, traçage) ne doit se charger. */
          "img-src 'self' data: blob:",
          "media-src 'self' blob:",
          /* WebSocket de la messagerie (même origine) : certains navigateurs ne couvrent pas ws: avec 'self'. */
          `connect-src 'self' ${wsOrigins(req.get('host'))}`.trim(),
          /* Intégrations de liens sociaux : domaines précis uniquement (client/src/lib/embeds.ts), iframes chargées au clic. */
          `frame-src ${EMBED_FRAME_HOSTS}`,
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join('; '),
      );
    }
    next();
  };
}
