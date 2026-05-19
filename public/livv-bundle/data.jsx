// Livv Dashboard — data + small inline components/helpers.
// All exports get attached to window for sibling Babel scripts.

const Icon = ({ name, size = 16, stroke = 1.6, style }) => {
  const paths = {
    home: <><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></>,
    brief: <><path d="M3 6l9 4 9-4-9-4-9 4z"/><path d="M3 12l9 4 9-4"/><path d="M3 18l9 4 9-4"/></>,
    activity: <><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
    docs: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></>,
    strategy: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></>,
    content: <><path d="M4 4h16v6H4zM4 14h10v6H4zM18 14h2v6h-2z"/></>,
    scaling: <><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></>,
    clients: <><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21V12h6v9"/></>,
    platform: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    theme: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>,
    chevron: <><path d="M9 6l6 6-6 6"/></>,
    chevronDown: <><path d="M6 9l6 6 6-6"/></>,
    chevronUp: <><path d="M18 15l-6-6-6 6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    sparkle: <><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2"/></>,
    bulb: <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c1 1 2 2 2 3.5h4c0-1.5 1-2.5 2-3.5A6 6 0 0 0 12 3z"/></>,
    bolt: <><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>,
    send: <><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></>,
    arrowUpRight: <><path d="M7 17L17 7M7 7h10v10"/></>,
    check: <><path d="M5 12l5 5 9-11"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    alert: <><path d="M10.3 3.7L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17v.01"/></>,
    inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6L18.5 5A2 2 0 0 0 16.8 4H7.2A2 2 0 0 0 5.5 5z"/></>,
    tasks: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M1 1l22 22"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></>,
    bookmark: <><path d="M6 3h12v18l-6-4-6 4V3z"/></>,
    dashboard: <><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></>,
    star: <><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2z"/></>,
    play: <><path d="M5 3l14 9-14 9z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    viewDay: <><rect x="8" y="4" width="8" height="16" rx="1.5"/><path d="M5 4v16M19 4v16"/></>,
    viewWeek: <><rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M7 6v12M11 6v12M15 6v12M19 6v12"/></>,
    viewMonth: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 11h18M9 5v16M15 5v16"/></>,
    viewBoard: <><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="14" rx="1"/></>,
    viewList: <><path d="M4 7h16M4 12h16M4 17h11"/><circle cx="4" cy="7" r="0.5" fill="currentColor"/></>,
    sunrise: <><path d="M12 2v6M5 9l1.5 1.5M19 9l-1.5 1.5M3 16h18M6 19h12"/><circle cx="12" cy="13" r="3"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/></>,
    sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>{paths[name]}</svg>
  );
};

const NAV_TOP = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'brief', icon: 'brief', label: 'Brief' },
  { id: 'activity', icon: 'activity', label: 'Activity' },
];
const NAV_MID = [
  { id: 'calendar', icon: 'calendar', label: 'Calendar' },
  { id: 'docs', icon: 'docs', label: 'Docs' },
];
const NAV_BOT = [
  { id: 'strategy', icon: 'strategy', label: 'Strategy' },
  { id: 'content', icon: 'content', label: 'Content' },
  { id: 'scaling', icon: 'scaling', label: 'Scaling' },
];

const CLIENTS = [
  { name: 'The Bloom', color: '#6DBEDC' },
  { name: 'Back Office Team', color: '#6DBEDC' },
  { name: 'Cremona Capital', color: '#6DBEDC' },
  { name: 'Ethos Group', color: '#6DBEDC' },
  { name: 'Sunnyside', color: '#6DBEDC' },
  { name: 'Mobilita', color: '#6DBEDC' },
  { name: 'Late Bloomer', color: '#6DBEDC' },
  { name: 'Frenetic Sports', color: '#6DBEDC' },
];

const OVERDUE_TASKS = [
  { id: 't1', title: 'Framer project setup: pages, breakpoints, brand tokens', overdue: '3d', priority: 'medium' },
  { id: 't2', title: 'Lucky sub-brand assets received and reviewed', overdue: '3d', priority: 'medium' },
  { id: 't3', title: 'Content audit: confirm which pages have final copy', overdue: '3d', priority: 'low' },
  { id: 't4', title: 'CMS architecture: collections, fields, relationships', overdue: '3d', priority: 'medium' },
  { id: 't5', title: 'Ads meta y estrategia de contenidos livv', overdue: '5d', duration: '1h', priority: 'high' },
  { id: 't6', title: 'CMS architecture: collections, fields, relationships', overdue: '3d', workspace: 'Sunnyside', priority: 'low' },
  { id: 't7', title: 'Content audit: confirm which pages have final copy', overdue: '3d', priority: 'low' },
  { id: 't8', title: 'Definir estrategias y cerrar un plan para subir todo el contenido', overdue: '6d', duration: '1h', workspace: 'Livv Lead Gen', priority: 'high' },
  { id: 't9', title: 'CMS architecture: collections, fields, relationships', overdue: '4d', workspace: 'Sunnyside', priority: 'medium' },
  { id: 't10', title: 'Content audit: confirm which pages have final copy', overdue: '3d', workspace: 'Sunnyside', priority: 'low' },
  { id: 't11', title: 'Lucky sub-brand assets received and reviewed', overdue: '3d', workspace: 'Sunnyside', priority: 'medium' },
  { id: 't12', title: 'Lucky sub-brand experience locked', overdue: '2d', workspace: 'Sunnyside', priority: 'medium' },
  { id: 't13', title: 'Art direction and image guidance delivered', overdue: '2d', workspace: 'Sunnyside', priority: 'medium' },
  { id: 't14', title: 'Phase 2 — Design Finalization', overdue: '2d', workspace: 'Sunnyside', priority: 'high' },
  { id: 't15', title: 'Upgrade portofio livv', overdue: '6d', priority: 'high' },
  { id: 't16', title: 'Terminar web de Christie', overdue: '7d', workspace: 'Christie King', priority: 'medium' },
  { id: 't17', title: 'Checkpoint 1 — Architecture approval', overdue: '4d', workspace: 'Sunnyside', priority: 'high' },
  { id: 't18', title: 'Phase 1 — Architecture & Setup', overdue: '5d', workspace: 'Sunnyside', priority: 'high' },
];

const TODAY_AGENDA = [
  { id: 'a1', title: 'Terminar web de Christie', when: 'hace 7d' },
  { id: 'a2', title: 'Ads meta y estrategia de contenidos livv', when: 'hace 6d' },
  { id: 'a3', title: 'Upgrade portofio livv', when: 'hace 6d' },
  { id: 'a4', title: 'CMS architecture: collections, fields, relationships', when: 'hace 5d' },
  { id: 'a5', title: 'Framer project setup: pages, breakpoints, brand tokens', when: 'hace 5d' },
];

const ACTIVE_PROJECTS = [
  { id: 'p1', initials: 'ET', name: 'Ethos Group', progress: 0, color: '#769268' },
  { id: 'p2', initials: 'SU', name: 'Sunnyside', progress: 35, color: '#E8BC59' },
  { id: 'p3', initials: 'CR', name: 'Cremona Capital', progress: 62, color: '#6DBEDC' },
  { id: 'p4', initials: 'CK', name: 'Christie King', progress: 18, color: '#F1ADD8' },
];

const INSIGHT_CHIPS = [
  { label: '$15,300 pending', tone: 'amber' },
  { label: '+$1,414 profit', tone: 'green' },
  { label: '24 overdue', tone: 'red' },
  { label: '24 urgent', tone: 'red' },
  { label: '17 active projects', tone: 'blue' },
];
const INSIGHTS = [
  '$15,300 in pending payments — follow up to improve cash flow.',
  '6 overdue payments — collect ASAP.',
  '24 overdue tasks need attention today.',
];

Object.assign(window, {
  Icon, NAV_TOP, NAV_MID, NAV_BOT, CLIENTS,
  OVERDUE_TASKS, TODAY_AGENDA, ACTIVE_PROJECTS,
  INSIGHT_CHIPS, INSIGHTS,
});
