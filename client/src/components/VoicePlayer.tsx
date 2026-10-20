import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../hooks/useVoiceRecorder';

/* Un seul message vocal à la fois : lancer l'un met les autres en pause. */
let playingNow: HTMLAudioElement | null = null;

interface VoicePlayerProps {
  src: string;
  /* durée connue (secondes) : les WebM de MediaRecorder n'embarquent pas leur durée */
  duration?: number | null;
}

export default function VoicePlayer({ src, duration }: VoicePlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => {
      if (!duration && Number.isFinite(el.duration)) setTotal(el.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      el.currentTime = 0;
    };
    const onError = () => setFailed(true);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      if (playingNow === el) playingNow = null;
    };
  }, [duration]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      if (playingNow && playingNow !== el) playingNow.pause();
      playingNow = el;
      el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  };

  const seek = (value: number) => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = value;
    setCurrent(value);
  };

  if (failed) {
    return <p className="mt-3 text-sm text-[var(--text-secondary)]">Message vocal indisponible.</p>;
  }

  return (
    <div
      data-no-open
      className="mt-3 flex items-center gap-3 max-w-[380px] rounded-full border border-[var(--border-color)] bg-[var(--bg-tertiary)] pl-1.5 pr-4 py-1.5"
    >
      {/* biome-ignore lint/a11y/useMediaCaption: message vocal d'un utilisateur, pas de transcription disponible */}
      <audio ref={audio} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Mettre en pause' : 'Écouter le message vocal'}
        className="flex-shrink-0 w-9 h-9 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white flex items-center justify-center transition-colors"
      >
        {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={total > 0 ? total : 1}
        step={0.1}
        value={Math.min(current, total > 0 ? total : 1)}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={total <= 0}
        aria-label="Position dans le message vocal"
        className="flex-1 min-w-0 accent-[var(--accent)] cursor-pointer"
      />
      <span className="text-xs tabular-nums text-[var(--text-secondary)] flex-shrink-0">
        {formatDuration(playing || current > 0 ? current : total)}
      </span>
    </div>
  );
}
