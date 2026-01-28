
import React from 'react';
import { AssetItem } from '../types';
import { motion } from 'framer-motion';
import { FileText, Download, Figma, Layout } from 'lucide-react';

const LegalAssets: React.FC<{ assets?: AssetItem[] }> = ({ assets }) => {
  const items = assets && assets.length
    ? assets
    : [
        { id: '1', name: 'Master Services Agreement', type: 'PDF', size: '2.4 MB' },
        { id: '2', name: 'Architecture Blueprint', type: 'Figma', size: 'External' },
        { id: '3', name: 'Phase I Deliverables', type: 'Drive', size: 'Cloud' },
      ];

  const getIcon = (type?: string) => {
    if (!type) return <FileText size={16} />;
    const key = type.toLowerCase();
    if (key.includes('figma')) return <Figma size={16} />;
    if (key.includes('drive')) return <Layout size={16} />;
    return <FileText size={16} />;
  };

  return (
    <motion.div 
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
      className="glass-card gradient-border-light p-8 h-full flex flex-col"
    >
      <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.3em] mb-6">Legal & Assets</h3>
      
      <div className="space-y-3">
        {items.map((asset, idx) => (
          <div 
            key={asset.id || idx} 
            onClick={() => asset.url && window.open(asset.url, '_blank')}
            className="flex items-center justify-between p-4 bg-white/40 border border-brand-dark/5 rounded-2xl hover:bg-white hover:shadow-lg hover:shadow-brand-dark/5 hover:border-brand-accent/20 transition-all duration-300 group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-brand-cream/50 rounded-xl text-brand-dark/40 group-hover:text-brand-accent group-hover:bg-brand-accent/5 transition-all duration-300">
                {getIcon(asset.type)}
              </div>
              <div>
                <p className="text-xs font-black text-brand-dark/80 group-hover:text-brand-dark transition-colors">{asset.name}</p>
                <p className="text-[10px] text-brand-dark/30 mono uppercase tracking-widest mt-0.5">{asset.size} • {asset.type}</p>
              </div>
            </div>
            <button className="p-2 text-brand-dark/20 group-hover:text-brand-accent group-hover:scale-125 transition-all duration-300 transform">
              <Download size={18} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <div className="p-4 bg-brand-accent/5 border border-brand-accent/10 rounded-2xl text-center">
          <p className="text-[10px] text-brand-accent uppercase tracking-[0.2em] font-black italic">3 Protocols Pending Download</p>
        </div>
      </div>
    </motion.div>
  );
};

export default LegalAssets;
