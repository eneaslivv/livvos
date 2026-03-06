# Documents Agent — File & Document Management

## Owned Files
- `context/DocumentsContext.tsx` — Document CRUD
- `pages/Docs.tsx` — Document management page
- `components/docs/BlogPanel.tsx` — Blog content management
- `components/docs/PasswordsPanel.tsx` — Encrypted password vault
- `components/docs/ProposalsPanel.tsx` — Proposal creation

## Database Tables
- `documents` — Document metadata
- `folders` — Folder structure (currently text field in documents, needs separate table)
- `passwords` — Encrypted password vault

## Storage
- Supabase Storage bucket: 'documents'

## Known Issues
- Document versioning not implemented
- Folders stored as text field instead of separate table

## Rules
- Documents must be tenant-scoped
- Passwords must be encrypted via credentialManager
