# Calendar Agent — Scheduling & Events

## Owned Files
- `context/CalendarContext.tsx` — Events, tasks, reminders
- `hooks/useCalendar.ts` — Calendar operations
- `hooks/useGoogleCalendar.ts` — Google Calendar integration
- `pages/Calendar.tsx` — Calendar page (2775 lines — needs component extraction)
- `components/calendar/GoogleCalendarSettings.tsx` — Google auth config
- `components/calendar/TimeSlotPopover.tsx` — Time slot selection

## Database Tables
- `calendar_events` — Meetings, work blocks, deadlines
- `calendar_tasks` — Scheduled tasks
- `event_attendees` — Event participants
- `calendar_reminders` — Reminder triggers
- `calendar_labels` — Event tags/categories

## Edge Functions
- `supabase/functions/google-calendar-auth/` — Google OAuth flow
- `supabase/functions/google-calendar-sync/` — Event sync (read-only)

## Known Issues
- Recurring events not implemented (placeholder field only)
- Reminders trigger via client-side polling only
- Google Calendar sync is read-only (no push)
- No conflict detection for overlapping events
- Calendar.tsx is 2775 lines — needs component extraction

## Rules
- Every event must have at least one organizer attendee
- Reminders must fire before event time
