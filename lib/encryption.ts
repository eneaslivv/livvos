import CryptoJS from 'crypto-js';

// Encryption configuration
export const ENCRYPTION_CONFIG = {
  keyLength: 256 / 32, // 256 bits (words)
  ivLength: 128 / 32,  // 128 bits (words)
  iterations: 100000, // PBKDF2 iterations
  saltLength: 256 / 32 // 256 bits (words)
} as const;

export interface EncryptedData {
  data: string; // Base64 encrypted data
  iv: string;   // Base64 initialization vector
  tag: string;  // Base64 HMAC authentication tag
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
function deriveKey(password: string, salt: CryptoJS.lib.WordArray): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: ENCRYPTION_CONFIG.keyLength,
    iterations: ENCRYPTION_CONFIG.iterations,
    hasher: CryptoJS.algo.SHA256
  });
}

function createAuthTag(data: string, iv: string, salt: string, key: CryptoJS.lib.WordArray): string {
  return CryptoJS.HmacSHA256(`${salt}.${iv}.${data}`, key).toString(CryptoJS.enc.Base64);
}

/**
 * Encrypts plaintext using AES
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
    const salt = CryptoJS.lib.WordArray.random(ENCRYPTION_CONFIG.saltLength * 4); // *4 because random expects bytes, logic uses words sometimes, safest to trust random() logic (bytes)
    // Actually CryptoJS.lib.WordArray.random(n) -> n bytes. 
    // ENCRYPTION_CONFIG.saltLength is 8 words = 32 bytes.

    // Derive encryption key
    const key = deriveKey(password, salt);

    // Generate random IV
    const iv = CryptoJS.lib.WordArray.random(16); // 16 bytes

    // Encrypt the data
    const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const data = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
    const ivBase64 = iv.toString(CryptoJS.enc.Base64);
    const saltBase64 = salt.toString(CryptoJS.enc.Base64);

    const encryptedData: EncryptedData = {
      data,
      iv: ivBase64,
      tag: createAuthTag(data, ivBase64, saltBase64, key),
      salt: salt.toString(CryptoJS.enc.Base64),
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
 * Decrypts ciphertext using AES
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

    // Parse Base64 inputs
    const salt = CryptoJS.enc.Base64.parse(encryptedData.salt);
    const iv = CryptoJS.enc.Base64.parse(encryptedData.iv);
    const ciphertext = CryptoJS.enc.Base64.parse(encryptedData.data);

    // Derive decryption key
    const key = deriveKey(password, salt);

    const expectedTag = createAuthTag(encryptedData.data, encryptedData.iv, encryptedData.salt, key);
    if (!secureCompare(expectedTag, encryptedData.tag)) {
      return { decrypted: '', success: false, error: 'Authentication tag verification failed' };
    }

    // Decrypt parameters
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: ciphertext
    });

    // Decrypt
    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);

    if (!decryptedString) {
      // Can happen if key is wrong or data corrupted (CBC padding error)
      return { decrypted: '', success: false, error: 'Decryption failed (Invalid key or data)' };
    }

    return { decrypted: decryptedString, success: true };
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
  return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Base64);
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
    data.tag.length > 0 &&
    typeof data.salt === 'string' &&
    typeof data.version === 'number'
  );
}

/**
 * Securely compares two strings (timing attack resistant)
 */
export function secureCompare(a: string, b: string): boolean {
  // CryptoJS doesn't expose a timingSafeEqual equivalent easily.
  // Simple constant time implementation attempt
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
 * Wipes sensitive data from memory
 */
export function secureWipe(data: string | any): void {
  // JS GC handles this mostly, tough to force.
  // CryptoJS WordArrays can be reset.
  if (data && typeof data.clamp === 'function' && typeof data.words === 'object') {
    // Is a WordArray
    for (let i = 0; i < data.words.length; i++) data.words[i] = 0;
    data.sigBytes = 0;
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
  const nodeEnv = (globalThis as any).process?.env;
  const masterKey = import.meta.env.MODE === 'test'
    ? nodeEnv?.ENCRYPTION_MASTER_KEY
    : (nodeEnv?.ENCRYPTION_MASTER_KEY || import.meta.env.VITE_ENCRYPTION_MASTER_KEY);

  if (!masterKey) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is not set');
  }

  if (masterKey.length < 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 characters long');
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
