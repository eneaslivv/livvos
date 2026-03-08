import React, { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';
import { tzCity, tzNow, tzAbbr } from '../../lib/timezone';

interface ClientTimezoneInfo {
  timezone: string;
  clientNames: string[];
  color?: string | null;
}

interface TimezoneBarProps {
  clients: Array<{ id: string; name: string; timezone?: string | null; color?: string | null }>;
  activeTimezone: string | null;
  onSelectTimezone: (tz: string | null) => void;
}

export const TimezoneBar: React.FC<TimezoneBarProps> = ({ clients, activeTimezone, onSelectTimezone }) => {
  const [tick, setTick] = useState(0);

  // Update clocks every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Derive unique timezones from clients
  const timezoneGroups: ClientTimezoneInfo[] = React.useMemo(() => {
    const map = new Map<string, ClientTimezoneInfo>();
    for (const c of clients) {
      if (!c.timezone) continue;
      const existing = map.get(c.timezone);
      if (existing) {
        existing.clientNames.push(c.name);
        if (!existing.color && c.color) existing.color = c.color;
      } else {
        map.set(c.timezone, { timezone: c.timezone, clientNames: [c.name], color: c.color });
      }
    }
    return Array.from(map.values());
  }, [clients]);

  if (timezoneGroups.length === 0) {
    return (
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icons.Globe size={13} className="text-zinc-300 dark:text-zinc-600" />
        <span className="text-[11px] text-zinc-400 italic">No client timezones configured. Set a timezone on a client in CRM to see it here.</span>
      </div>
    );
  }

  // Also show the user's local timezone as reference
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
        <Icons.Globe size={11} />
        Zones:
      </span>

      {/* Local timezone pill */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-full shrink-0 bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60"
        title={`Your timezone: ${localTz}`}
      >
        <span className="font-medium">You</span>
        <span className="font-mono text-[10px] text-zinc-400">{tzNow(localTz)}</span>
      </div>

      {/* Client timezone pills */}
      {timezoneGroups.map(group => {
        const isActive = activeTimezone === group.timezone;
        const city = tzCity(group.timezone);
        const abbr = tzAbbr(group.timezone);
        const time = tzNow(group.timezone);
        // Force re-read on tick
        void tick;

        return (
          <button
            key={group.timezone}
            onClick={() => onSelectTimezone(isActive ? null : group.timezone)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-full transition-all duration-200 shrink-0 ${
              isActive
                ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-200 dark:shadow-blue-900/40'
                : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200/60 dark:border-zinc-700/60'
            }`}
            title={`${group.timezone} (${abbr})\nClients: ${group.clientNames.join(', ')}`}
          >
            {group.color && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span className="font-medium">{city}</span>
            <span className={`font-mono text-[10px] ${isActive ? 'text-blue-100' : 'text-zinc-400'}`}>{time}</span>
            {group.clientNames.length > 1 && (
              <span className={`text-[9px] font-bold px-1 rounded-full ${
                isActive ? 'bg-blue-500 text-blue-100' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
              }`}>
                {group.clientNames.length}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
