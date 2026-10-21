import { api } from '../services/api';

/* Vues : un post compte comme « vu » quand il est resté à l'écran (voir PostCard). Les identifiants sont envoyés
   par lots ; le serveur ne compte qu'une vue par visiteur (empreinte de l'IP) et par post. */
const seen = new Set<number>();
let queue: number[] = [];
let timer: number | undefined;

async function flush(): Promise<void> {
  timer = undefined;
  const ids = queue.slice(0, 50);
  queue = queue.slice(50);
  if (ids.length === 0) return;
  try {
    await api.post('/posts/views', { ids });
  } catch {
    /* un compteur de vues ne doit jamais gêner la lecture */
  }
  if (queue.length > 0) timer = window.setTimeout(flush, 1500);
}

export function trackView(id: number): void {
  if (seen.has(id)) return;
  seen.add(id);
  queue.push(id);
  if (timer === undefined) timer = window.setTimeout(flush, 1500);
}

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
export const formatCount = (n: number): string => compact.format(n);
