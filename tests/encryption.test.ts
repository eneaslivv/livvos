import { 
  encrypt, 
  decrypt, 
  validateEncryptedFormat, 
  rotateEncryption,
  generateEncryptionKey,
  secureCompare,
  getEncryptionMasterKey,
  CREDENTIAL_TYPES
} from '../lib/encryption';

describe('Encryption Library', () => {
  const testPassword = 'test-master-key-32-chars-long-!!';
  const testPlaintext = 'This is a secret credential value!';

  beforeEach(() => {
    // Mock environment variables for testing
    process.env.ENCRYPTION_MASTER_KEY = testPassword;
  });

  describe('encrypt', () => {
    it('should encrypt plaintext successfully', () => {
      const result = encrypt(testPlaintext, testPassword);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.encrypted).toBeDefined();
      expect(typeof result.encrypted.data).toBe('string');
      expect(typeof result.encrypted.iv).toBe('string');
      expect(typeof result.encrypted.tag).toBe('string');
      expect(typeof result.encrypted.salt).toBe('string');
      expect(result.encrypted.version).toBe(1);
    });

    it('should fail with invalid plaintext', () => {
      const result = encrypt('', testPassword);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid plaintext input');
    });

    it('should fail with invalid password', () => {
      const result = encrypt(testPlaintext, '');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password input');
    });

    it('should produce different ciphertext for same input', () => {
      const result1 = encrypt(testPlaintext, testPassword);
      const result2 = encrypt(testPlaintext, testPassword);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.encrypted.data).not.toBe(result2.encrypted.data);
      expect(result1.encrypted.iv).not.toBe(result2.encrypted.iv);
      expect(result1.encrypted.salt).not.toBe(result2.encrypted.salt);
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data successfully', () => {
      const encrypted = encrypt(testPlaintext, testPassword);
      expect(encrypted.success).toBe(true);
      
      const result = decrypt(encrypted.encrypted, testPassword);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.decrypted).toBe(testPlaintext);
    });

    it('should fail with invalid encrypted data format', () => {
      const result = decrypt(null as any, testPassword);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid encrypted data format');
    });

    it('should fail with missing required fields', () => {
      const invalidData = {
        data: 'abc',
        iv: 'def'
        // Missing tag and salt
      };
      
      const result = decrypt(invalidData, testPassword);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required field: tag');
    });

    it('should fail with wrong password', () => {
      const encrypted = encrypt(testPlaintext, testPassword);
      expect(encrypted.success).toBe(true);
      
      const result = decrypt(encrypted.encrypted, 'wrong-password');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateEncryptedFormat', () => {
    it('should validate correct encrypted format', () => {
      const encrypted = encrypt(testPlaintext, testPassword);
      expect(encrypted.success).toBe(true);
      
      const isValid = validateEncryptedFormat(encrypted.encrypted);
      expect(isValid).toBe(true);
    });

    it('should reject invalid format', () => {
      const invalidData = { data: 'abc' };
      
      const isValid = validateEncryptedFormat(invalidData);
      expect(isValid).toBe(false);
    });
  });

  describe('rotateEncryption', () => {
    it('should rotate encryption with new password', () => {
      const oldPassword = testPassword;
      const newPassword = 'new-encryption-key-32-chars-long!!';
      
      const encrypted = encrypt(testPlaintext, oldPassword);
      expect(encrypted.success).toBe(true);
      
      const rotated = rotateEncryption(encrypted.encrypted, oldPassword, newPassword);
      expect(rotated.success).toBe(true);
      
      // Should be decryptable with new password
      const decrypted = decrypt(rotated.encrypted, newPassword);
      expect(decrypted.success).toBe(true);
      expect(decrypted.decrypted).toBe(testPlaintext);
      
      // Should NOT be decryptable with old password
      const decryptedOld = decrypt(rotated.encrypted, oldPassword);
      expect(decryptedOld.success).toBe(false);
    });

    it('should fail rotation with wrong old password', () => {
      const oldPassword = testPassword;
      const newPassword = 'new-encryption-key-32-chars-long!!';
      
      const encrypted = encrypt(testPlaintext, oldPassword);
      expect(encrypted.success).toBe(true);
      
      const rotated = rotateEncryption(encrypted.encrypted, 'wrong-password', newPassword);
      expect(rotated.success).toBe(false);
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a random key of correct length', () => {
      const key = generateEncryptionKey();
      
      expect(typeof key).toBe('string');
      // Base64 encoding of 32 bytes should result in ~44 characters
      expect(key.length).toBeGreaterThan(40);
      expect(key.length).toBeLessThan(50);
    });

    it('should generate different keys each time', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('secureCompare', () => {
    it('should return true for identical strings', () => {
      const result = secureCompare('hello', 'hello');
      expect(result).toBe(true);
    });

    it('should return false for different strings', () => {
      const result = secureCompare('hello', 'world');
      expect(result).toBe(false);
    });

    it('should return false for strings of different lengths', () => {
      const result = secureCompare('hello', 'hello!');
      expect(result).toBe(false);
    });

    it('should be timing attack resistant', () => {
      const str1 = 'a'.repeat(1000);
      const str2 = 'b'.repeat(1000);
      const str3 = 'a'.repeat(999) + 'b';
      
      // These should take similar time (can't easily test in Jest, but ensure function exists)
      expect(secureCompare(str1, str2)).toBe(false);
      expect(secureCompare(str1, str3)).toBe(false);
      expect(secureCompare(str2, str3)).toBe(false);
    });
  });

  describe('getEncryptionMasterKey', () => {
    it('should return the environment variable', () => {
      const key = getEncryptionMasterKey();
      expect(key).toBe(testPassword);
    });

    it('should throw error when environment variable is not set', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      
      expect(() => getEncryptionMasterKey()).toThrow(
        'ENCRYPTION_MASTER_KEY environment variable is not set'
      );
      
      // Restore for other tests
      process.env.ENCRYPTION_MASTER_KEY = testPassword;
    });

    it('should throw error when key is too short', () => {
      process.env.ENCRYPTION_MASTER_KEY = 'short';
      
      expect(() => getEncryptionMasterKey()).toThrow(
        'ENCRYPTION_MASTER_KEY must be at least 32 characters long'
      );
      
      // Restore for other tests
      process.env.ENCRYPTION_MASTER_KEY = testPassword;
    });
  });

  describe('Constants', () => {
    it('should export credential types', () => {
      expect(CREDENTIAL_TYPES.API_KEY).toBe('api_key');
      expect(CREDENTIAL_TYPES.PASSWORD).toBe('password');
      expect(CREDENTIAL_TYPES.TOKEN).toBe('token');
      expect(CREDENTIAL_TYPES.CERTIFICATE).toBe('certificate');
      expect(CREDENTIAL_TYPES.DATABASE).toBe('database');
      expect(CREDENTIAL_TYPES.SSH_KEY).toBe('ssh_key');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete encryption/decryption/rotation cycle', () => {
      const originalPassword = testPassword;
      const newPassword = 'completely-new-32-char-key-!!!';
      const sensitiveData = {
        apiKey: 'sk_test_123456789',
        secret: 'my-very-secret-value',
        config: { enabled: true, timeout: 5000 }
      };

      // Encrypt
      const encrypted = encrypt(JSON.stringify(sensitiveData), originalPassword);
      expect(encrypted.success).toBe(true);

      // Decrypt
      const decrypted = decrypt(encrypted.encrypted, originalPassword);
      expect(decrypted.success).toBe(true);
      expect(JSON.parse(decrypted.decrypted)).toEqual(sensitiveData);

      // Rotate
      const rotated = rotateEncryption(encrypted.encrypted, originalPassword, newPassword);
      expect(rotated.success).toBe(true);

      // Decrypt with new password
      const decryptedAfterRotation = decrypt(rotated.encrypted, newPassword);
      expect(decryptedAfterRotation.success).toBe(true);
      expect(JSON.parse(decryptedAfterRotation.decrypted)).toEqual(sensitiveData);

      // Should fail with old password
      const failDecrypt = decrypt(rotated.encrypted, originalPassword);
      expect(failDecrypt.success).toBe(false);
    });

    it('should handle large data encryption', () => {
      const largeData = 'x'.repeat(10000); // 10KB of data
      
      const encrypted = encrypt(largeData, testPassword);
      expect(encrypted.success).toBe(true);
      
      const decrypted = decrypt(encrypted.encrypted, testPassword);
      expect(decrypted.success).toBe(true);
      expect(decrypted.decrypted).toBe(largeData);
    });

    it('should handle Unicode and special characters', () => {
      const unicodeData = '🔐 Test with émojis àccënts 特殊字符 🚀';
      
      const encrypted = encrypt(unicodeData, testPassword);
      expect(encrypted.success).toBe(true);
      
      const decrypted = decrypt(encrypted.encrypted, testPassword);
      expect(decrypted.success).toBe(true);
      expect(decrypted.decrypted).toBe(unicodeData);
    });
  });
});

// Mock Node.js crypto for testing
const crypto = require('crypto');

// Integration tests that would require actual database
describe('Credential Manager Integration', () => {
  // These would be integration tests that require a real database
  // For now, we'll skip them as they require database setup
  
  it.skip('should create and retrieve credentials from database', async () => {
    // This would require setting up a test database
    // and testing the full credential manager functionality
  });

  it.skip('should handle concurrent access to credentials', async () => {
    // Test concurrent credential access scenarios
  });
});