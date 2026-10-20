import {
  type KeyboardEvent,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { api } from '../services/api';
import Avatar from './Avatar';
import type { UserSummary } from './UserRow';
import VerifiedBadge from './VerifiedBadge';

/* Zone de texte avec autocomplétion des @mentions (comme sur Instagram) : dès qu'on tape « @ » puis
   quelques lettres, une liste de comptes apparaît ; choisir un compte complète le pseudo. */

interface MentionTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

/* Même forme que côté serveur (MENTION_RE) : « @ » en début de texte ou précédé d'un caractère non alphanumérique. */
const MENTION_AT_CARET = /(?:^|[^\w@])@([a-zA-Z0-9_]{0,30})$/;

interface Active {
  start: number; // position du « @ »
  query: string;
}

export default function MentionTextarea({ value, onValueChange, onKeyDown, ...rest }: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [active, setActive] = useState<Active | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [index, setIndex] = useState(0);
  const requestId = useRef(0);

  /* Repère s'il y a une mention en cours de saisie à l'endroit du curseur. */
  const detect = useCallback((el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? 0;
    const m = el.value.slice(0, caret).match(MENTION_AT_CARET);
    setActive(m ? { start: caret - m[1].length - 1, query: m[1] } : null);
  }, []);

  /* Recherche des comptes (anti-rebond pour ne pas interroger à chaque frappe). */
  useEffect(() => {
    if (!active) {
      setUsers([]);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      api
        .get<UserSummary[]>(`/mention-suggestions?q=${encodeURIComponent(active.query)}`)
        .then((list) => {
          if (id !== requestId.current) return; // réponse périmée
          setUsers(list);
          setIndex(0);
        })
        .catch(() => {
          if (id === requestId.current) setUsers([]);
        });
    }, 150);
    return () => clearTimeout(timer);
  }, [active]);

  const open = !!active && users.length > 0;

  const choose = (user: UserSummary) => {
    const el = ref.current;
    if (!el || !active) return;
    const caret = el.selectionStart ?? value.length;
    const insert = `@${user.pseudo} `;
    onValueChange(value.slice(0, active.start) + insert + value.slice(caret));
    setActive(null);
    setUsers([]);
    const pos = active.start + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => (i + 1) % users.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => (i - 1 + users.length) % users.length);
        return;
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault();
        choose(users[index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // ne ferme pas la fenêtre de rédaction
        setActive(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          detect(e.target);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          /* flèches gauche/droite, début/fin : le curseur peut entrer ou sortir d'une mention */
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) detect(e.currentTarget);
        }}
        onClick={(e) => detect(e.currentTarget)}
        onBlur={() => setActive(null)}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${index}` : undefined}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Comptes à mentionner"
          className="absolute left-0 right-0 top-full mt-1 z-30 max-h-72 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl py-1"
        >
          {users.map((u, i) => (
            <button
              type="button"
              key={u.uid}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === index}
              /* mouseDown + preventDefault : le champ garde le focus (sinon le blur fermerait la liste avant le clic) */
              onMouseDown={(e) => {
                e.preventDefault();
                choose(u);
              }}
              onMouseEnter={() => setIndex(i)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                i === index ? 'bg-[var(--bg-tertiary)]' : ''
              }`}
            >
              <Avatar src={u.avatar} name={u.pseudo} className="w-9 h-9 text-sm" />
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-bold text-sm text-[var(--text-primary)] truncate">
                  {u.displayName || u.pseudo}
                  {u.verified && <VerifiedBadge />}
                </span>
                <span className="block text-sm text-[var(--text-secondary)] truncate">@{u.pseudo}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
