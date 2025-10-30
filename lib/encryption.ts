import crypto from 'crypto';

/**
 * Derives an encryption key from the user's master password using Argon2
 * This key is used to encrypt/decrypt vault passwords
 */
export async function deriveEncryptionKey(
  masterPassword: string,
  salt: string
): Promise<Buffer> {
  // Using Node's built-in scrypt as a substitute since Argon2 requires native bindings
  // In production, use argon2 package: npm install argon2
  // For now using scrypt which is also very secure
  return new Promise((resolve, reject) => {
    crypto.scrypt(masterPassword, salt, 32, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Encrypts a password using AES-256-GCM
 * @param plaintext - The password to encrypt
 * @param encryptionKey - Derived from user's master password
 * @returns Encrypted data with IV and auth tag (format: iv:authTag:encrypted)
 */
export function encryptPassword(
  plaintext: string,
  encryptionKey: Buffer
): string {
  // Generate a random initialization vector (IV)
  const iv = crypto.randomBytes(16);
  
  // Create cipher using AES-256-GCM (authenticated encryption)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  
  // Encrypt the password
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get authentication tag for integrity verification
  const authTag = cipher.getAuthTag();
  
  // Return format: iv:authTag:encryptedData (all in hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a password using AES-256-GCM
 * @param encryptedData - Format: iv:authTag:encrypted
 * @param encryptionKey - Derived from user's master password
 * @returns Decrypted password
 */
export function decryptPassword(
  encryptedData: string,
  encryptionKey: Buffer
): string {
  try {
    // Split the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    
    // Convert from hex back to Buffer
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt password');
  }
}

/**
 * Encrypts multiple passwords at once
 */
export function encryptPasswords(
  passwords: string[],
  encryptionKey: Buffer
): string[] {
  return passwords.map(pwd => encryptPassword(pwd, encryptionKey));
}

/**
 * Decrypts multiple passwords at once
 */
export function decryptPasswords(
  encryptedPasswords: string[],
  encryptionKey: Buffer
): string[] {
  return encryptedPasswords.map(enc => decryptPassword(enc, encryptionKey));
}