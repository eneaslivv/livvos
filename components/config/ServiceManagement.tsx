import React, { useState, useEffect } from 'react';
import { useRBAC } from '../../context/RBACContext';
import { useTenant } from '../../context/TenantContext';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { Service } from '../../types/rbac';

export const ServiceManagement: React.FC = () => {
  const { isAdmin } = useRBAC();
  const { currentTenant } = useTenant();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [pricingForm, setPricingForm] = useState({
    name: '',
    description: '',
    pricing_model: 'fixed',
    hourly_rate: '',
    fixed_price: '',
    estimated_weeks: '4',
    complexity: 'standard',
    tech_stack: '',
    deliverables: '',
    simple_factor: '0.8',
    standard_factor: '1.0',
    advanced_factor: '1.3',
    complex_factor: '1.6'
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchServices();
    fetchPricing();
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

  const fetchPricing = async () => {
    try {
      const { data, error } = await supabase
        .from('service_pricing')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPricing(data || []);
    } catch (error) {
      console.error('Error fetching pricing:', error);
    }
  };


  const resetPricingForm = () => {
    setPricingForm({
      name: '',
      description: '',
      pricing_model: 'fixed',
      hourly_rate: '',
      fixed_price: '',
      estimated_weeks: '4',
      complexity: 'standard',
      tech_stack: '',
      deliverables: '',
      simple_factor: '0.8',
      standard_factor: '1.0',
      advanced_factor: '1.3',
      complex_factor: '1.6'
    });
    setEditingId(null);
  };

  const handleSavePricing = async () => {
    if (!isAdmin || !pricingForm.name.trim()) return;
    if (!currentTenant?.id) {
      alert('Tenant not ready yet. Please retry.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        tenant_id: currentTenant.id,
        name: pricingForm.name.trim(),
        description: pricingForm.description || null,
        pricing_model: pricingForm.pricing_model,
        hourly_rate: pricingForm.hourly_rate ? Number(pricingForm.hourly_rate) : null,
        fixed_price: pricingForm.fixed_price ? Number(pricingForm.fixed_price) : null,
        estimated_weeks: pricingForm.estimated_weeks ? Number(pricingForm.estimated_weeks) : 4,
        complexity: pricingForm.complexity,
        tech_stack: pricingForm.tech_stack ? pricingForm.tech_stack.split(',').map(s => s.trim()).filter(Boolean) : [],
        deliverables: pricingForm.deliverables ? pricingForm.deliverables.split(',').map(s => s.trim()).filter(Boolean) : [],
        simple_factor: Number(pricingForm.simple_factor) || 0.8,
        standard_factor: Number(pricingForm.standard_factor) || 1.0,
        advanced_factor: Number(pricingForm.advanced_factor) || 1.3,
        complex_factor: Number(pricingForm.complex_factor) || 1.6
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('service_pricing')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId)
          .select()
          .single();
        if (error) throw error;
        setPricing(prev => prev.map(item => (item.id === editingId ? data : item)));
      } else {
        const { data, error } = await supabase
          .from('service_pricing')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setPricing(prev => [data, ...prev]);
      }
      resetPricingForm();
    } catch (error) {
      console.error('Error saving pricing:', error);
    } finally {
      setIsSaving(false);
    }
  };


  const handleEditPricing = (item: any) => {
    setEditingId(item.id);
    setPricingForm({
      name: item.name || '',
      description: item.description || '',
      pricing_model: item.pricing_model || 'fixed',
      hourly_rate: item.hourly_rate ? String(item.hourly_rate) : '',
      fixed_price: item.fixed_price ? String(item.fixed_price) : '',
      estimated_weeks: item.estimated_weeks ? String(item.estimated_weeks) : '4',
      complexity: item.complexity || 'standard',
      tech_stack: Array.isArray(item.tech_stack) ? item.tech_stack.join(', ') : '',
      deliverables: Array.isArray(item.deliverables) ? item.deliverables.join(', ') : '',
      simple_factor: item.simple_factor ? String(item.simple_factor) : '0.8',
      standard_factor: item.standard_factor ? String(item.standard_factor) : '1.0',
      advanced_factor: item.advanced_factor ? String(item.advanced_factor) : '1.3',
      complex_factor: item.complex_factor ? String(item.complex_factor) : '1.6'
    });
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

      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">Pricing & Proposals</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Define servicios y precios base para propuestas automáticas.</p>
          </div>
          {isAdmin && (
            <button
              onClick={resetPricingForm}
              className="px-3 py-1.5 text-xs font-semibold border border-zinc-200 dark:border-zinc-700 rounded-lg"
            >
              Nuevo
            </button>
          )}
        </div>

        <div className="grid gap-3 mt-4">
          {pricing.map((item) => (
            <div key={item.id} className="flex items-start justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</div>
                <div className="text-xs text-zinc-500">{item.pricing_model} · {item.estimated_weeks || 4} semanas</div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleEditPricing(item)}
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  Editar
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            value={pricingForm.name}
            onChange={(e) => setPricingForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Nombre del servicio"
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          />
          <input
            value={pricingForm.description}
            onChange={(e) => setPricingForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Descripción corta"
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          />
          <select
            value={pricingForm.pricing_model}
            onChange={(e) => setPricingForm(prev => ({ ...prev, pricing_model: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          >
            <option value="fixed">Precio fijo</option>
            <option value="hourly">Por hora</option>
            <option value="service">Por servicio</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={pricingForm.hourly_rate}
              onChange={(e) => setPricingForm(prev => ({ ...prev, hourly_rate: e.target.value }))}
              placeholder="USD/hora"
              className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
            />
            <input
              value={pricingForm.fixed_price}
              onChange={(e) => setPricingForm(prev => ({ ...prev, fixed_price: e.target.value }))}
              placeholder="Precio fijo"
              className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>
          <input
            value={pricingForm.estimated_weeks}
            onChange={(e) => setPricingForm(prev => ({ ...prev, estimated_weeks: e.target.value }))}
            placeholder="Semanas estimadas"
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          />
          <input
            value={pricingForm.complexity}
            onChange={(e) => setPricingForm(prev => ({ ...prev, complexity: e.target.value }))}
            placeholder="Complejidad (standard, advanced)"
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          />
          <input
            value={pricingForm.tech_stack}
            onChange={(e) => setPricingForm(prev => ({ ...prev, tech_stack: e.target.value }))}
            placeholder="Tech stack (coma separada)"
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          />
          <input
            value={pricingForm.deliverables}
            onChange={(e) => setPricingForm(prev => ({ ...prev, deliverables: e.target.value }))}
            placeholder="Deliverables (coma separada)"
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={pricingForm.simple_factor}
              onChange={(e) => setPricingForm(prev => ({ ...prev, simple_factor: e.target.value }))}
              placeholder="Factor simple"
              className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
            />
            <input
              value={pricingForm.standard_factor}
              onChange={(e) => setPricingForm(prev => ({ ...prev, standard_factor: e.target.value }))}
              placeholder="Factor standard"
              className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={pricingForm.advanced_factor}
              onChange={(e) => setPricingForm(prev => ({ ...prev, advanced_factor: e.target.value }))}
              placeholder="Factor advanced"
              className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
            />
            <input
              value={pricingForm.complex_factor}
              onChange={(e) => setPricingForm(prev => ({ ...prev, complex_factor: e.target.value }))}
              placeholder="Factor complex"
              className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>
        </div>
        {isAdmin && (
          <div className="mt-4">
            <button
              onClick={handleSavePricing}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold"
            >
              {isSaving ? 'Guardando...' : (editingId ? 'Actualizar' : 'Guardar')}
            </button>
          </div>
        )}
      </div>

    </div>
  );
};
