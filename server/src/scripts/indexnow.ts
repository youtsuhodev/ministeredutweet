/* Envoie à IndexNow (Bing, Yandex…) toutes les pages publiques d'un coup : pages de contenu et posts publics.
   À lancer après un déploiement ou une mise à jour des pages :
     npm --prefix server run indexnow
   Nécessite INDEXNOW_KEY et un APP_URL en https dans server/.env. */
import pool from '../config/database.js';
import { LEGAL_PAGES, PAGES } from '../seo/content.js';
import { indexNowKey, submitIndexNow } from '../services/indexnow.js';
import { listPublicPosts } from '../services/publicPosts.js';

if (!indexNowKey()) {
  console.error('✘ INDEXNOW_KEY absente ou invalide (8 à 128 caractères : lettres, chiffres, tirets).');
  await pool.end();
  process.exit(2);
}

const posts = await listPublicPosts(1000);
const paths = [
  '/',
  '/publications',
  ...PAGES.map((p) => p.path),
  ...Object.keys(LEGAL_PAGES).map((slug) => `/legal/${slug}`),
  ...posts.map((p) => `/p/${p.id}`),
];
const sent = await submitIndexNow(paths);
console.log(
  sent > 0
    ? `✔ ${sent} URL envoyée(s) à IndexNow`
    : '✘ Envoi refusé ou impossible (APP_URL en https ? clé accessible ?)',
);
await pool.end();
process.exit(sent > 0 ? 0 : 1);
