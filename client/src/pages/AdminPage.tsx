import {
  ArrowLeft,
  FileText,
  Flag,
  LayoutDashboard,
  ScrollText,
  Search,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { inputClass, outlineBtn, primaryBtn } from '../components/formStyles';
import { REPORT_CATEGORIES } from '../components/ReportDialog';
import { useAuth } from '../hooks/useAuth';
import { fullDate, timeAgo } from '../lib/time';
import { api, errorMessage } from '../services/api';

/* Console de modération : page dédiée (pas le shell du réseau), réservée aux rôles moderator et admin.
   Sections : tableau de bord, signalements, utilisateurs, posts, journal. */

type Section = 'dashboard' | 'reports' | 'users' | 'posts' | 'log';

const SECTIONS: { id: Section; label: string; icon: typeof Flag }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'reports', label: 'Signalements', icon: Flag },
  { id: 'users', label: 'Utilisateurs', icon: UsersIcon },
  { id: 'posts', label: 'Posts', icon: FileText },
  { id: 'log', label: 'Journal', icon: ScrollText },
];

const SECTION_TITLES: Record<Section, string> = {
  dashboard: 'Tableau de bord',
  reports: 'Signalements',
  users: 'Utilisateurs',
  posts: 'Posts',
  log: 'Journal des actions',
};

type Status = 'open' | 'actioned' | 'dismissed' | 'all';

interface AdminStats {
  users: { total: number; active: number; suspended: number; banned: number; newLast7d: number };
  content: { posts: number; comments: number; postsLast24h: number };
  reports: { open: number; last7d: number };
}

interface AdminReport {
  id: number;
  category: string;
  reason: string | null;
  status: string;
  createdAt: string;
  reporter: string | null;
  openReportsOnPost: number;
  post: {
    id: number;
    exists: boolean;
    text: string | null;
    image: string | null;
    video: string | null;
    audio: string | null;
  } | null;
  target: { uid: string; pseudo: string; status: string; role: string } | null;
  resolution: string | null;
  handledAt: number | null;
}

interface AdminUser {
  uid: string;
  pseudo: string;
  role: string;
  status: string;
  suspendedUntil: number | null;
  statusReason: string | null;
  createdAt: number;
  reportsAgainst: number;
  postsCount?: number;
  lastSession?: number | null;
}

interface AdminPost {
  id: number;
  text: string | null;
  image: string | null;
  video: string | null;
  audio: string | null;
  createdAt: string;
  isRepost: boolean;
  author: { uid: string; pseudo: string; status: string };
  likesCount: number;
  commentsCount: number;
  openReports: number;
}

interface LogEntry {
  id: number;
  action: string;
  reason: string | null;
  createdAt: number;
  actor: string | null;
  target: string | null;
  postId: number | null;
  reportId: number | null;
}

const categoryLabel = (id: string) => REPORT_CATEGORIES.find((c) => c.id === id)?.label ?? id;

const ACTION_LABELS: Record<string, string> = {
  'report:dismiss': 'Signalement classé sans suite',
  'report:delete_post': 'Post supprimé',
  delete_chat: 'Message du salon supprimé',
  'report:warn': 'Avertissement',
  'report:suspend': 'Suspension (signalement)',
  'report:ban': 'Bannissement (signalement)',
  'user:suspend': 'Suspension',
  'user:unsuspend': 'Suspension levée',
  'user:ban': 'Bannissement',
  'user:unban': 'Bannissement levé',
  'user:delete_account': 'Compte supprimé',
  'user:set_role:moderator': 'Promu modérateur',
  'user:set_role:user': 'Rôle retiré',
  'post:delete': 'Post supprimé (direct)',
};

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'danger' | 'ok' }) {
  const color =
    tone === 'danger'
      ? 'text-[var(--danger)] border-[var(--danger)]/40'
      : tone === 'ok'
        ? 'text-[var(--repost-color)] border-[var(--repost-color)]/40'
        : 'text-[var(--text-secondary)] border-[var(--border-color)]';
  return <span className={`text-xs font-bold border rounded-full px-2 py-0.5 ${color}`}>{children}</span>;
}

function Alert({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="text-sm text-[var(--danger)]">
      {error}
    </p>
  ) : null;
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="spinner" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-center py-12 text-[var(--text-secondary)] px-4">{children}</p>;
}

/* ── Tableau de bord ────────────────────────────────────────────────────────── */

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'danger' | 'ok' }) {
  const color =
    tone === 'danger'
      ? 'text-[var(--danger)]'
      : tone === 'ok'
        ? 'text-[var(--repost-color)]'
        : 'text-[var(--text-primary)]';
  return (
    <div className="rounded-xl border border-[var(--border-color)] p-4 bg-[var(--bg-secondary)]">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function DashboardPanel({ onOpen }: { onOpen: (s: Section) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .get<AdminStats>('/admin/stats')
      .then(setStats)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  if (error) return <p className="p-4 text-[var(--danger)]">{error}</p>;
  if (!stats) return <Spinner />;
  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wide">Communauté</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Comptes" value={stats.users.total} />
          <StatCard label="Actifs" value={stats.users.active} tone="ok" />
          <StatCard
            label="Suspendus"
            value={stats.users.suspended}
            tone={stats.users.suspended ? 'danger' : undefined}
          />
          <StatCard label="Bannis" value={stats.users.banned} tone={stats.users.banned ? 'danger' : undefined} />
          <StatCard label="Inscrits (7 j)" value={stats.users.newLast7d} />
          <StatCard label="Posts" value={stats.content.posts} />
          <StatCard label="Posts (24 h)" value={stats.content.postsLast24h} />
          <StatCard label="Commentaires" value={stats.content.comments} />
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wide">Modération</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onOpen('reports')}
            className="text-left rounded-xl border border-[var(--border-color)] p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <p className="text-xs text-[var(--text-secondary)]">Signalements ouverts</p>
            <p className={`text-2xl font-black ${stats.reports.open ? 'text-[var(--danger)]' : ''}`}>
              {stats.reports.open}
            </p>
          </button>
          <div className="rounded-xl border border-[var(--border-color)] p-4 bg-[var(--bg-secondary)]">
            <p className="text-xs text-[var(--text-secondary)]">Reçus (7 j)</p>
            <p className="text-2xl font-black">{stats.reports.last7d}</p>
          </div>
        </div>
        {stats.reports.open > 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            File d'attente non vide : traite les plus anciens depuis « Signalements ».
          </p>
        )}
      </section>
    </div>
  );
}

/* ── Signalements ───────────────────────────────────────────────────────────── */

function ReportCard({ report, isAdmin, onDone }: { report: AdminReport; isAdmin: boolean; onDone: () => void }) {
  const open = report.status === 'open';
  const [action, setAction] = useState('delete_post');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(3);
  const [alsoDelete, setAlsoDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const needsReason = action !== 'dismiss';
  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (action === 'ban' && !window.confirm(`Bannir @${report.target?.pseudo} ?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/admin/reports/${report.id}/resolve`, {
        action,
        reason,
        days: action === 'suspend' ? days : undefined,
        deleteContent: alsoDelete && action !== 'dismiss' && action !== 'delete_post',
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <article className="px-4 py-4 border-b border-[var(--border-color)] space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip tone="danger">{categoryLabel(report.category)}</Chip>
        {report.openReportsOnPost > 1 && open && <Chip>{report.openReportsOnPost} signalements</Chip>}
        {!open && (
          <Chip tone={report.status === 'actioned' ? 'ok' : 'neutral'}>
            {report.status === 'actioned' ? 'Traité' : 'Classé'}
          </Chip>
        )}
        <span className="text-[var(--text-secondary)]">
          par @{report.reporter ?? 'compte supprimé'} · {timeAgo(report.createdAt)}
        </span>
      </div>

      <div className="border border-[var(--border-color)] rounded-lg p-3">
        {report.target && (
          <p className="text-sm text-[var(--text-secondary)] mb-1">
            Auteur : <Link to={`/${report.target.pseudo}`}>@{report.target.pseudo}</Link>
            {report.target.status !== 'active' && <> · {report.target.status === 'banned' ? 'banni' : 'suspendu'}</>}
          </p>
        )}
        {report.post ? (
          <>
            {report.post.text && (
              <p className="text-[var(--text-primary)] break-words whitespace-pre-wrap">{report.post.text}</p>
            )}
            {report.post.image && (
              <img src={report.post.image} alt="" className="mt-2 max-h-48 rounded-lg" loading="lazy" />
            )}
            {report.post.video && (
              // biome-ignore lint/a11y/useMediaCaption: média utilisateur signalé, sans piste de sous-titres
              <video src={report.post.video} controls preload="none" className="mt-2 max-h-48 rounded-lg" />
            )}
            {report.post.audio && (
              // biome-ignore lint/a11y/useMediaCaption: message vocal signalé, sans transcription
              <audio src={report.post.audio} controls preload="none" className="mt-2 w-full max-w-sm" />
            )}
            {!report.post.exists && (
              <p className="text-xs text-[var(--text-secondary)] mt-1">Post déjà supprimé (extrait conservé).</p>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">Aucun contenu associé.</p>
        )}
      </div>
      {report.reason && <p className="text-sm text-[var(--text-primary)]">« {report.reason} »</p>}

      {open ? (
        <form onSubmit={apply} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Décision"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className={`${inputClass} !w-auto !py-2`}
            >
              <option value="dismiss">Classer sans suite</option>
              <option value="delete_post" disabled={!report.post?.exists}>
                Supprimer le post
              </option>
              <option value="warn">Avertir l'auteur</option>
              <option value="suspend">Suspendre l'auteur</option>
              {isAdmin && <option value="ban">Bannir l'auteur</option>}
            </select>
            {action === 'suspend' && (
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                Durée (jours)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className={`${inputClass} !w-24 !py-2`}
                />
              </label>
            )}
          </div>
          {needsReason && (
            <textarea
              aria-label="Motif communiqué à l'auteur"
              placeholder="Motif (communiqué à l'auteur)"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 400))}
              rows={2}
              required
              className="w-full bg-transparent border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none resize-none"
            />
          )}
          {['warn', 'suspend', 'ban'].includes(action) && report.post?.exists && (
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={alsoDelete}
                onChange={(e) => setAlsoDelete(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Supprimer aussi le post
            </label>
          )}
          <Alert error={error} />
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? '…' : 'Appliquer'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          Décision{report.handledAt ? ` du ${fullDate(report.handledAt)}` : ''} : {report.resolution || '—'}
        </p>
      )}
    </article>
  );
}

function ReportsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<Status>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReports(await api.get<AdminReport[]>(`/admin/reports?status=${status}`));
    } catch (err) {
      setError(errorMessage(err));
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex gap-2 px-4 py-3 border-b border-[var(--border-color)] flex-wrap">
        {(['open', 'actioned', 'dismissed', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={`${outlineBtn} ${status === s ? '!bg-[var(--bg-tertiary)]' : ''}`}
          >
            {{ open: 'Ouverts', actioned: 'Traités', dismissed: 'Classés', all: 'Tous' }[s]}
          </button>
        ))}
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="p-4 text-[var(--danger)]">{error}</p>
      ) : reports.length === 0 ? (
        <Empty>Aucun signalement</Empty>
      ) : (
        reports.map((r) => <ReportCard key={r.id} report={r} isAdmin={isAdmin} onDone={load} />)
      )}
    </div>
  );
}

/* ── Utilisateurs ───────────────────────────────────────────────────────────── */

function UserCard({ u, isAdmin, onDone }: { u: AdminUser; isAdmin: boolean; onDone: () => void }) {
  const [action, setAction] = useState(
    u.status === 'banned' ? 'unban' : u.status === 'suspended' ? 'unsuspend' : 'suspend',
  );
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const protectedAccount = u.role === 'admin';

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (action === 'delete_account' && !window.confirm(`Supprimer définitivement le compte @${u.pseudo} ?`)) return;
    if (action === 'ban' && !window.confirm(`Bannir @${u.pseudo} ?`)) return;
    setBusy(true);
    setError('');
    try {
      const isRole = action === 'set_role_moderator' || action === 'set_role_user';
      await api.post(`/admin/users/${u.uid}/sanction`, {
        action: isRole ? 'set_role' : action,
        role: isRole ? action.replace('set_role_', '') : undefined,
        reason,
        days: action === 'suspend' ? days : undefined,
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const needsReason = ['suspend', 'ban', 'delete_account'].includes(action);
  return (
    <article className="px-4 py-4 border-b border-[var(--border-color)] space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/${u.pseudo}`} className="font-bold">
          @{u.pseudo}
        </Link>
        {u.role !== 'user' && <Chip tone="ok">{u.role === 'admin' ? 'admin' : 'modérateur'}</Chip>}
        {u.status === 'suspended' && (
          <Chip tone="danger">
            suspendu{u.suspendedUntil ? ` jusqu'au ${new Date(u.suspendedUntil).toLocaleDateString('fr-FR')}` : ''}
          </Chip>
        )}
        {u.status === 'banned' && <Chip tone="danger">banni</Chip>}
        {u.reportsAgainst > 0 && <Chip>{u.reportsAgainst} signalement(s)</Chip>}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        Inscrit le {new Date(u.createdAt).toLocaleDateString('fr-FR')}
        {u.postsCount !== undefined ? ` · ${u.postsCount} post(s)` : ''}
        {u.lastSession ? ` · dernière session ${timeAgo(u.lastSession)}` : " · jamais connecté depuis l'inscription"}
        {u.statusReason ? ` · motif : ${u.statusReason}` : ''}
      </p>
      {protectedAccount ? (
        <p className="text-xs text-[var(--text-secondary)]">Compte administrateur : non sanctionnable ici.</p>
      ) : (
        <form onSubmit={apply} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className={`${inputClass} !w-auto !py-2`}
            >
              {u.status === 'suspended' && <option value="unsuspend">Lever la suspension</option>}
              <option value="suspend">Suspendre</option>
              {isAdmin &&
                (u.status === 'banned' ? (
                  <option value="unban">Lever le bannissement</option>
                ) : (
                  <option value="ban">Bannir</option>
                ))}
              {isAdmin && u.role === 'user' && <option value="set_role_moderator">Nommer modérateur</option>}
              {isAdmin && u.role === 'moderator' && (
                <option value="set_role_user">Retirer le rôle de modérateur</option>
              )}
              {isAdmin && <option value="delete_account">Supprimer le compte</option>}
            </select>
            {action === 'suspend' && (
              <input
                type="number"
                min={1}
                max={365}
                aria-label="Durée en jours"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className={`${inputClass} !w-24 !py-2`}
              />
            )}
          </div>
          {needsReason && (
            <input
              type="text"
              aria-label="Motif"
              placeholder="Motif (communiqué à l'utilisateur)"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 400))}
              required
              className={inputClass}
            />
          )}
          <Alert error={error} />
          <button type="submit" disabled={busy} className={outlineBtn}>
            {busy ? '…' : 'Appliquer'}
          </button>
        </form>
      )}
    </article>
  );
}

function UsersPanel({ isAdmin }: { isAdmin: boolean }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const search = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (q.trim().length < 2) {
        setUsers(await api.get<AdminUser[]>('/admin/accounts'));
      } else {
        setUsers(await api.get<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q.trim())}`));
      }
    } catch (err) {
      setError(errorMessage(err));
    }
    setLoading(false);
  }, [q]);

  useEffect(() => {
    const t = window.setTimeout(search, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  return (
    <div>
      <div className="p-4 border-b border-[var(--border-color)] relative">
        <Search className="w-4 h-4 absolute left-7 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
        <input
          type="search"
          aria-label="Rechercher un utilisateur"
          placeholder="Rechercher un pseudo (vide : comptes récents)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputClass} !pl-9`}
        />
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="p-4 text-[var(--danger)]">{error}</p>
      ) : users.length === 0 ? (
        <Empty>Aucun utilisateur</Empty>
      ) : (
        users.map((u) => <UserCard key={u.uid} u={u} isAdmin={isAdmin} onDone={search} />)
      )}
    </div>
  );
}

/* ── Posts ──────────────────────────────────────────────────────────────────── */

function PostsPanel({ onOpen }: { onOpen: (s: Section) => void }) {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (offset: number) => {
    if (offset > 0) setLoadingMore(true);
    try {
      const data = await api.get<AdminPost[]>(`/admin/posts?limit=30&offset=${offset}`);
      setPosts((prev) => (offset === 0 ? data : [...prev, ...data]));
      setHasMore(data.length >= 30);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
    if (offset > 0) setLoadingMore(false);
    else setLoading(false);
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  const remove = async (p: AdminPost) => {
    const reason = window.prompt(
      `Supprimer le post #${p.id} de @${p.author.pseudo} ?\n\nMotif (communiqué à l'auteur) :`,
    );
    if (!reason) return;
    try {
      await api.del(`/admin/posts/${p.id}`, { reason });
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      window.alert(errorMessage(err, 'Suppression impossible'));
    }
  };

  return (
    <div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="p-4 text-[var(--danger)]">{error}</p>
      ) : posts.length === 0 ? (
        <Empty>Aucun post</Empty>
      ) : (
        <>
          {posts.map((p) => (
            <article key={p.id} className="px-4 py-4 border-b border-[var(--border-color)] space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link to={`/${p.author.pseudo}`} className="font-bold">
                  @{p.author.pseudo}
                </Link>
                <span className="text-[var(--text-secondary)]">
                  #{p.id} · {timeAgo(p.createdAt)}
                  {p.isRepost ? ' · repost' : ''}
                </span>
                {p.author.status !== 'active' && (
                  <Chip tone="danger">{p.author.status === 'banned' ? 'auteur banni' : 'auteur suspendu'}</Chip>
                )}
                {p.openReports > 0 && <Chip tone="danger">{p.openReports} signalement(s) ouvert(s)</Chip>}
              </div>
              {p.image && <img src={p.image} alt="" className="max-h-40 rounded-lg" loading="lazy" />}
              {p.video && (
                // biome-ignore lint/a11y/useMediaCaption: média utilisateur, pas de sous-titres disponibles
                <video src={p.video} controls preload="none" className="max-h-40 rounded-lg" />
              )}
              {p.audio && (
                // biome-ignore lint/a11y/useMediaCaption: vocal, sans transcription
                <audio src={p.audio} controls preload="none" className="w-full max-w-sm" />
              )}
              <p className="text-[var(--text-primary)] text-sm whitespace-pre-wrap break-words max-w-2xl">
                {p.text || '(aucun texte)'}
              </p>
              <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                <span>{p.likesCount} ❤</span>
                <span>{p.commentsCount} 💬</span>
                <button type="button" onClick={() => onOpen('reports')} className="hover:underline">
                  Voir dans le journal
                </button>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  className="ml-auto flex items-center gap-1 text-[var(--danger)] hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Supprimer
                </button>
              </div>
            </article>
          ))}
          {hasMore && (
            <div className="p-4 flex justify-center">
              <button type="button" onClick={() => load(posts.length)} disabled={loadingMore} className={outlineBtn}>
                {loadingMore ? '…' : 'Charger plus'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Journal ────────────────────────────────────────────────────────────────── */

function LogPanel() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .get<LogEntry[]>('/admin/log?limit=100')
      .then(setLog)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  if (error) return <p className="p-4 text-[var(--danger)]">{error}</p>;
  if (log.length === 0) return <Empty>Journal vide</Empty>;
  return (
    <div>
      {log.map((m) => (
        <div key={m.id} className="px-4 py-3 border-b border-[var(--border-color)] text-sm">
          <p className="text-[var(--text-primary)]">
            <span className="font-bold">{ACTION_LABELS[m.action] ?? m.action}</span>
            {m.target && <> · @{m.target}</>}
            {m.postId && <> · post #{m.postId}</>}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            par @{m.actor ?? 'compte supprimé'} · {fullDate(m.createdAt)}
            {m.reason ? ` · ${m.reason}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ── Console ────────────────────────────────────────────────────────────────── */

export default function AdminPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>('dashboard');
  if (!user || (user.role !== 'moderator' && user.role !== 'admin')) return <Navigate to="/" replace />;
  const isAdmin = user.role === 'admin';

  const setActive = (s: Section) => {
    setSection(s);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-dvh flex bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Navigation dédiée de la console (desktop) */}
      <aside className="hidden md:flex w-60 flex-col border-r border-[var(--border-color)] bg-[var(--bg-secondary)] sticky top-0 h-dvh overflow-y-auto no-scrollbar">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--border-color)]">
          <img src="/assets/logo/logo.png" alt="" className="w-7 h-7 rounded-lg" />
          <div>
            <p className="font-black text-sm leading-tight">Console de modération</p>
            <p className="text-xs text-[var(--text-secondary)]">{isAdmin ? 'Administrateur' : 'Modérateur'}</p>
          </div>
        </div>
        <nav aria-label="Sections de la console" className="flex flex-col gap-1 p-2 flex-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              aria-current={section === id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
                section === id
                  ? 'font-bold bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-[var(--border-color)]">
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Retour au réseau
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* En-tête (mobile + fil d'ariane) */}
        <header className="sticky top-0 z-10 bg-[var(--bg-secondary)]/90 backdrop-blur border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                to="/"
                aria-label="Retour au réseau"
                className="md:hidden p-2 -ml-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="font-black text-lg truncate">{SECTION_TITLES[section]}</h1>
            </div>
            {/* Sélecteur de section (mobile, la navigation latérale est masquée) */}
            <select
              aria-label="Choisir une section"
              value={section}
              onChange={(e) => setActive(e.target.value as Section)}
              className={`${inputClass} !w-auto md:hidden`}
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        <main className="max-w-3xl mx-auto">
          {section === 'dashboard' && <DashboardPanel onOpen={setActive} />}
          {section === 'reports' && <ReportsPanel isAdmin={isAdmin} />}
          {section === 'users' && <UsersPanel isAdmin={isAdmin} />}
          {section === 'posts' && <PostsPanel onOpen={setActive} />}
          {section === 'log' && <LogPanel />}
        </main>
      </div>
    </div>
  );
}
