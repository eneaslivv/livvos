import React, { useState } from 'react';
import { useRBAC } from '../context/RBACContext';
import { useTenant } from '../context/TenantContext';
import { useCmsContent } from '../hooks/useCmsContent';
import { CmsSidebar } from '../components/cms/CmsSidebar';
import { PortfolioEditor } from '../components/cms/PortfolioEditor';
import { ProductEditor } from '../components/cms/ProductEditor';
import { BlogEditor } from '../components/cms/BlogEditor';
import { ClientLogosEditor } from '../components/cms/ClientLogosEditor';
import { LivePreview } from '../components/cms/LivePreview';
import { CmsToastContainer, useToasts } from '../components/cms/CmsToast';
import type { PageView } from '../types';
import type { CmsSection } from '../types/cms';

interface ContentCmsProps {
  onNavigate: (page: PageView) => void;
}

export const ContentCms: React.FC<ContentCmsProps> = ({ onNavigate }) => {
  const { isAdmin } = useRBAC();
  const { currentTenant } = useTenant();
  const [activeSection, setActiveSection] = useState<CmsSection>('portfolio');
  const [previewKey, setPreviewKey] = useState(0);
  const { toasts, addToast, dismissToast } = useToasts();

  const cms = useCmsContent();

  const refreshPreview = () => setPreviewKey((k) => k + 1);

  // Wrap save functions to refresh preview + show toast
  const wrappedSavePortfolio: typeof cms.savePortfolio = async (data, id) => {
    const result = await cms.savePortfolio(data, id);
    if (result) {
      refreshPreview();
      addToast(id ? 'Project updated' : 'Project created', 'success');
    } else {
      addToast('Failed to save project', 'error');
    }
    return result;
  };
  const wrappedSaveProduct: typeof cms.saveProduct = async (data, id) => {
    const result = await cms.saveProduct(data, id);
    if (result) {
      refreshPreview();
      addToast(id ? 'Product updated' : 'Product created', 'success');
    } else {
      addToast('Failed to save product', 'error');
    }
    return result;
  };
  const wrappedSavePost: typeof cms.savePost = async (data, id) => {
    const result = await cms.savePost(data, id);
    if (result) {
      refreshPreview();
      addToast(id ? 'Post updated' : 'Post created', 'success');
    } else {
      addToast('Failed to save post', 'error');
    }
    return result;
  };
  const wrappedSaveLogo: typeof cms.saveLogo = async (data, id) => {
    const result = await cms.saveLogo(data, id);
    if (result) {
      refreshPreview();
      addToast(id ? 'Logo updated' : 'Logo added', 'success');
    } else {
      addToast('Failed to save logo', 'error');
    }
    return result;
  };

  const wrappedDeletePortfolio = async (id: string) => {
    await cms.deletePortfolio(id);
    addToast('Project deleted', 'success');
    refreshPreview();
  };
  const wrappedDeleteProduct = async (id: string) => {
    await cms.deleteProduct(id);
    addToast('Product deleted', 'success');
    refreshPreview();
  };
  const wrappedDeletePost = async (id: string) => {
    await cms.deletePost(id);
    addToast('Post deleted', 'success');
    refreshPreview();
  };
  const wrappedDeleteLogo = async (id: string) => {
    await cms.deleteLogo(id);
    addToast('Logo deleted', 'success');
    refreshPreview();
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FDFBF7]">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#E6E2D8] flex items-center justify-center">
            <span className="text-lg">🔒</span>
          </div>
          <h2 className="text-sm font-semibold text-[#09090B]">Admin access required</h2>
          <p className="text-xs text-[#09090B]/40 mt-1">
            Only admins can manage website content.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#FDFBF7]">
      {/* Sidebar */}
      <CmsSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onBack={() => onNavigate('home')}
      />

      {/* Main content area */}
      <div className="flex-1 flex min-w-0">
        {/* Editor panel */}
        <div className="flex-1 min-w-0 border-r border-[#E6E2D8] overflow-hidden">
          {cms.isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-[#E8BC59] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {activeSection === 'portfolio' && (
                <PortfolioEditor
                  items={cms.portfolio}
                  isSaving={cms.isSaving}
                  onSave={wrappedSavePortfolio}
                  onDelete={wrappedDeletePortfolio}
                  onUpload={(file) => cms.uploadImage(file, 'portfolio')}
                  detectMediaType={cms.detectMediaType}
                />
              )}
              {activeSection === 'products' && (
                <ProductEditor
                  items={cms.products}
                  portfolioItems={cms.portfolio}
                  isSaving={cms.isSaving}
                  onSave={wrappedSaveProduct}
                  onDelete={wrappedDeleteProduct}
                  onUpload={(file) => cms.uploadImage(file, 'products')}
                />
              )}
              {activeSection === 'blog' && (
                <BlogEditor
                  items={cms.posts}
                  isSaving={cms.isSaving}
                  onSave={wrappedSavePost}
                  onDelete={wrappedDeletePost}
                  onUpload={(file) => cms.uploadImage(file, 'blog')}
                />
              )}
              {activeSection === 'logos' && (
                <ClientLogosEditor
                  items={cms.clientLogos}
                  isSaving={cms.isSaving}
                  onSave={wrappedSaveLogo}
                  onDelete={wrappedDeleteLogo}
                  onUpload={(file) => cms.uploadImage(file, 'logos')}
                />
              )}
            </>
          )}
        </div>

        {/* Live preview panel */}
        <div className="w-[420px] shrink-0 p-3 hidden xl:block">
          <LivePreview
            websiteUrl={currentTenant?.website_url}
            section={activeSection}
            refreshKey={previewKey}
          />
        </div>
      </div>

      {/* Toast notifications */}
      <CmsToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
