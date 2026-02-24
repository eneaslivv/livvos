
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Clock, Flag } from 'lucide-react';
import { TaskItem } from '../types';

const ClientTasks: React.FC<{ tasks?: TaskItem[] }> = ({ tasks }) => {
  const items = tasks && tasks.length ? tasks : [];
  const completed = items.filter(t => t.completed).length;
  const total = items.length;

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'text-red-500 bg-red-50 border-red-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-brand-dark/30 bg-brand-cream/30 border-brand-dark/5';
    }
  };

  if (items.length === 0) {
    return (
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 20 },
          visible: { opacity: 1, y: 0 }
        }}
        className="glass-card gradient-border-light p-8 h-full flex flex-col"
      >
        <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
          <Clock size={14} className="text-brand-accent" />
          Assigned Operations
        </h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11px] text-brand-dark/20 uppercase tracking-[0.2em] font-bold italic">No active operations assigned</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
      className="glass-card gradient-border-light p-8 h-full flex flex-col"
    >
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.3em] flex items-center gap-2">
          <Clock size={14} className="text-brand-accent" />
          Assigned Operations
        </h3>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-brand-dark/5 rounded-full">
          <span className="text-[9px] mono font-black text-brand-accent">{completed}/{total}</span>
          <span className="text-[8px] mono font-bold text-brand-dark/20 uppercase tracking-widest">Resolved</span>
        </div>
      </div>

      <div className="space-y-3 flex-1 max-h-[320px] overflow-y-auto custom-scroll pr-1">
        {items.map((task) => (
          <div
            key={task.id}
            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${
              task.completed
                ? 'bg-brand-cream/20 border-brand-dark/5 opacity-40'
                : 'bg-white/40 border-brand-dark/5 hover:bg-white hover:shadow-lg hover:shadow-brand-dark/5 hover:border-brand-accent/20'
            }`}
          >
            <div className="flex-shrink-0">
              {task.completed ? (
                <CheckCircle2 size={20} className="text-brand-accent" />
              ) : (
                <Circle size={20} className="text-brand-dark/15" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-black uppercase tracking-[0.1em] ${
                task.completed ? 'line-through text-brand-dark/30' : 'text-brand-dark/80'
              }`}>
                {task.title}
              </p>
              {task.dueDate && !task.completed && (
                <p className="text-[9px] text-brand-dark/30 mono mt-1 font-bold uppercase tracking-widest">
                  Due {task.dueDate}
                </p>
              )}
            </div>
            {task.priority && task.priority !== 'low' && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest ${getPriorityColor(task.priority)}`}>
                <Flag size={10} />
                {task.priority}
              </div>
            )}
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="mt-6 pt-4 border-t border-brand-dark/5">
          <div className="h-1.5 bg-brand-dark/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
              transition={{ duration: 1.5, ease: 'circOut' }}
              className="h-full bg-brand-accent shadow-[0_2px_8px_rgba(130,43,46,0.15)]"
            />
          </div>
          <p className="text-[9px] text-brand-dark/20 mono font-bold uppercase tracking-widest mt-2 text-center">
            Task Completion Protocol: {Math.round(total > 0 ? (completed / total) * 100 : 0)}%
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default ClientTasks;
