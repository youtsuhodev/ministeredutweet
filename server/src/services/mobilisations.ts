import type { ResultSetHeader } from 'mysql2/promise';
import { getOne, query, withTransaction } from '../config/database.js';
import { isUserVisible, publishToUsers } from './realtime.js';
import { uploadExists } from './uploads.js';

export class MobilisationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const MAX_TITLE = 200;
export const MAX_DESCRIPTION = 5000;
export const MAX_PRACTICAL = 2000;
export const MAX_LOCATION = 300;
export const MAX_COMMENT = 2000;

export interface MobilisationRow {
  id: number;
  slug: string;
  title: string;
  description: string;
  practical_info: string | null;
  event_date: string;
  location: string;
  image: string | null;
  status: 'upcoming' | 'ongoing' | 'past' | 'cancelled';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MobilisationDto {
  id: number;
  slug: string;
  title: string;
  description: string;
  practicalInfo: string | null;
  eventDate: string;
  location: string;
  image: string | null;
  status: string;
  createdBy: { uid: string; pseudo: string; displayName: string | null; avatar: string | null };
  createdAt: string;
  updatedAt: string;
  participantsCount: number;
  isParticipant: boolean;
  mediaCount: number;
  commentsCount: number;
}

export interface MobilisationListItem {
  id: number;
  slug: string;
  title: string;
  eventDate: string;
  location: string;
  image: string | null;
  status: string;
  participantsCount: number;
  isParticipant: boolean;
}

export interface MobilisationCommentDto {
  id: number;
  mobilisationId: number;
  body: string;
  createdAt: string;
  sender: { uid: string; pseudo: string; displayName: string | null; avatar: string | null };
}

export interface MobilisationMediaDto {
  id: number;
  url: string;
  type: 'image' | 'video';
  createdAt: string;
  sender: { uid: string; pseudo: string; displayName: string | null; avatar: string | null };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || 'mobilisation';
  let candidate = base;
  let n = 1;
  while (await getOne<{ id: number }>('SELECT id FROM mobilisations WHERE slug = ?', [candidate])) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

function toDto(row: MobilisationRow & { participantsCount: number; mediaCount: number; commentsCount: number }, uid: string): MobilisationDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    practicalInfo: row.practical_info,
    eventDate: row.event_date,
    location: row.location,
    image: row.image,
    status: row.status,
    createdBy: { uid: row.created_by, pseudo: '', displayName: null, avatar: null },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participantsCount: row.participantsCount,
    isParticipant: false,
    mediaCount: row.mediaCount,
    commentsCount: row.commentsCount,
  };
}

export async function listMobilisations(uid: string, opts: { status?: string; before?: number; limit: number }): Promise<MobilisationListItem[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    conditions.push('m.status = ?');
    params.push(opts.status);
  }
  if (opts.before) {
    conditions.push('m.id < ?');
    params.push(opts.before);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(opts.limit);

  const rows = await query<(MobilisationRow & { participantsCount: number; isParticipant: number })[]>(
    `SELECT m.*,
       (SELECT COUNT(*) FROM mobilisation_participants mp WHERE mp.mobilisation_id = m.id) AS participantsCount,
       EXISTS(SELECT 1 FROM mobilisation_participants mp2 WHERE mp2.mobilisation_id = m.id AND mp2.uid = ?) AS isParticipant
     FROM mobilisations m
     ${where}
     ORDER BY m.event_date DESC
     LIMIT ?`,
    [uid, ...params],
  );

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    eventDate: r.event_date,
    location: r.location,
    image: r.image,
    status: r.status,
    participantsCount: r.participantsCount,
    isParticipant: !!r.isParticipant,
  }));
}

export async function getMobilisation(id: number, uid: string): Promise<MobilisationDto | null> {
  const row = await getOne<MobilisationRow & { participantsCount: number; mediaCount: number; commentsCount: number; isParticipant: number }>(
    `SELECT m.*,
       (SELECT COUNT(*) FROM mobilisation_participants mp WHERE mp.mobilisation_id = m.id) AS participantsCount,
       (SELECT COUNT(*) FROM mobilisation_media mm WHERE mm.mobilisation_id = m.id) AS mediaCount,
       (SELECT COUNT(*) FROM mobilisation_comments mc WHERE mc.mobilisation_id = m.id AND mc.deleted_at IS NULL) AS commentsCount,
       EXISTS(SELECT 1 FROM mobilisation_participants mp2 WHERE mp2.mobilisation_id = m.id AND mp2.uid = ?) AS isParticipant
     FROM mobilisations m WHERE m.id = ?`,
    [uid, id],
  );
  if (!row) return null;
  const dto = toDto(row, uid);
  dto.isParticipant = !!row.isParticipant;
  const creator = await getOne<{ pseudo: string; displayName: string | null; avatar: string | null }>(
    'SELECT pseudo, displayName, avatar FROM users WHERE uid = ?',
    [row.created_by],
  );
  if (creator) {
    dto.createdBy = { uid: row.created_by, ...creator };
  }
  return dto;
}

export async function getMobilisationBySlug(slug: string, uid: string): Promise<MobilisationDto | null> {
  const row = await getOne<MobilisationRow & { id: number }>('SELECT * FROM mobilisations WHERE slug = ?', [slug]);
  if (!row) return null;
  return getMobilisation(row.id, uid);
}

export async function createMobilisation(
  uid: string,
  data: { title: string; description: string; practicalInfo?: string; eventDate: string; location: string; image?: string },
): Promise<MobilisationDto> {
  if (!data.title || data.title.length > MAX_TITLE) throw new MobilisationError('Titre invalide');
  if (!data.description || data.description.length > MAX_DESCRIPTION) throw new MobilisationError('Description invalide');
  if (!data.location || data.location.length > MAX_LOCATION) throw new MobilisationError('Lieu invalide');
  if (!data.eventDate) throw new MobilisationError('Date de l\'événement requise');
  if (data.image && !uploadExists(data.image)) throw new MobilisationError('Image introuvable');

  const slug = await uniqueSlug(data.title);
  const result = await query<ResultSetHeader>(
    `INSERT INTO mobilisations (slug, title, description, practical_info, event_date, location, image, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [slug, data.title.trim(), data.description.trim(), data.practicalInfo?.trim() ?? null, data.eventDate, data.location.trim(), data.image ?? null, uid],
  );
  const dto = await getMobilisation(result.insertId, uid);
  if (!dto) throw new MobilisationError('Création échouée', 500);
  return dto;
}

export async function updateMobilisation(
  id: number,
  uid: string,
  data: { title?: string; description?: string; practicalInfo?: string; eventDate?: string; location?: string; image?: string; status?: string },
): Promise<void> {
  const mob = await getOne<{ created_by: string }>('SELECT created_by FROM mobilisations WHERE id = ?', [id]);
  if (!mob) throw new MobilisationError('Mobilisation introuvable', 404);
  if (mob.created_by !== uid) throw new MobilisationError('Non autorisé', 403);

  const fields: string[] = [];
  const params: unknown[] = [];
  if (data.title !== undefined) {
    if (!data.title || data.title.length > MAX_TITLE) throw new MobilisationError('Titre invalide');
    fields.push('title = ?');
    params.push(data.title.trim());
  }
  if (data.description !== undefined) {
    if (!data.description || data.description.length > MAX_DESCRIPTION) throw new MobilisationError('Description invalide');
    fields.push('description = ?');
    params.push(data.description.trim());
  }
  if (data.practicalInfo !== undefined) {
    if (data.practicalInfo && data.practicalInfo.length > MAX_PRACTICAL) throw new MobilisationError('Infos pratiques trop longues');
    fields.push('practical_info = ?');
    params.push(data.practicalInfo?.trim() ?? null);
  }
  if (data.eventDate !== undefined) {
    fields.push('event_date = ?');
    params.push(data.eventDate);
  }
  if (data.location !== undefined) {
    if (!data.location || data.location.length > MAX_LOCATION) throw new MobilisationError('Lieu invalide');
    fields.push('location = ?');
    params.push(data.location.trim());
  }
  if (data.image !== undefined) {
    if (data.image && !uploadExists(data.image)) throw new MobilisationError('Image introuvable');
    fields.push('image = ?');
    params.push(data.image ?? null);
  }
  if (data.status !== undefined) {
    if (!['upcoming', 'ongoing', 'past', 'cancelled'].includes(data.status)) throw new MobilisationError('Statut invalide');
    fields.push('status = ?');
    params.push(data.status);
  }
  if (fields.length === 0) return;
  params.push(id);
  await query(`UPDATE mobilisations SET ${fields.join(', ')} WHERE id = ?`, params);
}

export async function deleteMobilisation(id: number, uid: string): Promise<void> {
  const mob = await getOne<{ created_by: string }>('SELECT created_by FROM mobilisations WHERE id = ?', [id]);
  if (!mob) throw new MobilisationError('Mobilisation introuvable', 404);
  if (mob.created_by !== uid) throw new MobilisationError('Non autorisé', 403);
  await query('DELETE FROM mobilisations WHERE id = ?', [id]);
}

export async function joinMobilisation(id: number, uid: string): Promise<void> {
  const mob = await getOne<{ id: number }>('SELECT id FROM mobilisations WHERE id = ?', [id]);
  if (!mob) throw new MobilisationError('Mobilisation introuvable', 404);
  await query('INSERT IGNORE INTO mobilisation_participants (mobilisation_id, uid) VALUES (?, ?)', [id, uid]);
}

export async function leaveMobilisation(id: number, uid: string): Promise<void> {
  await query('DELETE FROM mobilisation_participants WHERE mobilisation_id = ? AND uid = ?', [id, uid]);
}

export async function addMobilisationMedia(id: number, uid: string, url: string, type: 'image' | 'video'): Promise<MobilisationMediaDto> {
  const mob = await getOne<{ id: number }>('SELECT id FROM mobilisations WHERE id = ?', [id]);
  if (!mob) throw new MobilisationError('Mobilisation introuvable', 404);
  if (!uploadExists(url)) throw new MobilisationError('Média introuvable');
  const result = await query<ResultSetHeader>(
    'INSERT INTO mobilisation_media (mobilisation_id, uid, url, type) VALUES (?, ?, ?, ?)',
    [id, uid, url, type],
  );
  const sender = await getOne<{ pseudo: string; displayName: string | null; avatar: string | null }>(
    'SELECT pseudo, displayName, avatar FROM users WHERE uid = ?',
    [uid],
  );
  return {
    id: result.insertId,
    url,
    type,
    createdAt: new Date().toISOString(),
    sender: { uid, pseudo: sender?.pseudo ?? '', displayName: sender?.displayName ?? null, avatar: sender?.avatar ?? null },
  };
}

export async function listMobilisationMedia(id: number, opts: { before?: number; limit: number }): Promise<MobilisationMediaDto[]> {
  const params: unknown[] = [id];
  let where = 'mm.mobilisation_id = ?';
  if (opts.before) {
    where += ' AND mm.id < ?';
    params.push(opts.before);
  }
  params.push(opts.limit);
  const rows = await query<(MobilisationMediaDto & { pseudo: string; displayName: string | null; avatar: string | null })[]>(
    `SELECT mm.id, mm.url, mm.type, mm.created_at AS createdAt, u.pseudo, u.displayName, u.avatar
     FROM mobilisation_media mm JOIN users u ON u.uid = mm.uid
     WHERE ${where} ORDER BY mm.id DESC LIMIT ?`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    type: r.type,
    createdAt: r.createdAt,
    sender: { uid: '', pseudo: r.pseudo, displayName: r.displayName, avatar: r.avatar },
  }));
}

export async function addMobilisationComment(id: number, uid: string, body: string): Promise<MobilisationCommentDto> {
  if (!body || body.length > MAX_COMMENT) throw new MobilisationError('Commentaire invalide');
  const mob = await getOne<{ id: number }>('SELECT id FROM mobilisations WHERE id = ?', [id]);
  if (!mob) throw new MobilisationError('Mobilisation introuvable', 404);
  const result = await query<ResultSetHeader>(
    'INSERT INTO mobilisation_comments (mobilisation_id, uid, body) VALUES (?, ?, ?)',
    [id, uid, body.trim()],
  );
  const sender = await getOne<{ pseudo: string; displayName: string | null; avatar: string | null }>(
    'SELECT pseudo, displayName, avatar FROM users WHERE uid = ?',
    [uid],
  );
  return {
    id: result.insertId,
    mobilisationId: id,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    sender: { uid, pseudo: sender?.pseudo ?? '', displayName: sender?.displayName ?? null, avatar: sender?.avatar ?? null },
  };
}

export async function listMobilisationComments(id: number, opts: { before?: number; limit: number }): Promise<MobilisationCommentDto[]> {
  const params: unknown[] = [id];
  let where = 'mc.mobilisation_id = ? AND mc.deleted_at IS NULL';
  if (opts.before) {
    where += ' AND mc.id < ?';
    params.push(opts.before);
  }
  params.push(opts.limit);
  const rows = await query<{ id: number; body: string; created_at: string; uid: string; pseudo: string; displayName: string | null; avatar: string | null }[]>(
    `SELECT mc.id, mc.body, mc.created_at, mc.uid, u.pseudo, u.displayName, u.avatar
     FROM mobilisation_comments mc JOIN users u ON u.uid = mc.uid
     WHERE ${where} ORDER BY mc.id DESC LIMIT ?`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    mobilisationId: id,
    body: r.body,
    createdAt: r.created_at,
    sender: { uid: r.uid, pseudo: r.pseudo, displayName: r.displayName, avatar: r.avatar },
  }));
}

export async function deleteMobilisationComment(commentId: number, uid: string): Promise<void> {
  const row = await getOne<{ uid: string }>('SELECT uid FROM mobilisation_comments WHERE id = ?', [commentId]);
  if (!row) throw new MobilisationError('Commentaire introuvable', 404);
  if (row.uid !== uid) throw new MobilisationError('Non autorisé', 403);
  await query('UPDATE mobilisation_comments SET deleted_at = NOW() WHERE id = ?', [commentId]);
}

export async function getParticipants(id: number, limit: number): Promise<{ uid: string; pseudo: string; displayName: string | null; avatar: string | null; joinedAt: string }[]> {
  return query(
    `SELECT mp.uid, u.pseudo, u.displayName, u.avatar, mp.joined_at AS joinedAt
     FROM mobilisation_participants mp JOIN users u ON u.uid = mp.uid
     WHERE mp.mobilisation_id = ? ORDER BY mp.joined_at DESC LIMIT ?`,
    [id, limit],
  );
}
