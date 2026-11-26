const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('crypto');

function encryptionKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Set ADMIN_SESSION_SECRET to a random value of at least 32 characters.');
  return createHash('sha256').update(secret).digest();
}

function seal(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') };
}

function open(value, fallback) {
  if (!value) return fallback;
  if (value.version !== 1 || !value.iv || !value.tag || !value.ciphertext) throw new Error('Encrypted data file format is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
}

module.exports = { open, seal };
