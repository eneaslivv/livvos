import { supabase } from './supabase';
import { errorLogger } from './errorLogger';
import { 
  encrypt, 
  decrypt, 
  EncryptedData, 
  EncryptionResult, 
  DecryptionResult,
  getEncryptionMasterKey,
  validateEncryptedFormat,
  rotateEncryption,
  CREDENTIAL_TYPES,
  CredentialType
} from './encryption';

export interface CredentialMetadata {
  id?: string;
  name: string;
  serviceType: CredentialType;
  description?: string;
  environment?: 'production' | 'staging' | 'development';
  projectId: string;
  isActive?: boolean;
  expiresAt?: Date;
  createdBy?: string;
}

export interface EncryptedCredential extends CredentialMetadata {
  id: string;
  encryptedCredential: EncryptedData;
  encryptedUsername?: EncryptedData;
  encryptedAdditionalData?: EncryptedData;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  accessCount: number;
  encryptionVersion: number;
}

export interface DecryptedCredential extends Omit<CredentialMetadata, 'id'> {
  id: string;
  credential: string;
  username?: string;
  additionalData?: any;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  accessCount: number;
  isExpired: boolean;
}

export interface CredentialCreateInput extends CredentialMetadata {
  credential: string;
  username?: string;
  additionalData?: any;
}

export interface CredentialUpdateInput {
  name?: string;
  description?: string;
  environment?: 'production' | 'staging' | 'development';
  isActive?: boolean;
  expiresAt?: Date;
  credential?: string;
  username?: string;
  additionalData?: any;
}

class CredentialManager {
  private masterKey: string | null = null;

  private getMasterKey(): string {
    if (!this.masterKey) {
      this.masterKey = getEncryptionMasterKey();
    }
    return this.masterKey;
  }

  /**
   * Create a new encrypted credential
   */
  async createCredential(input: CredentialCreateInput): Promise<DecryptedCredential> {
    try {
      errorLogger.log('Creating new encrypted credential', { 
        name: input.name, 
        serviceType: input.serviceType,
        projectId: input.projectId 
      });

      // Encrypt the main credential
      const credentialEncryption = encrypt(input.credential, this.getMasterKey());
      if (!credentialEncryption.success) {
        throw new Error(`Failed to encrypt credential: ${credentialEncryption.error}`);
      }

      // Encrypt username if provided
      let encryptedUsername: EncryptedData | undefined;
      if (input.username) {
        const usernameEncryption = encrypt(input.username, this.getMasterKey());
        if (!usernameEncryption.success) {
          throw new Error(`Failed to encrypt username: ${usernameEncryption.error}`);
        }
        encryptedUsername = usernameEncryption.encrypted;
      }

      // Encrypt additional data if provided
      let encryptedAdditionalData: EncryptedData | undefined;
      if (input.additionalData) {
        const additionalDataString = JSON.stringify(input.additionalData);
        const additionalDataEncryption = encrypt(additionalDataString, this.getMasterKey());
        if (!additionalDataEncryption.success) {
          throw new Error(`Failed to encrypt additional data: ${additionalDataEncryption.error}`);
        }
        encryptedAdditionalData = additionalDataEncryption.encrypted;
      }

      // Create the credential record
      const { data, error } = await supabase
        .from('project_credentials')
        .insert({
          name: input.name,
          service_type: input.serviceType,
          description: input.description,
          environment: input.environment || 'production',
          project_id: input.projectId,
          is_active: input.isActive ?? true,
          expires_at: input.expiresAt?.toISOString() || null,
          encrypted_credential: credentialEncryption.encrypted,
          encrypted_username: encryptedUsername || null,
          encrypted_additional_data: encryptedAdditionalData || null,
          created_by: input.createdBy || null,
          encryption_version: 1
        })
        .select()
        .single();

      if (error) {
        errorLogger.error('Failed to create credential', error);
        throw error;
      }

      // Log the creation
      await this.logCredentialActivity(input.projectId, 'created', input.name, {
        serviceType: input.serviceType,
        environment: input.environment
      });

      // Return decrypted version for immediate use
      return await this.decryptCredential(data);
    } catch (error) {
      errorLogger.error('Error creating credential', error);
      throw error;
    }
  }

  /**
   * Get credentials for a project
   */
  async getProjectCredentials(
    projectId: string, 
    serviceType?: CredentialType
  ): Promise<DecryptedCredential[]> {
    try {
      errorLogger.log('Fetching credentials for project', { projectId, serviceType });

      const { data, error } = await supabase
        .rpc('get_project_credential', {
          p_project_id: projectId,
          p_service_type: serviceType || null
        });

      if (error) {
        errorLogger.error('Failed to fetch project credentials', error);
        throw error;
      }

      // Decrypt all credentials
      const decryptedCredentials = await Promise.all(
        (data || []).map(credential => this.decryptCredential(credential))
      );

      return decryptedCredentials;
    } catch (error) {
      errorLogger.error('Error fetching project credentials', error);
      throw error;
    }
  }

  /**
   * Get a single credential by ID
   */
  async getCredential(credentialId: string): Promise<DecryptedCredential> {
    try {
      errorLogger.log('Fetching single credential', { credentialId });

      const { data, error } = await supabase
        .from('project_credentials')
        .select('*')
        .eq('id', credentialId)
        .single();

      if (error) {
        errorLogger.error('Failed to fetch credential', error);
        throw error;
      }

      return await this.decryptCredential(data);
    } catch (error) {
      errorLogger.error('Error fetching credential', error);
      throw error;
    }
  }

  /**
   * Update an existing credential
   */
  async updateCredential(
    credentialId: string, 
    updates: CredentialUpdateInput
  ): Promise<DecryptedCredential> {
    try {
      errorLogger.log('Updating credential', { credentialId, updates });

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Handle non-sensitive fields
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.environment !== undefined) updateData.environment = updates.environment;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.expiresAt !== undefined) updateData.expires_at = updates.expiresAt?.toISOString() || null;

      // Handle sensitive fields (encrypt if provided)
      if (updates.credential !== undefined) {
        const encryption = encrypt(updates.credential, this.getMasterKey());
        if (!encryption.success) {
          throw new Error(`Failed to encrypt credential: ${encryption.error}`);
        }
        updateData.encrypted_credential = encryption.encrypted;
      }

      if (updates.username !== undefined) {
        if (updates.username) {
          const encryption = encrypt(updates.username, this.getMasterKey());
          if (!encryption.success) {
            throw new Error(`Failed to encrypt username: ${encryption.error}`);
          }
          updateData.encrypted_username = encryption.encrypted;
        } else {
          updateData.encrypted_username = null;
        }
      }

      if (updates.additionalData !== undefined) {
        if (updates.additionalData) {
          const additionalDataString = JSON.stringify(updates.additionalData);
          const encryption = encrypt(additionalDataString, this.getMasterKey());
          if (!encryption.success) {
            throw new Error(`Failed to encrypt additional data: ${encryption.error}`);
          }
          updateData.encrypted_additional_data = encryption.encrypted;
        } else {
          updateData.encrypted_additional_data = null;
        }
      }

      const { data, error } = await supabase
        .from('project_credentials')
        .update(updateData)
        .eq('id', credentialId)
        .select()
        .single();

      if (error) {
        errorLogger.error('Failed to update credential', error);
        throw error;
      }

      // Log the update
      await this.logCredentialActivity(
        data.project_id, 
        'updated', 
        data.name, 
        { serviceType: data.service_type }
      );

      return await this.decryptCredential(data);
    } catch (error) {
      errorLogger.error('Error updating credential', error);
      throw error;
    }
  }

  /**
   * Delete a credential
   */
  async deleteCredential(credentialId: string): Promise<void> {
    try {
      errorLogger.log('Deleting credential', { credentialId });

      // First get the credential for logging
      const { data: credential, error: fetchError } = await supabase
        .from('project_credentials')
        .select('project_id, name, service_type')
        .eq('id', credentialId)
        .single();

      if (fetchError) {
        errorLogger.error('Failed to fetch credential for deletion logging', fetchError);
      }

      const { error } = await supabase
        .from('project_credentials')
        .delete()
        .eq('id', credentialId);

      if (error) {
        errorLogger.error('Failed to delete credential', error);
        throw error;
      }

      // Log the deletion
      if (credential) {
        await this.logCredentialActivity(
          credential.project_id, 
          'deleted', 
          credential.name, 
          { serviceType: credential.service_type }
        );
      }
    } catch (error) {
      errorLogger.error('Error deleting credential', error);
      throw error;
    }
  }

  /**
   * Rotate encryption for a credential
   */
  async rotateCredentialEncryption(
    credentialId: string,
    oldMasterKey: string,
    newMasterKey: string
  ): Promise<DecryptedCredential> {
    try {
      errorLogger.log('Rotating credential encryption', { credentialId });

      // Get current credential
      const { data: currentCredential, error } = await supabase
        .from('project_credentials')
        .select('*')
        .eq('id', credentialId)
        .single();

      if (error) {
        errorLogger.error('Failed to fetch credential for rotation', error);
        throw error;
      }

      // Rotate main credential
      const rotatedCredential = rotateEncryption(
        currentCredential.encrypted_credential,
        oldMasterKey,
        newMasterKey
      );

      if (!rotatedCredential.success) {
        throw new Error(`Failed to rotate credential: ${rotatedCredential.error}`);
      }

      const updateData: any = {
        encrypted_credential: rotatedCredential.encrypted,
        encryption_version: 1 // Keep track of version
      };

      // Rotate username if present
      if (currentCredential.encrypted_username) {
        const rotatedUsername = rotateEncryption(
          currentCredential.encrypted_username,
          oldMasterKey,
          newMasterKey
        );

        if (!rotatedUsername.success) {
          throw new Error(`Failed to rotate username: ${rotatedUsername.error}`);
        }
        updateData.encrypted_username = rotatedUsername.encrypted;
      }

      // Rotate additional data if present
      if (currentCredential.encrypted_additional_data) {
        const rotatedAdditionalData = rotateEncryption(
          currentCredential.encrypted_additional_data,
          oldMasterKey,
          newMasterKey
        );

        if (!rotatedAdditionalData.success) {
          throw new Error(`Failed to rotate additional data: ${rotatedAdditionalData.error}`);
        }
        updateData.encrypted_additional_data = rotatedAdditionalData.encrypted;
      }

      const { data: updatedCredential, error: updateError } = await supabase
        .from('project_credentials')
        .update(updateData)
        .eq('id', credentialId)
        .select()
        .single();

      if (updateError) {
        errorLogger.error('Failed to update rotated credential', updateError);
        throw updateError;
      }

      // Log the rotation
      await this.logCredentialActivity(
        updatedCredential.project_id,
        'rotated_encryption',
        updatedCredential.name,
        { serviceType: updatedCredential.service_type }
      );

      return await this.decryptCredential(updatedCredential, newMasterKey);
    } catch (error) {
      errorLogger.error('Error rotating credential encryption', error);
      throw error;
    }
  }

  /**
   * Check if credential is expired
   */
  async isCredentialExpired(credentialId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('is_credential_expired', { credential_id: credentialId });

      if (error) {
        errorLogger.error('Failed to check credential expiration', error);
        throw error;
      }

      return data || false;
    } catch (error) {
      errorLogger.error('Error checking credential expiration', error);
      throw error;
    }
  }

  /**
   * Decrypt credential data
   */
  private async decryptCredential(
    credential: any, 
    customKey?: string
  ): Promise<DecryptedCredential> {
    try {
      const key = customKey || this.getMasterKey();

      // Validate encrypted credential format
      if (!validateEncryptedFormat(credential.encrypted_credential)) {
        throw new Error('Invalid encrypted credential format');
      }

      // Decrypt main credential
      const credentialDecryption = decrypt(credential.encrypted_credential, key);
      if (!credentialDecryption.success) {
        throw new Error(`Failed to decrypt credential: ${credentialDecryption.error}`);
      }

      // Decrypt username if present
      let decryptedUsername: string | undefined;
      if (credential.encrypted_username) {
        if (!validateEncryptedFormat(credential.encrypted_username)) {
          throw new Error('Invalid encrypted username format');
        }
        const usernameDecryption = decrypt(credential.encrypted_username, key);
        if (!usernameDecryption.success) {
          throw new Error(`Failed to decrypt username: ${usernameDecryption.error}`);
        }
        decryptedUsername = usernameDecryption.decrypted;
      }

      // Decrypt additional data if present
      let decryptedAdditionalData: any;
      if (credential.encrypted_additional_data) {
        if (!validateEncryptedFormat(credential.encrypted_additional_data)) {
          throw new Error('Invalid encrypted additional data format');
        }
        const additionalDataDecryption = decrypt(credential.encrypted_additional_data, key);
        if (!additionalDataDecryption.success) {
          throw new Error(`Failed to decrypt additional data: ${additionalDataDecryption.error}`);
        }
        decryptedAdditionalData = JSON.parse(additionalDataDecryption.decrypted);
      }

      // Check if expired
      const isExpired = credential.expires_at 
        ? new Date(credential.expires_at) < new Date()
        : false;

      return {
        id: credential.id,
        name: credential.name,
        serviceType: credential.service_type as CredentialType,
        description: credential.description,
        environment: credential.environment,
        projectId: credential.project_id,
        isActive: credential.is_active,
        expiresAt: credential.expires_at ? new Date(credential.expires_at) : undefined,
        credential: credentialDecryption.decrypted,
        username: decryptedUsername,
        additionalData: decryptedAdditionalData,
        createdAt: credential.created_at,
        updatedAt: credential.updated_at,
        lastAccessedAt: credential.last_accessed_at,
        accessCount: credential.access_count,
        isExpired
      };
    } catch (error) {
      errorLogger.error('Error decrypting credential', error);
      throw error;
    }
  }

  /**
   * Log credential activities for audit
   */
  private async logCredentialActivity(
    projectId: string,
    action: string,
    credentialName: string,
    metadata?: any
  ): Promise<void> {
    try {
      await supabase.from('activity_logs').insert({
        action: `${action}_credential`,
        target: credentialName,
        type: 'security',
        details: metadata,
        meta: {
          timestamp: new Date().toISOString(),
          credentialName
        }
      });
    } catch (error) {
      // Don't throw here - logging failure shouldn't break the main operation
      errorLogger.error('Failed to log credential activity', error);
    }
  }
}

// Export singleton instance
export const credentialManager = new CredentialManager();

// Types are already exported via the export statements above

// Export constants
export { CREDENTIAL_TYPES };