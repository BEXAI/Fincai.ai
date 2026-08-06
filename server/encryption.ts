import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
// NOTE: Do not change this string literal — existing rows in `agent_connections`
// were encrypted with this salt and would become undecryptable.
const SALT = 'fincai-plaid-token-salt';

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    console.warn('[Encryption] SESSION_SECRET not configured or too short - encryption will fail');
    throw new Error('SESSION_SECRET must be set and at least 16 characters for encryption');
  }
  return crypto.scryptSync(secret, SALT, 32);
}

export function isEncryptionConfigured(): boolean {
  const secret = process.env.SESSION_SECRET;
  return !!(secret && secret.length >= 16);
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) {
    return plaintext;
  }
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken) {
    return encryptedToken;
  }
  
  if (!encryptedToken.startsWith('enc:')) {
    console.warn('[Encryption] Token does not have encryption prefix - returning as-is (may be unencrypted legacy token)');
    return encryptedToken;
  }
  
  const key = getEncryptionKey();
  const parts = encryptedToken.slice(4).split(':');
  
  if (parts.length !== 3) {
    console.error('[Encryption] Invalid encrypted token format');
    throw new Error('Invalid encrypted token format');
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
