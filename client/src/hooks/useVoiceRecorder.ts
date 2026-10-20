import { useCallback, useEffect, useRef, useState } from 'react';

/* Enregistrement d'un message vocal dans le navigateur (MediaRecorder). Chrome/Edge/Firefox produisent du
   WebM ou de l'Ogg (Opus), Safari du MP4 (AAC) : on prend le premier format que le navigateur sait écrire. */

export const MAX_VOICE_SECONDS = 120;

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const EXT_BY_MIME: Record<string, string> = { 'audio/webm': 'weba', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };

export interface VoiceRecording {
  file: File;
  /* URL locale (blob:) pour écouter l'enregistrement avant de publier */
  url: string;
  /* durée en secondes */
  duration: number;
}

export const voiceSupported = () =>
  typeof navigator !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function useVoiceRecorder() {
  const [status, setStatus] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [error, setError] = useState('');

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const urlRef = useRef<string | null>(null);

  const releaseStream = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
  }, []);

  const discard = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setRecording(null);
    setElapsed(0);
    setStatus('idle');
  }, []);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  /* Abandonne l'enregistrement en cours (rien n'est conservé). */
  const cancel = useCallback(() => {
    cancelled.current = true;
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    else {
      releaseStream();
      discard();
    }
  }, [discard, releaseStream]);

  const start = useCallback(async () => {
    if (status === 'recording') return;
    setError('');
    if (urlRef.current) discard();
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as DOMException).name;
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? "Accès au micro refusé : autorise-le dans les réglages de ton navigateur ou de l'application."
          : 'Aucun micro détecté.',
      );
      return;
    }
    stream.current = media;
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    } catch {
      releaseStream();
      setError("Ton navigateur ne permet pas d'enregistrer un message vocal.");
      return;
    }
    recorder.current = rec;
    chunks.current = [];
    cancelled.current = false;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      releaseStream();
      if (cancelled.current) {
        discard();
        return;
      }
      const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0];
      const blob = new Blob(chunks.current, { type });
      if (blob.size === 0) {
        setError('Enregistrement vide, réessaie.');
        discard();
        return;
      }
      const duration = Math.min(MAX_VOICE_SECONDS, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
      const file = new File([blob], `vocal.${EXT_BY_MIME[type] ?? 'weba'}`, { type });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setRecording({ file, url, duration });
      setStatus('recorded');
    };
    rec.start();
    startedAt.current = Date.now();
    setElapsed(0);
    setStatus('recording');
    timer.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(sec);
      if (sec >= MAX_VOICE_SECONDS) stop();
    }, 250);
  }, [status, discard, releaseStream, stop]);

  /* Quitter la page en pleine prise : on coupe le micro et on libère la mémoire. */
  useEffect(
    () => () => {
      cancelled.current = true;
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
      releaseStream();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [releaseStream],
  );

  return { status, elapsed, recording, error, start, stop, cancel, discard, clearError: () => setError('') };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
