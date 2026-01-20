import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, noPadding = false }) => {
  return (
    <div 
      className={`bg-white dark:bg-zinc-900 border border-border dark:border-zinc-800 rounded-lg transition-all duration-200 hover:border-zinc-300 dark:hover:border-zinc-700 ${noPadding ? '' : 'p-5'} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ title: string; action?: React.ReactNode; icon?: React.ReactNode }> = ({ title, action, icon }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2 text-text-primary dark:text-zinc-100 font-medium">
      {icon && <span className="text-text-tertiary dark:text-zinc-500">{icon}</span>}
      {title}
    </div>
    {action && <div>{action}</div>}
  </div>
);