/* Intégrations de liens sociaux (YouTube, Vimeo, Spotify, SoundCloud, TikTok, X, Instagram, Twitch).
   Liste blanche stricte : seules les URL reconnues ci-dessous deviennent des iframes, toujours vers un domaine
   précis (à garder synchronisé avec `frame-src` dans server/src/middleware/security.ts). */

export interface Embed {
  /* URL d'origine, sans la ponctuation finale. */
  url: string;
  provider: string;
  /* Domaine contacté une fois l'intégration chargée (affiché avant le clic). */
  host: string;
  src: string;
  title: string;
  /* Rapport largeur/hauteur CSS (« 16 / 9 ») ou hauteur fixe en pixels. */
  aspect?: string;
  height?: number;
  /* Largeur maximale (vidéos verticales, cartes). */
  maxWidth?: number;
}

const URL_RE = /https?:\/\/[^\s<]+/g;
const YT_ID = /^[\w-]{11}$/;

function parse(raw: string): Embed | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'youtube.com' || host === 'youtu.be') {
    let id: string | null = null;
    let short = false;
    if (host === 'youtu.be') id = parts[0] ?? null;
    else if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
      id = parts[1] ?? null;
      short = parts[0] === 'shorts';
    }
    if (!id || !YT_ID.test(id)) return null;
    const start = Number(u.searchParams.get('t')?.replace(/s$/, '') ?? u.searchParams.get('start'));
    const qs = Number.isInteger(start) && start > 0 ? `?start=${start}` : '';
    return {
      url: raw,
      provider: 'YouTube',
      host: 'youtube-nocookie.com',
      src: `https://www.youtube-nocookie.com/embed/${id}${qs}`,
      title: 'Vidéo YouTube',
      aspect: short ? '9 / 16' : '16 / 9',
      maxWidth: short ? 320 : undefined,
    };
  }

  if (host === 'vimeo.com') {
    const id = parts.find((p) => /^\d+$/.test(p));
    if (!id || parts.length > 2) return null;
    return {
      url: raw,
      provider: 'Vimeo',
      host: 'player.vimeo.com',
      src: `https://player.vimeo.com/video/${id}?dnt=1`,
      title: 'Vidéo Vimeo',
      aspect: '16 / 9',
    };
  }

  if (host === 'open.spotify.com') {
    const rest = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts;
    const [type, id] = rest;
    if (!type || !id || !/^(track|album|playlist|episode|show|artist)$/.test(type) || !/^[A-Za-z0-9]{10,30}$/.test(id)) {
      return null;
    }
    return {
      url: raw,
      provider: 'Spotify',
      host: 'open.spotify.com',
      src: `https://open.spotify.com/embed/${type}/${id}`,
      title: 'Lecteur Spotify',
      height: type === 'track' || type === 'episode' ? 152 : 352,
    };
  }

  if (host === 'soundcloud.com') {
    if (parts.length < 2 || parts[0] === 'discover' || parts[0] === 'you') return null;
    const clean = `https://soundcloud.com/${parts.slice(0, 3).join('/')}`;
    return {
      url: raw,
      provider: 'SoundCloud',
      host: 'w.soundcloud.com',
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&visual=false&show_comments=false`,
      title: 'Lecteur SoundCloud',
      height: 166,
    };
  }

  if (host === 'tiktok.com') {
    const i = parts.indexOf('video');
    const id = i >= 1 ? parts[i + 1] : null;
    if (!parts[0]?.startsWith('@') || !id || !/^\d{8,25}$/.test(id)) return null;
    return {
      url: raw,
      provider: 'TikTok',
      host: 'tiktok.com',
      src: `https://www.tiktok.com/embed/v2/${id}`,
      title: 'Vidéo TikTok',
      height: 740,
      maxWidth: 340,
    };
  }

  if (host === 'twitter.com' || host === 'x.com') {
    const i = parts.indexOf('status');
    const id = i >= 1 ? parts[i + 1] : null;
    if (!id || !/^\d{5,25}$/.test(id)) return null;
    return {
      url: raw,
      provider: 'X',
      host: 'platform.twitter.com',
      src: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`,
      title: 'Post X',
      height: 420,
      maxWidth: 550,
    };
  }

  if (host === 'instagram.com') {
    const [kind, code] = parts;
    if (!kind || !code || !/^(p|reel|reels|tv)$/.test(kind) || !/^[\w-]{5,20}$/.test(code)) return null;
    return {
      url: raw,
      provider: 'Instagram',
      host: 'instagram.com',
      src: `https://www.instagram.com/p/${code}/embed`,
      title: 'Publication Instagram',
      height: 620,
      maxWidth: 400,
    };
  }

  if (host === 'twitch.tv' || host === 'clips.twitch.tv') {
    const parent = encodeURIComponent(window.location.hostname);
    let clip: string | null = null;
    let video: string | null = null;
    if (host === 'clips.twitch.tv') clip = parts[0] ?? null;
    else if (parts[1] === 'clip') clip = parts[2] ?? null;
    else if (parts[0] === 'videos') video = parts[1] ?? null;
    if (clip && /^[\w-]{5,100}$/.test(clip)) {
      return {
        url: raw,
        provider: 'Twitch',
        host: 'clips.twitch.tv',
        src: `https://clips.twitch.tv/embed?clip=${clip}&parent=${parent}&autoplay=false`,
        title: 'Clip Twitch',
        aspect: '16 / 9',
      };
    }
    if (video && /^\d{5,15}$/.test(video)) {
      return {
        url: raw,
        provider: 'Twitch',
        host: 'player.twitch.tv',
        src: `https://player.twitch.tv/?video=v${video}&parent=${parent}&autoplay=false`,
        title: 'Vidéo Twitch',
        aspect: '16 / 9',
      };
    }
  }

  return null;
}

/** Intégrations trouvées dans un texte (doublons écartés, `max` au plus). */
export function findEmbeds(text: string, max = 2): Embed[] {
  const found: Embed[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)]+$/, '');
    const embed = parse(url);
    if (!embed || seen.has(embed.src)) continue;
    seen.add(embed.src);
    found.push(embed);
    if (found.length >= max) break;
  }
  return found;
}
