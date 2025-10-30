import crypto from 'crypto';

/**
 * Generate a random salt
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash a password with a salt using PBKDF2
 */
export function hashPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
    .toString('hex');
}

/**
 * Verify a password against a hash and salt
 */
export function verifyPassword(
  password: string,
  salt: string,
  storedHash: string
): boolean {
  const hash = hashPassword(password, salt);
  return hash === storedHash;
}