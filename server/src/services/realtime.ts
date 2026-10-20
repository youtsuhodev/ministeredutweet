import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { getOne } from '../config/database.js';
import { sessionCookieFromHeader } from '../middleware/auth.js';
import { hashSessionId } from '../utils/crypto.js';

/* Temps réel (WebSocket) : un seul point d'entrée « /ws », authentifié par le cookie de session.
   Le serveur pousse des évènements JSON aux utilisateurs connectés ; le client n'envoie que
   « typing » et « presence » (tout le reste passe par l'API REST, qui valide et limite). */

interface SocketState {
  uid: string;
  sessionId: string;
  alive: boolean;
  /* L'onglet / la fenêtre est visible : inutile alors d'envoyer en plus une notification push. */
  visible: boolean;
  lastTypingAt: number;
}

const states = new WeakMap<WebSocket, SocketState>();
const byUser = new Map<string, Set<WebSocket>>();

const MAX_SOCKETS_PER_USER = 8;
const HEARTBEAT_MS = 30_000;
const REVALIDATE_EVERY = 10; // battements : revérifie la session toutes les ~5 min

export interface ClientEvent {
  type: string;
  [key: string]: unknown;
}
type ClientHandler = (uid: string, event: ClientEvent) => void;
let clientHandler: ClientHandler | null = null;

/* La messagerie s'abonne ici aux évènements envoyés par les clients (évite un import circulaire). */
export function onClientEvent(handler: ClientHandler): void {
  clientHandler = handler;
}

export function publishToUsers(uids: Iterable<string>, event: object): void {
  const payload = JSON.stringify(event);
  for (const uid of new Set(uids)) {
    for (const ws of byUser.get(uid) ?? []) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}

export function isUserVisible(uid: string): boolean {
  for (const ws of byUser.get(uid) ?? []) {
    if (ws.readyState === WebSocket.OPEN && states.get(ws)?.visible) return true;
  }
  return false;
}

export function disconnectUser(uid: string, code = 4001): void {
  for (const ws of byUser.get(uid) ?? []) ws.close(code, 'session');
}

async function sessionUser(sessionId: string): Promise<string | null> {
  const row = await getOne<{ uid: string }>(
    `SELECT u.uid FROM sessions s JOIN users u ON u.uid = s.uid
     WHERE s.id = ? AND s.expires_at > ? AND u.status <> 'banned'`,
    [sessionId, Date.now()],
  );
  return row?.uid ?? null;
}

function reject(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/* Un navigateur envoie toujours l'en-tête Origin sur un WebSocket : on n'accepte que notre propre site
   (sans cela, n'importe quelle page ouverte par l'utilisateur pourrait se connecter avec ses cookies). */
function originAllowed(req: IncomingMessage, appOrigin: string): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (origin === appOrigin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function attachRealtime(server: Server, appOrigin: string): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    /* Les autres chemins (HMR de Vite en dev…) gardent leurs propres gestionnaires. */
    if (path !== '/ws') return;
    void (async () => {
      try {
        if (!originAllowed(req, appOrigin)) return reject(socket, '403 Forbidden');
        const raw = sessionCookieFromHeader(req.headers.cookie);
        if (!raw) return reject(socket, '401 Unauthorized');
        const sessionId = hashSessionId(raw);
        const uid = await sessionUser(sessionId);
        if (!uid) return reject(socket, '401 Unauthorized');
        if ((byUser.get(uid)?.size ?? 0) >= MAX_SOCKETS_PER_USER) return reject(socket, '429 Too Many Requests');
        wss.handleUpgrade(req, socket, head, (ws) => register(ws, uid, sessionId));
      } catch (err) {
        console.error('[WS] Upgrade error:', (err as Error).message);
        reject(socket, '500 Internal Server Error');
      }
    })();
  });

  function register(ws: WebSocket, uid: string, sessionId: string): void {
    states.set(ws, { uid, sessionId, alive: true, visible: true, lastTypingAt: 0 });
    const set = byUser.get(uid) ?? new Set<WebSocket>();
    set.add(ws);
    byUser.set(uid, set);

    ws.on('pong', () => {
      const s = states.get(ws);
      if (s) s.alive = true;
    });
    ws.on('message', (data: RawData) => {
      const s = states.get(ws);
      if (!s) return;
      let event: ClientEvent;
      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!event || typeof event.type !== 'string') return;
      if (event.type === 'presence') {
        s.visible = event.visible === true;
      } else if (event.type === 'typing') {
        const now = Date.now();
        if (now - s.lastTypingAt < 2000) return; // un évènement « en train d'écrire » toutes les 2 s au plus
        s.lastTypingAt = now;
        clientHandler?.(uid, event);
      }
    });
    ws.on('close', () => {
      const current = byUser.get(uid);
      current?.delete(ws);
      if (current && current.size === 0) byUser.delete(uid);
    });
    ws.on('error', () => ws.terminate());
    ws.send(JSON.stringify({ type: 'ready' }));
  }

  let beat = 0;
  const timer = setInterval(() => {
    beat++;
    const revalidate = beat % REVALIDATE_EVERY === 0;
    for (const set of byUser.values()) {
      for (const ws of set) {
        const s = states.get(ws);
        if (!s) continue;
        if (!s.alive) {
          ws.terminate();
          continue;
        }
        s.alive = false;
        ws.ping();
        if (revalidate) {
          void sessionUser(s.sessionId)
            .then((u) => {
              if (u !== s.uid) ws.close(4001, 'session');
            })
            .catch(() => {});
        }
      }
    }
  }, HEARTBEAT_MS);
  timer.unref();

  server.on('close', () => {
    clearInterval(timer);
    wss.close();
  });
}
