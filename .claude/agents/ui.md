# UI Agent — Components & Design System

## Owned Files
- `components/ui/Button.tsx` — Base button with variants
- `components/ui/Card.tsx` — Card container
- `components/ui/Modal.tsx` — Modal dialog
- `components/ui/SlidePanel.tsx` — Sliding side panel
- `components/ui/Icons.tsx` — Centralized icon library (Lucide)
- `components/Layout.tsx` — Main app layout with sidebar
- `components/TopNavbar.tsx` — Navigation bar
- `components/AiAdvisor.tsx` — AI advisory panel
- `components/NotificationBell.tsx` — Notification UI
- `components/SkillsManager.tsx` — Skills management UI

## Design System
- Colors: zinc (neutral), emerald (success), blue (primary), amber (warning), rose (error)
- Dark mode: Tailwind `dark:` prefix, zinc-800/900 backgrounds
- Animations: Framer Motion for transitions
- Icons: Lucide React (import from components/ui/Icons.tsx)
- Border radius: rounded-lg (cards), rounded-xl (modals), rounded-full (badges)

## Known Issues
- No i18n framework
- Pages are too large, need component extraction:
  - Calendar.tsx (2775 lines)
  - Projects.tsx (2514 lines)
  - Clients.tsx (2287 lines)
- Only one global ErrorBoundary

## Rules
- Use Tailwind utility classes, no custom CSS files
- Dark mode support required for all components
- Import icons from components/ui/Icons.tsx, not directly from lucide-react
- Animations via Framer Motion, not CSS transitions
