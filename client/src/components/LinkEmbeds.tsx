import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type Embed, findEmbeds } from '../lib/embeds';

/* Aucune requête vers un service tiers tant que la personne n'a pas cliqué : pas de pistage à l'affichage du fil. */
function EmbedFrame({ embed }: { embed: Embed }) {
  const [loaded, setLoaded] = useState(false);
  const box: React.CSSProperties = {
    aspectRatio: embed.aspect,
    height: embed.aspect ? undefined : embed.height,
    maxWidth: embed.maxWidth,
  };

  return (
    <div
      data-no-open
      className="mt-3 rounded-2xl overflow-hidden border border-[var(--border-color)] bg-[var(--bg-tertiary)]"
      style={{ maxWidth: embed.maxWidth }}
    >
      {loaded ? (
        <iframe
          src={embed.src}
          title={embed.title}
          loading="lazy"
          className="w-full h-full block border-0"
          style={box}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setLoaded(true)}
          className="w-full flex flex-col items-center justify-center gap-2 p-4 text-center hover:bg-[var(--bg-secondary)] transition-colors"
          style={{ aspectRatio: embed.aspect, minHeight: embed.aspect ? undefined : Math.min(embed.height ?? 120, 140) }}
        >
          <span className="w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center">
            <Play className="w-5 h-5" aria-hidden="true" />
          </span>
          <span className="font-bold text-[var(--text-primary)]">Afficher le contenu {embed.provider}</span>
          <span className="text-xs text-[var(--text-secondary)]">
            Charge du contenu depuis {embed.host} : ce service verra ton adresse IP.
          </span>
        </button>
      )}
    </div>
  );
}

/** Intégrations des liens sociaux d'un texte (YouTube, Spotify, X…), chargées au clic. */
export default function LinkEmbeds({ text }: { text: string | null }) {
  const embeds = useMemo(() => (text ? findEmbeds(text) : []), [text]);
  return (
    <>
      {embeds.map((e) => (
        <EmbedFrame key={e.src} embed={e} />
      ))}
    </>
  );
}
