# Team Agent — Team & Notifications

## Owned Files
- `context/TeamContext.tsx` — Team member management, workload
- `context/NotificationsContext.tsx` — Notifications and alerts
- `pages/Team.tsx` — Team management page
- `pages/Activity.tsx` — Activity feed
- `lib/sendInviteEmail.ts` — Email invitation wrapper

## Database Tables
- `profiles` — Team member profiles
- `notifications` — User alerts
- `messages` — Message inbox
- `quick_hits` — Quick action items

## Edge Functions
- `supabase/functions/send-invite-email/` — Email invitations via Resend

## Known Issues
- Email notifications have templates but delivery is incomplete
- Notification delivery only works for invitations

## Rules
- Team members must belong to a tenant
- Notifications should be deliverable via multiple channels
