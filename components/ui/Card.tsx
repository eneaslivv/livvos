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
      className={`bg-white border border-zinc-200 rounded-lg transition-all duration-200 hover:border-zinc-300 ${noPadding ? '' : 'p-5'} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ title: string; action?: React.ReactNode; icon?: React.ReactNode }> = ({ title, action, icon }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2 text-zinc-900 font-medium">
      {icon && <span className="text-zinc-500">{icon}</span>}
      {title}
    </div>
    {action && <div>{action}</div>}
  </div>
);
