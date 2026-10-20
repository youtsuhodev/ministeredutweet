/* IndexNow (Bing, Yandex, Seznam, Naver…) : on prévient les moteurs dès qu'une page publique est créée,
   modifiée ou retirée, au lieu d'attendre leur prochain passage. Google n'utilise pas IndexNow : il découvre
   les pages par le sitemap (/sitemap.xml) et les liens (/publications).

   La clé vient uniquement de l'environnement (INDEXNOW_KEY : 8 à 128 caractères, lettres, chiffres et tirets,
   ex. `openssl rand -hex 16`). Sans clé, ou hors production (APP_URL non https), rien n'est envoyé. */

const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';
const BATCH_DELAY_MS = 3000;
const MAX_URLS = 1000;

export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && KEY_RE.test(key) ? key : null;
}

function siteOrigin(): string | null {
  try {
    const origin = new URL(process.env.APP_URL || '').origin;
    return origin.startsWith('https://') && !/localhost|127\.0\.0\.1/.test(origin) ? origin : null;
  } catch {
    return null;
  }
}

export function publicPostPath(id: number): string {
  return `/p/${id}`;
}

const pending = new Set<string>();
let timer: NodeJS.Timeout | undefined;

/* Envoie tout de suite ces chemins (« /p/12 ») à IndexNow. Renvoie le nombre d'URL acceptées (0 si désactivé ou refusé). */
export async function submitIndexNow(paths: string[]): Promise<number> {
  const key = indexNowKey();
  const origin = siteOrigin();
  const urls = [...new Set(paths)].slice(0, MAX_URLS);
  if (!key || !origin || urls.length === 0) return 0;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(origin).host,
        key,
        keyLocation: `${origin}/${key}.txt`,
        urlList: urls.map((p) => origin + p),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok || res.status === 202) return urls.length;
    console.warn(`[INDEXNOW] Réponse ${res.status} pour ${urls.length} URL(s)`);
  } catch (err) {
    console.warn('[INDEXNOW] Envoi impossible :', (err as Error).message);
  }
  return 0;
}

async function flush(): Promise<void> {
  timer = undefined;
  const paths = [...pending];
  pending.clear();
  await submitIndexNow(paths);
}

/* Ajoute des chemins (« /p/12 ») à la file ; envoyés en un lot 3 s plus tard. Ne bloque jamais l'appelant. */
export function notifyIndexNow(paths: string[]): void {
  if (!indexNowKey() || !siteOrigin()) return;
  for (const p of paths) pending.add(p);
  if (!timer) {
    timer = setTimeout(() => void flush(), BATCH_DELAY_MS);
    timer.unref();
  }
}
