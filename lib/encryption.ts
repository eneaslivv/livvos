import crypto from 'crypto';

// Encryption configuration
export const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyLength: 32, // 256 bits
  ivLength: 16,  // 128 bits
  tagLength: 16, // 128 bits
  iterations: 100000, // PBKDF2 iterations
  saltLength: 32 // 256 bits
} as const;

export interface EncryptedData {
  data: string; // Base64 encrypted data
  iv: string;   // Base64 initialization vector
  tag: string;  // Base64 authentication tag
  salt: string; // Base64 salt for key derivation
  version: number; // Encryption version for future upgrades
}

export interface EncryptionResult {
  encrypted: EncryptedData;
  success: boolean;
  error?: string;
}

export interface DecryptionResult {
  decrypted: string;
  success: boolean;
  error?: string;
}

/**
 * Derives encryption key from password and salt using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ENCRYPTION_CONFIG.iterations, ENCRYPTION_CONFIG.keyLength, 'sha256');
}

/**
 * Encrypts plaintext using AES-256-GCM
 */
export function encrypt(plaintext: string, password: string): EncryptionResult {
  try {
    if (!plaintext || typeof plaintext !== 'string') {
      return { encrypted: null as any, success: false, error: 'Invalid plaintext input' };
    }

    if (!password || typeof password !== 'string') {
      return { encrypted: null as any, success: false, error: 'Invalid password input' };
    }

    // Generate random salt
    const salt = crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);
    
    // Derive encryption key
    const key = deriveKey(password, salt);
    
    // Generate random IV
    const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
    cipher.setAAD(Buffer.from('eneas-os-v1', 'utf8')); // Additional authenticated data
    
    // Encrypt the data
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    const encryptedData: EncryptedData = {
      data: encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      salt: salt.toString('base64'),
      version: 1
    };
    
    return { encrypted: encryptedData, success: true };
  } catch (error) {
    return {
      encrypted: null as any,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown encryption error'
    };
  }
}

/**
 * Decrypts ciphertext using AES-256-GCM
 */
export function decrypt(encryptedData: EncryptedData, password: string): DecryptionResult {
  try {
    if (!encryptedData || typeof encryptedData !== 'object') {
      return { decrypted: '', success: false, error: 'Invalid encrypted data format' };
    }

    if (!password || typeof password !== 'string') {
      return { decrypted: '', success: false, error: 'Invalid password input' };
    }

    // Validate required fields
    const requiredFields = ['data', 'iv', 'tag', 'salt'];
    for (const field of requiredFields) {
      if (!(field in encryptedData) || !encryptedData[field as keyof EncryptedData]) {
        return { decrypted: '', success: false, error: `Missing required field: ${field}` };
      }
    }

    // Convert base64 strings back to buffers
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');
    
    // Derive decryption key
    const key = deriveKey(password, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
    decipher.setAAD(Buffer.from('eneas-os-v1', 'utf8'));
    decipher.setAuthTag(tag);
    
    // Decrypt the data
    let decrypted = decipher.update(encryptedData.data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return { decrypted, success: true };
  } catch (error) {
    return {
      decrypted: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown decryption error'
    };
  }
}

/**
 * Generates a secure random encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Validates encrypted data format
 */
export function validateEncryptedFormat(data: any): data is EncryptedData {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.data === 'string' &&
    typeof data.iv === 'string' &&
    typeof data.tag === 'string' &&
    typeof data.salt === 'string' &&
    typeof data.version === 'number'
  );
}

/**
 * Securely compares two strings (timing attack resistant)
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Wipes sensitive data from memory (Node.js specific)
 */
export function secureWipe(data: string | Buffer): void {
  if (typeof data === 'string') {
    // In Node.js, strings are immutable, so we can't wipe them
    // This is just a placeholder for documentation purposes
    return;
  }
  
  if (Buffer.isBuffer(data)) {
    data.fill(0);
  }
}

/**
 * Key rotation helper - generates new encrypted data with a new password
 */
export function rotateEncryption(
  encryptedData: EncryptedData,
  oldPassword: string,
  newPassword: string
): EncryptionResult {
  const decryptResult = decrypt(encryptedData, oldPassword);
  
  if (!decryptResult.success) {
    return {
      encrypted: null as any,
      success: false,
      error: `Failed to decrypt during rotation: ${decryptResult.error}`
    };
  }
  
  return encrypt(decryptResult.decrypted, newPassword);
}

// Environment variable validation
export function getEncryptionMasterKey(): string {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY || process.env.VITE_ENCRYPTION_MASTER_KEY;
  
  if (!masterKey) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is not set. This is required for credential encryption.');
  }
  
  if (masterKey.length < 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 characters long for AES-256 encryption.');
  }
  
  return masterKey;
}

// Constants for credential types
export const CREDENTIAL_TYPES = {
  API_KEY: 'api_key',
  PASSWORD: 'password',
  TOKEN: 'token',
  CERTIFICATE: 'certificate',
  DATABASE: 'database',
  SSH_KEY: 'ssh_key'
} as const;

export type CredentialType = typeof CREDENTIAL_TYPES[keyof typeof CREDENTIAL_TYPES];