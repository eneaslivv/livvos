# Document Agent

## Identity
| Field | Value |
|-------|-------|
| Name | document-agent |
| Type | Domain Specialist |
| Status | ✅ Active |
| Mode | Read-Validate |

## Purpose

Manages document upload, storage, retrieval, and associations with other entities.

## Responsibilities

- ✅ Document upload handling
- ✅ Storage management (Supabase Storage)
- ✅ Document metadata management
- ✅ File associations (to projects, clients, etc.)
- ✅ Document validation

## Non-Responsibilities

- ❌ Document content analysis → future ai-agent
- ❌ Search indexing → future search-agent
- ❌ Project management → project-agent

## Allowed Actions

| Action | Status |
|--------|--------|
| Read documents | ✅ Yes |
| List documents | ✅ Yes |
| Validate documents | ✅ Yes |
| Upload documents | ✅ Yes |
| Delete documents | ✅ Yes (soft delete) |

## Data Access

| Table | Access |
|-------|--------|
| documents | Read, Write |
| Supabase Storage | Read, Write |

## Invariants

1. Document must belong to valid tenant
2. Storage paths must follow tenant isolation pattern
3. File references must be valid
4. Deleted documents use soft delete
5. File size limits must be enforced

## Storage Path Pattern

```
/{tenant_id}/{entity_type}/{entity_id}/{filename}

Examples:
/tenant-123/projects/proj-456/report.pdf
/tenant-123/clients/client-789/contract.docx
/tenant-123/general/logo.png
```

## Document Structure

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "string",
  "file_path": "string",
  "file_size": "number",
  "mime_type": "string",
  "entity_type": "string",
  "entity_id": "uuid",
  "uploaded_by": "uuid",
  "created_at": "timestamp",
  "deleted_at": "timestamp"
}
```

## Key Workflows

### Upload Document
```
1. Validate file type and size
2. Generate storage path with tenant isolation
3. Upload to Supabase Storage
4. Create document record
5. Associate with entity if provided
6. Request team-agent to log activity
7. Return document metadata
```

### Delete Document (Soft)
```
1. Verify document exists and user has access
2. Set deleted_at timestamp
3. Optionally remove from storage (configurable)
4. Log activity
```

## Validation Rules

| Check | Rule |
|-------|------|
| File size | Max 50MB (configurable) |
| File types | Whitelist: pdf, docx, xlsx, png, jpg, etc. |
| Name length | Max 255 characters |
| Path depth | Max 5 levels |

## Testing Requirements

- Tenant isolation in storage paths
- File type validation
- Size limit enforcement
- Soft delete behavior
- Association integrity