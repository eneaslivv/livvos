# Credential Encryption System Documentation

## Overview

The eneas-os platform now implements a comprehensive credential encryption system to securely store sensitive project credentials. This system addresses the critical security vulnerability where credentials were previously stored in plain text.

## Architecture

### Core Components

1. **Encryption Library** (`lib/encryption.ts`)
   - AES-256-GCM encryption with authentication
   - PBKDF2 key derivation
   - Secure random salt and IV generation
   - Timing attack resistant comparisons

2. **Credential Manager** (`lib/credentialManager.ts`)
   - High-level credential operations
   - Database integration with Supabase
   - Access control and auditing
   - Key rotation support

3. **Security Context** (`context/SecurityContext.tsx`)
   - React context for security state
   - Permission-based access control
   - Credential management UI hooks
   - Role-based operations

4. **Database Schema** (`migrations/2026-01-20_credential_encryption.sql`)
   - Encrypted credential storage
   - Row-level security policies
   - Audit logging triggers
   - Access tracking

## Encryption Details

### Algorithm: AES-256-GCM

- **Key Length**: 256 bits
- **IV Length**: 128 bits (random per encryption)
- **Authentication Tag**: 128 bits
- **Key Derivation**: PBKDF2 with SHA-256, 100,000 iterations
- **Salt Length**: 256 bits (random per credential)

### Encryption Process

1. Generate cryptographically secure salt
2. Derive encryption key using PBKDF2
3. Generate random IV
4. Encrypt plaintext with AES-256-GCM
5. Store: `{data, iv, tag, salt, version}` as JSONB

### Security Features

- **Authentication**: GCM mode provides integrity verification
- **No Key Reuse**: Unique salt and IV per credential
- **Memory Safety**: Secure wiping of sensitive data
- **Timing Resistance**: Secure string comparison

## Database Schema

### project_credentials Table

```sql
CREATE TABLE project_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    service_type TEXT NOT NULL,
    description TEXT,
    environment TEXT DEFAULT 'production',
    is_active BOOLEAN DEFAULT true,
    encrypted_credential JSONB NOT NULL,
    encrypted_username JSONB,
    encrypted_additional_data JSONB,
    expires_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    encryption_version INTEGER DEFAULT 1,
    -- Constraints and indexes...
);
```

### Encrypted Data Format

```json
{
  "data": "base64-encrypted-data",
  "iv": "base64-initialization-vector",
  "tag": "base64-authentication-tag",
  "salt": "base64-salt",
  "version": 1
}
```

## Usage Examples

### Creating a Credential

```typescript
import { credentialManager } from '../lib/credentialManager';

const credential = await credentialManager.createCredential({
  name: 'Stripe API Key',
  serviceType: 'api_key',
  description: 'Production Stripe API key',
  projectId: 'project-uuid',
  credential: 'sk_live_123456789',
  environment: 'production'
});
```

### Retrieving Credentials

```typescript
const credentials = await credentialManager.getProjectCredentials('project-uuid');
const singleCredential = await credentialManager.getCredential('credential-uuid');
```

### Updating a Credential

```typescript
const updated = await credentialManager.updateCredential('credential-uuid', {
  credential: 'new-api-key-value',
  description: 'Updated description'
});
```

### Using Security Context

```typescript
import { useSecurity } from '../context/SecurityContext';

function CredentialManager() {
  const { 
    hasPermission, 
    createCredential, 
    credentials, 
    credentialsLoading 
  } = useSecurity();

  const canCreateCredentials = hasPermission('credentials', 'create');
  
  // ... rest of component
}
```

## Key Management

### Environment Variables

```bash
# Required - Master encryption key (32+ characters)
ENCRYPTION_MASTER_KEY=your-super-secret-32-character-master-key

# Optional - Key rotation settings
ENCRYPTION_KEY_ROTATION_DAYS=90

# Optional - Security settings
MAX_CREDENTIAL_ACCESS_ATTEMPTS=3
CREDENTIAL_LOCKOUT_DURATION_MINUTES=15
```

### Key Rotation Process

1. **Generate New Key**
   ```bash
   openssl rand -base64 32
   ```

2. **Update Environment**
   - Add new key as `ENCRYPTION_MASTER_KEY_NEW`
   - Keep old key available as `ENCRYPTION_MASTER_KEY`

3. **Run Rotation Script**
   ```typescript
   import { credentialManager } from '../lib/credentialManager';
   
   await credentialManager.rotateAllCredentials(
     oldKey, 
     newKey
   );
   ```

4. **Verify Migration**
   ```sql
   SELECT * FROM get_migration_stats();
   ```

5. **Update Production**
   - Replace `ENCRYPTION_MASTER_KEY` with new key
   - Remove old key from environment

## Security Policies

### Access Control

- **Project Owners**: Full access to project credentials
- **Admin Role**: System-wide credential access
- **Project Manager**: Access to assigned project credentials
- **Regular Users**: No direct credential access

### Audit Logging

All credential operations are logged:
- Creation, updates, deletion
- Access attempts (successful and failed)
- Key rotation events
- Permission changes

### Row-Level Security

- Users can only access credentials for projects they own
- Role-based access enforcement
- Automatic access tracking

## Migration Process

### From Plain Text

The system includes automatic migration for existing plain text credentials:

1. **Backup Creation**: Original data backed up to `project_credentials_backup`
2. **Initial Encryption**: Plain text encrypted with temporary method
3. **Application Re-encryption**: Proper AES-256-GCM encryption
4. **Verification**: All credentials properly encrypted
5. **Cleanup**: Remove temporary data

### Migration Scripts

```sql
-- Check migration status
SELECT * FROM get_migration_stats();

-- Get credentials needing re-encryption
SELECT * FROM check_reencryption_needed();

-- Mark credential as properly encrypted
SELECT mark_credential_encrypted('credential-uuid');
```

## Testing

### Unit Tests

Run comprehensive test suite:
```bash
npm test encryption
```

Test coverage includes:
- Encryption/decryption accuracy
- Key rotation functionality
- Error handling
- Performance with large data
- Unicode/special character handling

### Integration Tests

Database integration tests:
- Credential CRUD operations
- Permission enforcement
- Audit logging
- Migration scenarios

### Security Testing

Recommended security tests:
- Penetration testing of credential endpoints
- Key extraction attempts
- Timing attack resistance
- Memory leak analysis

## Best Practices

### Development

1. **Never commit encryption keys** to version control
2. **Use environment-specific keys** (dev/staging/prod)
3. **Test encryption thoroughly** before deployment
4. **Monitor for credential access** anomalies

### Production

1. **Use a dedicated key management service** (AWS KMS, Azure Key Vault, etc.)
2. **Regular key rotation** (every 90 days recommended)
3. **Comprehensive audit logging** and monitoring
4. **Backup encryption keys** securely

### Operational

1. **Monitor credential access patterns**
2. **Set up alerts for unauthorized access attempts**
3. **Regular security audits** of credential usage
4. **Document key rotation procedures**

## Troubleshooting

### Common Issues

**Encryption Key Not Found**
```
Error: ENCRYPTION_MASTER_KEY environment variable is not set
```
- Ensure environment variables are properly configured
- Check key length (minimum 32 characters)

**Decryption Failures**
```
Error: Failed to decrypt credential: authentication failed
```
- Verify encryption key is correct
- Check credential hasn't been corrupted
- Ensure key rotation completed successfully

**Permission Denied**
```
Error: Access denied to credential
```
- Verify user has appropriate role
- Check project ownership
- Ensure RLS policies are enabled

### Debug Mode

Enable debug logging:
```bash
ENCRYPTION_DEBUG=true
```

### Recovery Procedures

1. **Credential Backup**: Restore from `project_credentials_backup`
2. **Key Recovery**: Use secure key backup procedures
3. **Data Recovery**: Contact system administrator for assistance

## Compliance

### Security Standards

- **AES-256-GCM**: Industry standard encryption
- **PBKDF2**: NIST-approved key derivation
- **Secure Random**: Cryptographically secure random generation
- **Authentication**: Integrity verification for all encrypted data

### Audit Requirements

- **Access Logging**: All credential access logged
- **Change Tracking**: Complete audit trail
- **Retention Configurable**: Policy-based log retention
- **Tamper-Evident**: Cryptographic integrity checks

## Future Enhancements

### Planned Features

1. **Hardware Security Module (HSM)** integration
2. **Multi-region key replication**
3. **Zero-knowledge proof architecture**
4. **Advanced threat detection**
5. **Automated credential rotation**

### Scalability

- **Horizontal Scaling**: Stateless encryption design
- **Database Optimizations**: Efficient indexing
- **Caching Strategy**: Secure credential caching
- **Load Balancing**: Distribute encryption operations

## Support

For security-related issues:
1. **Contact Security Team** immediately
2. **Do not disclose** potential vulnerabilities publicly
3. **Follow incident response** procedures
4. **Document all actions** taken

For technical support:
1. **Review documentation** thoroughly
2. **Check troubleshooting** section
3. **Review error logs** for details
4. **Contact development team** if needed

---

**Security Notice**: This system handles highly sensitive data. Always follow security best practices and regulatory requirements when managing credentials.