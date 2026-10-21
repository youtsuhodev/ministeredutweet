import { api } from '../services/api';

/* Vues : un post compte comme « vu » dès qu'il est affiché à l'écran (voir PostCard), sans qu'il faille cliquer dessus.
   Les identifiants sont envoyés par lots ; le serveur ne compte qu'une vue par visiteur (empreinte de l'IP) et par post,
   et renvoie les posts réellement comptés pour que le compteur affiché monte tout de suite. */
const seen = new Set<number>();
let queue: number[] = [];
let timer: number | undefined;

const FLUSH_DELAY_MS = 800;

/* Les cartes de post s'abonnent ici pour afficher la vue qui vient d'être comptée. */
const listeners = new Map<number, Set<() => void>>();

export function onViewCounted(id: number, callback: () => void): () => void {
  const set = listeners.get(id) ?? new Set();
  set.add(callback);
  listeners.set(id, set);
  return () => {
    set.delete(callback);
    if (set.size === 0) listeners.delete(id);
  };
}

async function flush(): Promise<void> {
  timer = undefined;
  const ids = queue.slice(0, 50);
  queue = queue.slice(50);
  if (ids.length === 0) return;
  try {
    const res = await api.post<{ counted?: number[] }>('/posts/views', { ids });
    for (const id of res.counted ?? []) for (const cb of listeners.get(id) ?? []) cb();
  } catch {
    /* un compteur de vues ne doit jamais gêner la lecture ; l'envoi a échoué (réseau, limite) : le post pourra être recompté */
    for (const id of ids) seen.delete(id);
  }
  if (queue.length > 0) timer = window.setTimeout(flush, FLUSH_DELAY_MS);
}

export function trackView(id: number): void {
  if (seen.has(id)) return;
  seen.add(id);
  queue.push(id);
  if (timer === undefined) timer = window.setTimeout(flush, FLUSH_DELAY_MS);
}

/* Onglet masqué ou fermé : on envoie tout de suite ce qui reste (keepalive survit à la fermeture de la page). */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || queue.length === 0) return;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    const ids = queue.slice(0, 50);
    queue = queue.slice(50);
    fetch('/api/posts/views', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  });
}

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
export const formatCount = (n: number): string => compact.format(n);
