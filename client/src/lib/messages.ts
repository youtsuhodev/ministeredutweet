import { api } from '../services/api';

/* Types et utilitaires partagés de la messagerie privée (miroir des DTO de server/src/services/messages.ts). */

export interface Person {
  uid: string;
  pseudo: string;
  displayName: string | null;
  avatar: string | null;
}

export interface Member extends Person {
  verified: boolean;
  role: 'owner' | 'member';
  /* dernier message lu par ce membre (sert aux accusés de lecture) */
  lastRead: number;
}

export interface ChatMedia {
  url: string;
  type: 'image' | 'video' | 'audio';
  duration: number | null;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  kind: 'text' | 'system';
  sender: Person | null;
  body: string;
  media: ChatMedia | null;
  createdAt: number;
  deleted: boolean;
}

export interface Conversation {
  id: number;
  type: 'direct' | 'group';
  title: string | null;
  members: Member[];
  lastMessage: { preview: string; at: number; senderUid: string | null } | null;
  unread: number;
  muted: boolean;
  role: 'owner' | 'member';
  updatedAt: number;
}

export type DmPolicy = 'everyone' | 'mutual' | 'none';

export const MAX_BODY = 2000;
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const IMAGE_TYPES = 'image/jpeg,image/png,image/gif,image/webp';
export const VIDEO_TYPES = 'video/mp4,video/webm,video/ogg,video/quicktime';

export const personName = (p: Pick<Person, 'pseudo' | 'displayName'>) => p.displayName || p.pseudo;

export function otherMember(c: Conversation, meUid: string): Member | undefined {
  return c.members.find((m) => m.uid !== meUid);
}

export function conversationTitle(c: Conversation, meUid: string): string {
  if (c.type === 'group') return c.title || 'Groupe';
  const other = otherMember(c, meUid);
  return other ? personName(other) : 'Conversation';
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (sameDay(d, now)) return "Aujourd'hui";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/* Heure du jour si c'est aujourd'hui, sinon jour court : pour la liste des conversations. */
export function listTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (sameDay(d, now)) return clockTime(ms);
  const diffDays = Math.floor((now.getTime() - ms) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/* Ouvre (ou crée) la conversation directe avec ce pseudo ; lève une erreur lisible si le destinataire refuse. */
export async function openDirect(pseudo: string): Promise<number> {
  const r = await api.post<{ id: number }>('/messages/conversations/direct', { pseudo });
  return r.id;
}

export const mediaLabel = (type: ChatMedia['type']) =>
  type === 'image' ? '📷 Photo' : type === 'video' ? '🎬 Vidéo' : '🎤 Message vocal';
