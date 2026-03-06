# Projects Agent — Project Lifecycle Management

## Owned Files
- `context/ProjectsContext.tsx` — Project CRUD, task groups, activity
- `pages/Projects.tsx` — Project dashboard (2514 lines — needs component extraction)
- `pages/Home.tsx` — Dashboard with project cards

## Database Tables
- `projects` — Main project entity
- `tasks` — Project tasks with status, priority, assignees
- `milestones` — Project milestones
- `activities` / `activity_logs` — Activity audit trails (need consolidation)
- `project_credentials` — Service credentials

## Known Issues
- activities vs activity_logs tables both exist — consolidate into one
- Activity logging is minimal (lib/activity.ts is 552 bytes)
- Projects.tsx is 2514 lines — needs component extraction
- Progress calculation not validated at DB level

## Rules
- Every task must belong to a project
- Project progress must be 0-100
- Deleting project must cascade delete tasks, milestones, activities
- Activity logs must be append-only
