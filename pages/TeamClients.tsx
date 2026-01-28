import React, { useEffect, useState } from 'react';
import { Team } from './Team';
import { Clients } from './Clients';

type TeamClientsTab = 'team' | 'clients';

interface TeamClientsProps {
  initialTab?: TeamClientsTab;
}

export const TeamClients: React.FC<TeamClientsProps> = ({ initialTab = 'team' }) => {
  const [activeTab, setActiveTab] = useState<TeamClientsTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="w-full h-full">
      <div className="px-6 pt-6">
        <div className="inline-flex rounded-full bg-zinc-100 dark:bg-zinc-800 p-1">
          {(['team', 'clients'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold rounded-full transition-all ${
                activeTab === tab
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {tab === 'team' ? 'Team' : 'Clients'}
            </button>
          ))}
        </div>
      </div>
      <div className="pt-2">
        {activeTab === 'team' ? <Team /> : <Clients />}
      </div>
    </div>
  );
};
