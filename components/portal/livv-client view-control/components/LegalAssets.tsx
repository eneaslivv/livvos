
import React from 'react';
import { AssetItem } from '../types';
import { motion } from 'framer-motion';
import { FileText, Download, Figma, FolderOpen } from 'lucide-react';

const LegalAssets: React.FC<{ assets?: AssetItem[] }> = ({ assets }) => {
  const items = assets && assets.length
    ? assets
    : [
        { id: '1', name: 'Service Agreement', type: 'PDF', size: '2.4 MB' },
        { id: '2', name: 'Project Design', type: 'Figma', size: 'Link' },
        { id: '3', name: 'Phase I Deliverables', type: 'Drive', size: 'Link' },
      ];

  const getIcon = (type?: string) => {
    if (!type) return <FileText size={15} />;
    const k = type.toLowerCase();
    if (k.includes('figma')) return <Figma size={15} />;
    if (k.includes('drive')) return <FolderOpen size={15} />;
    return <FileText size={15} />;
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 md:p-8 h-full flex flex-col"
    >
      <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-5">Documents</h3>

      <div className="space-y-2 flex-1">
        {items.map((a, i) => (
          <div
            key={a.id || i}
            onClick={() => a.url && window.open(a.url, '_blank')}
            className="flex items-center justify-between p-3 bg-zinc-50/80 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-zinc-200 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg text-zinc-300 dark:text-zinc-600 group-hover:text-indigo-500 transition-colors border border-zinc-100 dark:border-zinc-800">
                {getIcon(a.type)}
              </div>
              <div>
                <p className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-800 dark:group-hover:text-zinc-100 transition-colors">{a.name}</p>
                <p className="text-[10px] text-zinc-300 dark:text-zinc-500 mt-0.5">{a.size} · {a.type}</p>
              </div>
            </div>
            <button className="p-1.5 text-zinc-200 dark:text-zinc-700 group-hover:text-indigo-500 transition-all">
              <Download size={15} />
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default LegalAssets;
