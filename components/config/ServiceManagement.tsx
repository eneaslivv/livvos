import React, { useState, useEffect } from 'react';
import { useRBAC } from '../../context/RBACContext';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { Service } from '../../types/rbac';

export const ServiceManagement: React.FC = () => {
  const { isAdmin } = useRBAC();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleService = async (serviceId: string, currentState: boolean) => {
    if (!isAdmin) return;
    
    // Optimistic update
    setServices(prev => prev.map(s => s.id === serviceId ? { ...s, is_active: !currentState } : s));

    try {
      const { error } = await supabase
        .from('services')
        .update({ is_active: !currentState })
        .eq('id', serviceId);

      if (error) {
        // Revert on error
        setServices(prev => prev.map(s => s.id === serviceId ? { ...s, is_active: currentState } : s));
        console.error('Error updating service:', error);
      }
    } catch (error) {
      console.error('Error updating service:', error);
    }
  };

  // Helper to get icon component (fallback to generic)
  const getIcon = (key: string) => {
    switch(key) {
        case 'sales': return Icons.TrendingUp;
        case 'crm': return Icons.Users;
        case 'finance': return Icons.DollarSign;
        case 'projects': return Icons.Folder; // Assuming Folder icon exists or use Briefcase
        case 'calendar': return Icons.Calendar;
        default: return Icons.Grid;
    }
  };

  if (loading) {
      return <div className="p-8 text-center text-zinc-500">Loading services...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">Service Management</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Enable or disable modules for your workspace.
        </p>
      </div>

      <div className="grid gap-4">
        {services.map((service) => {
            const Icon = getIcon(service.key);
            return (
                <div key={service.id} className="flex items-start justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <div className="flex gap-3">
                        <div className={`p-2 rounded-lg ${service.is_active ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'}`}>
                            <Icon size={20} />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{service.name}</h4>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{service.description}</p>
                        </div>
                    </div>
                    
                    {isAdmin && (
                        <button 
                            onClick={() => toggleService(service.id, service.is_active)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${service.is_active ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${service.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    )}
                </div>
            );
        })}
      </div>
    </div>
  );
};
