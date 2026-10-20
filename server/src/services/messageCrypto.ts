import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/* Chiffrement au repos du contenu des messages privés (AES-256-GCM).
   La clé vient uniquement de l'environnement : MESSAGES_ENCRYPTION_KEY, 64 caractères hexadécimaux
   (`openssl rand -hex 32`). Sans clé, les messages sont stockés en clair (comportement identique aux secrets TOTP).
   Ce n'est PAS du chiffrement de bout en bout : le serveur peut lire les messages (modération des signalements). */
const PREFIX = 'enc:v1:';

function getKey(): Buffer | null {
  const raw = (process.env.MESSAGES_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('MESSAGES_ENCRYPTION_KEY invalide : 64 caractères hexadécimaux attendus (openssl rand -hex 32)');
  }
  return Buffer.from(raw, 'hex');
}

/* Appelé au démarrage : une clé mal formée doit empêcher de démarrer, pas échouer plus tard. */
export function assertMessagesConfig(): void {
  if (!getKey()) {
    console.warn(
      '[MESSAGES] MESSAGES_ENCRYPTION_KEY absente : les messages privés sont stockés EN CLAIR en base (openssl rand -hex 32).',
    );
  }
}

/* `aad` lie le chiffré à sa conversation : un message recopié dans une autre conversation ne se déchiffre plus. */
export function encryptMessage(plain: string, aad: string): string {
  const key = getKey();
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export const UNREADABLE = '[message illisible]';

export function decryptMessage(stored: string | null, aad: string): string {
  if (!stored) return '';
  if (!stored.startsWith(PREFIX)) return stored;
  let key: Buffer | null = null;
  try {
    key = getKey();
  } catch {
    key = null;
  }
  if (!key) {
    console.error('[MESSAGES] Message chiffré mais MESSAGES_ENCRYPTION_KEY absente ou invalide');
    return UNREADABLE;
  }
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    console.error('[MESSAGES] Déchiffrement impossible (clé différente de celle utilisée pour chiffrer ?)');
    return UNREADABLE;
  }
}
