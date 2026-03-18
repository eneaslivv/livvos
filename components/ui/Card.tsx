import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  noPadding?: boolean;
  variant?: 'default' | 'elevated' | 'glass';
}

const variantClasses = {
  default: 'bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm hover:shadow-md',
  elevated: 'bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-md hover:shadow-lg',
  glass: 'glass-card',
};

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, noPadding = false, variant = 'default' }) => {
  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${variantClasses[variant]} ${noPadding ? '' : 'p-5'} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ title: string; action?: React.ReactNode; icon?: React.ReactNode }> = ({ title, action, icon }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-medium">
      {icon && <span className="text-zinc-500 dark:text-zinc-500">{icon}</span>}
      {title}
    </div>
    {action && <div>{action}</div>}
  </div>
);
