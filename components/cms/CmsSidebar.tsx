import React from 'react';
import {
  ArrowLeft,
  Briefcase,
  Package,
  FileText,
  Image as ImageIcon,
  Code2,
  Rocket,
  Loader2,
} from 'lucide-react';
import type { CmsSection } from '../../types/cms';

interface CmsSidebarProps {
  activeSection: CmsSection;
  onSectionChange: (section: CmsSection) => void;
  onBack: () => void;
  onShowIntegration?: () => void;
  onDeploy?: () => void;
  isDeploying?: boolean;
  hasDeployHook?: boolean;
}

const NAV_ITEMS: { id: CmsSection; label: string; icon: React.ReactNode }[] = [
  { id: 'portfolio', label: 'Portfolio', icon: <Briefcase size={18} /> },
  { id: 'products', label: 'Products', icon: <Package size={18} /> },
  { id: 'blog', label: 'Blog', icon: <FileText size={18} /> },
  { id: 'logos', label: 'Logos', icon: <ImageIcon size={18} /> },
];

export const CmsSidebar: React.FC<CmsSidebarProps> = ({
  activeSection,
  onSectionChange,
  onBack,
  onShowIntegration,
  onDeploy,
  isDeploying,
  hasDeployHook,
}) => {
  return (
    <div className="w-[200px] min-h-screen bg-[#09090B] flex flex-col border-r border-white/5">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-4 py-4 text-white/50 hover:text-white transition-colors border-b border-white/5"
      >
        <ArrowLeft size={16} />
        <span className="text-xs font-medium">Back</span>
      </button>

      {/* Logo / Title */}
      <div className="px-4 py-5 border-b border-white/5">
        <h2 className="text-sm font-semibold text-white tracking-tight">
          Content CMS
        </h2>
        <p className="text-[10px] text-white/30 mt-0.5">Manage your website</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              activeSection === item.id
                ? 'bg-[#E8BC59]/10 text-[#E8BC59]'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Deploy + Integration buttons */}
      <div className="px-2 pb-2 space-y-1">
        {onDeploy && (
          <button
            onClick={hasDeployHook ? onDeploy : undefined}
            disabled={isDeploying || !hasDeployHook}
            title={!hasDeployHook ? 'Set up a Deploy Hook URL in Settings → General to enable deploys' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              hasDeployHook
                ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-50'
                : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            {isDeploying ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Rocket size={18} />
            )}
            <span>{isDeploying ? 'Deploying...' : 'Deploy to Web'}</span>
          </button>
        )}
        {onShowIntegration && (
          <button
            onClick={onShowIntegration}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
          >
            <Code2 size={18} />
            <span className="font-medium">API Integration</span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/5">
        <p className="text-[10px] text-white/20">LIVV CMS</p>
      </div>
    </div>
  );
};
