import { Film, Globe, Image as ImageIcon, Mic, Square, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { formatDuration, MAX_VOICE_SECONDS, useVoiceRecorder, voiceSupported } from '../hooks/useVoiceRecorder';
import { api, errorMessage } from '../services/api';
import Avatar from './Avatar';
import MentionTextarea from './MentionTextarea';
import VoicePlayer from './VoicePlayer';

interface ComposeBoxProps {
  onPosted?: () => void;
  compact?: boolean;
  autoFocus?: boolean;
}

const IMAGE_TYPES = 'image/jpeg,image/png,image/gif,image/webp';
const VIDEO_TYPES = 'video/mp4,video/webm,video/ogg,video/quicktime';
const MAX_BYTES = 30 * 1024 * 1024;

export default function ComposeBox({ onPosted, compact, autoFocus }: ComposeBoxProps) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  /* Opt-in : par défaut un post reste privé (visible une fois connecté). */
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const voice = useVoiceRecorder();
  const canRecord = voiceSupported();

  const removeMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
    if (imageInput.current) imageInput.current.value = '';
    if (videoInput.current) videoInput.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (file.size > MAX_BYTES) {
      setError('Le fichier ne doit pas dépasser 30 Mo');
      return;
    }
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setError('Type de fichier non supporté');
      return;
    }
    /* un post porte un seul média : une image ou une vidéo remplace le message vocal */
    if (voice.status === 'recording') voice.cancel();
    else voice.discard();
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaType(isVideo ? 'video' : 'image');
    setMediaPreview(URL.createObjectURL(file));
  };

  const canPost =
    (text.trim().length > 0 || mediaFile || voice.recording) &&
    text.length <= 280 &&
    !posting &&
    voice.status !== 'recording';

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    setError('');
    try {
      let image: string | null = null;
      let video: string | null = null;
      let audio: string | null = null;
      if (mediaFile) {
        const formData = new FormData();
        formData.append('file', mediaFile);
        const up = await api.upload<{ url: string; type: string }>('/upload', formData);
        if (up.type === 'video') video = up.url;
        else image = up.url;
      }
      if (voice.recording) {
        const formData = new FormData();
        formData.append('file', voice.recording.file);
        const up = await api.upload<{ url: string }>('/upload?kind=audio', formData);
        audio = up.url;
      }
      await api.post('/posts', {
        text: text.trim() || null,
        image,
        video,
        audio,
        audioDuration: audio ? voice.recording?.duration : undefined,
        public: isPublic,
      });
      setText('');
      setIsPublic(false);
      removeMedia();
      voice.discard();
      onPosted?.();
    } catch (err) {
      setError(errorMessage(err, 'Impossible de publier, réessaie'));
    }
    setPosting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handlePost();
    }
  };

  const remaining = 280 - text.length;

  return (
    <div className={`flex gap-3 ${compact ? 'p-3' : 'p-4'} border-b border-[var(--border-color)]`}>
      <Avatar src={user?.avatar} name={user?.pseudo} />
      <div className="flex-1 min-w-0">
        <MentionTextarea
          value={text}
          onValueChange={setText}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          aria-label="Écrire un post"
          placeholder={`Quoi de neuf, ${user?.displayName || user?.pseudo || ''} ?`}
          className="w-full bg-transparent text-[var(--text-primary)] text-lg placeholder-[var(--text-secondary)] outline-none resize-none border-none min-h-[60px]"
          rows={compact ? 2 : 3}
        />

        {mediaPreview && (
          <div className="relative mt-2 mb-2 rounded-2xl overflow-hidden border border-[var(--border-color)]">
            <button
              type="button"
              onClick={removeMedia}
              aria-label="Retirer le média"
              className="absolute top-2 right-2 z-10 bg-[var(--bg-primary)]/80 rounded-full p-1 hover:bg-[var(--bg-primary)] transition-colors"
            >
              <X className="w-4 h-4 text-[var(--text-primary)]" />
            </button>
            {mediaType === 'video' ? (
              // biome-ignore lint/a11y/useMediaCaption: aperçu d'une vidéo envoyée par l'utilisateur, sans sous-titres
              <video src={mediaPreview} className="w-full max-h-[300px] object-cover" controls preload="metadata" />
            ) : (
              <img src={mediaPreview} alt="Aperçu" className="w-full max-h-[300px] object-cover" />
            )}
          </div>
        )}

        {voice.status === 'recording' && (
          <div
            role="status"
            className="mt-3 mb-1 flex items-center gap-3 rounded-full border border-[var(--border-color)] bg-[var(--bg-tertiary)] pl-4 pr-1.5 py-1.5"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--danger)] animate-pulse" aria-hidden="true" />
            <span className="text-sm tabular-nums text-[var(--text-primary)]">
              Enregistrement… {formatDuration(voice.elapsed)} / {formatDuration(MAX_VOICE_SECONDS)}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={voice.cancel}
              className="text-sm text-[var(--text-secondary)] hover:underline"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={voice.stop}
              className="flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-full px-4 py-1.5 text-sm transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" /> Terminer
            </button>
          </div>
        )}

        {voice.status === 'recorded' && voice.recording && (
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <VoicePlayer src={voice.recording.url} duration={voice.recording.duration} />
            </div>
            <button
              type="button"
              onClick={voice.discard}
              aria-label="Supprimer le message vocal"
              className="mt-3 p-2 rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {(error || voice.error) && (
          <p role="alert" className="text-sm text-[var(--danger)] mb-1">
            {error || voice.error}
          </p>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          onClick={() => setIsPublic((v) => !v)}
          title="Visible sans connexion et référencé sur Google. Réservé aux 18 ans et plus."
          className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            isPublic
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
          }`}
        >
          <Globe className="w-4 h-4" aria-hidden="true" />
          Rendre ce post public
          <span
            aria-hidden="true"
            className={`relative inline-block h-4 w-7 rounded-full transition-colors ${isPublic ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${isPublic ? 'translate-x-3' : ''}`}
            />
          </span>
        </button>

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-1 -ml-2">
            <input ref={imageInput} type="file" accept={IMAGE_TYPES} className="hidden" onChange={handleFileSelect} />
            <input ref={videoInput} type="file" accept={VIDEO_TYPES} className="hidden" onChange={handleFileSelect} />
            <button
              type="button"
              onClick={() => imageInput.current?.click()}
              aria-label="Ajouter une image"
              className="p-2 rounded-full hover:bg-[var(--accent)]/10 text-[var(--accent)] transition-colors"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => videoInput.current?.click()}
              aria-label="Ajouter une vidéo"
              className="p-2 rounded-full hover:bg-[var(--accent)]/10 text-[var(--accent)] transition-colors"
            >
              <Film className="w-5 h-5" />
            </button>
            {canRecord && (
              <button
                type="button"
                onClick={() => {
                  if (voice.status === 'recording') voice.stop();
                  else {
                    removeMedia();
                    voice.start();
                  }
                }}
                disabled={posting}
                aria-label={voice.status === 'recording' ? "Terminer l'enregistrement" : 'Enregistrer un message vocal'}
                className={`p-2 rounded-full hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50 ${
                  voice.status === 'recording' ? 'text-[var(--danger)]' : 'text-[var(--accent)]'
                }`}
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-sm ${remaining < 0 ? 'text-[var(--danger)]' : remaining < 20 ? 'text-yellow-500' : 'text-[var(--text-secondary)]'}`}
            >
              {text.length} / 280
            </span>
            <button
              type="button"
              onClick={handlePost}
              disabled={!canPost}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full px-5 py-2 text-sm transition-colors"
            >
              {posting ? '…' : 'Publier'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
