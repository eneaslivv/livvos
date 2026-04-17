import React, { useMemo } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowLeftIcon, ArrowRightIcon, Monitor } from 'lucide-react';
import type {
  CmsPortfolioItem,
  ContentBlock,
  HeroImageBlock,
  ChallengeBlock,
  ImageShowcaseBlock,
  DesignSystemBlock,
  BannerBlock,
  TextBlock,
  HeadingBlock,
  QuoteBlock,
} from '../../types/cms';

/* ────────────────────────────────────────────
   Props
   ──────────────────────────────────────────── */

interface PortfolioRendererProps {
  item: CmsPortfolioItem;
  onBack?: () => void;
}

/* ────────────────────────────────────────────
   Main component
   ──────────────────────────────────────────── */

export const PortfolioRenderer: React.FC<PortfolioRendererProps> = ({ item, onBack }) => {
  const sortedBlocks = useMemo(
    () => [...(item.content_blocks || [])].sort((a, b) => a.sort_order - b.sort_order),
    [item.content_blocks],
  );

  return (
    <div className="min-h-screen bg-white text-neutral-900 selection:bg-neutral-200" style={{ fontFamily: "'Inter', sans-serif", WebkitFontSmoothing: 'antialiased' }}>
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="fixed top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur border border-neutral-200 rounded-full text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-all shadow-sm"
        >
          <ArrowLeft size={14} /> Volver al editor
        </button>
      )}

      <main className="max-w-6xl mx-auto px-6 py-12 md:py-20">
        {/* Header */}
        <HeaderRenderer item={item} />

        {/* Blocks */}
        {sortedBlocks.map((block, i) => (
          <BlockDispatcher key={i} block={block} item={item} />
        ))}

        {/* Footer */}
        <FooterRenderer item={item} />
      </main>
    </div>
  );
};

/* ────────────────────────────────────────────
   Block dispatcher
   ──────────────────────────────────────────── */

const BlockDispatcher: React.FC<{ block: ContentBlock; item: CmsPortfolioItem }> = ({ block, item }) => {
  switch (block.type) {
    case 'hero_image':      return <HeroImageRenderer block={block} color={item.color} />;
    case 'challenge':       return <ChallengeRenderer block={block} />;
    case 'image_showcase':  return <ImageShowcaseRenderer block={block} />;
    case 'design_system':   return <DesignSystemRenderer block={block} />;
    case 'banner':          return <BannerRenderer block={block} />;
    case 'text':            return <TextRenderer block={block} />;
    case 'heading':         return <HeadingRenderer block={block} />;
    case 'quote':           return <QuoteRenderer block={block} />;
    default:                return null;
  }
};

/* ────────────────────────────────────────────
   Header — pills + title + subtitle
   ──────────────────────────────────────────── */

const HeaderRenderer: React.FC<{ item: CmsPortfolioItem }> = ({ item }) => {
  const pills: string[] = [];
  if (item.category) pills.push(item.category);
  if (item.year) pills.push(item.year);
  if (item.services) item.services.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => pills.push(s));

  return (
    <header className="flex flex-col items-center text-center mb-16">
      {pills.length > 0 && (
        <div className="flex items-center gap-2 mb-8 flex-wrap justify-center">
          {pills.map((p, i) => (
            <span key={i} className="px-3 py-1 border border-neutral-200 rounded-full text-xs uppercase tracking-wide text-neutral-500 font-medium bg-neutral-50/50">
              {p}
            </span>
          ))}
        </div>
      )}

      <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter mb-6 text-neutral-900">
        {item.title}
      </h1>

      {item.subtitle && (
        <p className="text-lg md:text-xl text-neutral-500 max-w-2xl leading-relaxed">
          {item.subtitle}
        </p>
      )}
    </header>
  );
};

/* ────────────────────────────────────────────
   Hero Image — browser mockup over colored bg
   ──────────────────────────────────────────── */

const HeroImageRenderer: React.FC<{ block: HeroImageBlock; color?: string | null }> = ({ block, color }) => {
  const bgColor = color || '#7D5A5A';

  return (
    <div className="relative w-full rounded-2xl overflow-hidden mb-24 md:mb-32">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        {block.image_url ? (
          <img src={block.image_url} alt={block.alt || ''} className="w-full h-full object-cover opacity-90 brightness-75" />
        ) : (
          <div className="w-full h-full" style={{ backgroundColor: bgColor }} />
        )}
      </div>

      {/* Browser mockup */}
      <div className="relative z-10 pt-12 md:pt-20 px-4 md:px-12 pb-0">
        <div className="bg-white rounded-t-xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="h-10 bg-white border-b border-neutral-100 flex items-center px-4 gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-200" />
          </div>
          {block.image_url ? (
            <img src={block.image_url} alt={block.alt || ''} className="w-full aspect-video object-cover" />
          ) : (
            <div className="aspect-video w-full" style={{ backgroundColor: bgColor }} />
          )}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────
   Challenge — 8/4 grid
   ──────────────────────────────────────────── */

const ChallengeRenderer: React.FC<{ block: ChallengeBlock }> = ({ block }) => (
  <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-16 mb-24 md:mb-32">
    <div className="md:col-span-8">
      <span className="text-xs font-medium text-neutral-400 uppercase tracking-widest mb-4 block">{block.label}</span>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-8 leading-tight">
        {block.heading}
      </h2>
      <div className="space-y-6 text-lg text-neutral-500 leading-relaxed">
        {block.paragraphs.map((p, i) => (
          <p key={i} dangerouslySetInnerHTML={{ __html: p }} />
        ))}
      </div>
    </div>

    <div className="md:col-span-4 space-y-12">
      {block.tools.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-widest mb-4">Tools Used</h3>
          <div className="flex flex-wrap gap-2">
            {block.tools.map((t, i) => (
              <span key={i} className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded text-xs font-medium text-neutral-600">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {block.kpis.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-widest mb-4">KPI Summary</h3>
          <ul className="space-y-3">
            {block.kpis.map((kpi, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-neutral-600">
                <ArrowUpRight className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
                {kpi.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </div>
);

/* ────────────────────────────────────────────
   Image Showcase — wireframe / side-by-side / single
   ──────────────────────────────────────────── */

const ImageShowcaseRenderer: React.FC<{ block: ImageShowcaseBlock }> = ({ block }) => {
  if (block.layout === 'wireframe') {
    return (
      <div className="mb-24 md:mb-32">
        {block.label && <p className="text-xs text-neutral-400 mb-4 ml-1">{block.label}</p>}
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 md:p-12">
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4 aspect-[16/9] flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-300" />
              <div className="w-2 h-2 rounded-full bg-yellow-300" />
              <div className="w-2 h-2 rounded-full bg-green-300" />
            </div>
            {block.images.length > 0 ? (
              <img src={block.images[0].url} alt={block.images[0].alt || ''} className="flex-1 w-full object-contain rounded" />
            ) : (
              <div className="flex-1 flex gap-4">
                <div className="w-1/4 bg-neutral-50 rounded h-full" />
                <div className="flex-1 flex flex-col gap-4">
                  <div className="h-1/3 w-full bg-neutral-50 rounded" />
                  <div className="h-2/3 w-full bg-neutral-50 rounded flex items-center justify-center relative">
                    <Monitor className="w-8 h-8 text-neutral-300" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (block.layout === 'side_by_side') {
    return (
      <div className="mb-24 md:mb-32">
        {block.label && (
          <div className="flex justify-between items-end mb-6">
            <h3 className="text-sm font-medium text-neutral-900">{block.label}</h3>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {block.images.map((img, i) => {
            const isDark = img.theme === 'dark';
            return (
              <div
                key={i}
                className={`rounded-xl border p-12 flex justify-center items-center h-[500px] ${
                  isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-100'
                }`}
              >
                <div
                  className={`w-[200px] h-[380px] rounded-[2rem] border-4 relative overflow-hidden flex flex-col ${
                    isDark ? 'bg-neutral-800/50 border-neutral-800 shadow-2xl' : 'bg-white border-white shadow-xl'
                  }`}
                >
                  {/* Notch */}
                  <div className="h-6 w-full flex justify-center items-center">
                    <div className={`w-16 h-4 rounded-b-xl ${isDark ? 'bg-neutral-800' : 'bg-neutral-100'}`} />
                  </div>
                  {/* Image */}
                  {img.url ? (
                    <img src={img.url} alt={img.alt || ''} className="flex-1 w-full object-cover" />
                  ) : (
                    <div className={`p-4 space-y-3 flex-1 ${isDark ? '' : ''}`}>
                      {isDark ? (
                        <>
                          <div className="flex gap-2">
                            <div className="w-8 h-8 bg-neutral-700/50 rounded-lg" />
                            <div className="flex-1 h-8 bg-neutral-700/50 rounded-lg" />
                          </div>
                          <div className="h-24 w-full bg-neutral-700/30 rounded-xl mt-6 border border-white/5" />
                          <div className="h-24 w-full bg-neutral-700/30 rounded-xl border border-white/5" />
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-neutral-50 rounded-full mb-4" />
                          <div className="h-2 w-20 bg-neutral-100 rounded" />
                          <div className="h-2 w-32 bg-neutral-50 rounded" />
                          <div className="h-24 w-full bg-neutral-50 rounded-xl mt-6" />
                          <div className="h-24 w-full bg-neutral-50 rounded-xl" />
                        </>
                      )}
                    </div>
                  )}
                  {/* Bottom */}
                  <div className="p-4 pt-0">
                    {isDark ? (
                      <div className="flex justify-center">
                        <div className="w-1/3 h-1 bg-white/20 rounded-full" />
                      </div>
                    ) : (
                      <div className="h-10 w-full bg-neutral-900 rounded-lg shadow-lg" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Captions */}
        {block.images.some((img) => img.caption) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            {block.images.map((img, i) => (
              <div key={i}>
                {img.caption && (
                  <>
                    <h4 className="text-sm font-medium text-neutral-900">{img.caption}</h4>
                    {img.alt && <p className="text-xs text-neutral-500 mt-1">{img.alt}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // single layout
  return (
    <div className="mb-24 md:mb-32">
      {block.label && <p className="text-xs text-neutral-400 mb-4 ml-1">{block.label}</p>}
      {block.images.map((img, i) => (
        <div key={i} className="rounded-xl overflow-hidden">
          <img src={img.url} alt={img.alt || ''} className="w-full object-cover rounded-xl" />
          {img.caption && <p className="text-xs text-neutral-500 mt-3">{img.caption}</p>}
        </div>
      ))}
    </div>
  );
};

/* ────────────────────────────────────────────
   Design System — 5/7 grid
   ──────────────────────────────────────────── */

const DesignSystemRenderer: React.FC<{ block: DesignSystemBlock }> = ({ block }) => {
  const typefaceName = block.typeface?.name || 'Inter Display';
  const sources = block.typeface?.sources || [];
  const fontStack = sources.length > 0
    ? `"${typefaceName}", system-ui, sans-serif`
    : undefined;
  const fontFaceCss = sources
    .map((s) => {
      const format = s.format || 'woff2';
      const style = s.style || 'normal';
      const weight = s.weight || '400';
      return `@font-face{font-family:"${typefaceName}";src:url("${s.url}") format("${format}");font-weight:${weight};font-style:${style};font-display:swap;}`;
    })
    .join('\n');
  const assets = block.assets || [];

  return (
  <div className="mb-24 md:mb-32">
    {fontFaceCss && <style dangerouslySetInnerHTML={{ __html: fontFaceCss }} />}
    {/* Header */}
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
      <div className="max-w-xl">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3 block">{block.label}</span>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tighter text-neutral-900 mb-4">{block.heading}</h2>
        {block.description && (
          <p className="text-base md:text-lg text-neutral-500 leading-relaxed">{block.description}</p>
        )}
      </div>
    </div>

    {/* Grid */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left — Typeface */}
      <div className="lg:col-span-5 bg-white rounded-3xl border border-neutral-100 p-8 flex flex-col justify-between relative overflow-hidden shadow-[0_2px_20px_rgba(0,0,0,0.02)]" style={{ minHeight: 420 }}>
        <div>
          <div className="flex justify-between items-start mb-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 font-medium">Typeface</span>
          </div>
          <h3 className="text-sm font-medium text-neutral-900 mb-16" style={fontStack ? { fontFamily: fontStack } : undefined}>{typefaceName}</h3>
          <div className="text-8xl md:text-9xl font-medium tracking-tighter text-neutral-900 mb-8 leading-none" style={fontStack ? { fontFamily: fontStack } : undefined}>Aa</div>
          <p className="text-2xl md:text-3xl tracking-tight text-neutral-400 leading-tight font-light" style={fontStack ? { fontFamily: fontStack } : undefined}>
            The quick brown fox jumps over the lazy dog.
          </p>
        </div>

        {(block.typeface?.weights?.length ?? 0) > 0 && (
          <div className="grid grid-cols-3 gap-4 pt-12 mt-auto relative z-10">
            {block.typeface!.weights.map((w, i) => (
              <div key={i}>
                <div className="font-mono text-[10px] text-neutral-400 mb-1">{w.value}</div>
                <div
                  className="text-xs font-medium text-neutral-900"
                  style={fontStack ? { fontFamily: fontStack, fontWeight: Number(w.value) || undefined } : undefined}
                >
                  {w.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Decorative watermark */}
        <div className="absolute -bottom-10 -right-8 text-[240px] font-bold text-neutral-50 select-none pointer-events-none z-0 opacity-60" style={fontStack ? { fontFamily: fontStack } : undefined}>g</div>
      </div>

      {/* Right */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* Colors */}
        {block.colors.length > 0 && (
          <div className="bg-white rounded-3xl border border-neutral-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-start mb-8">
              <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 font-medium">Color Variables</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {block.colors.map((c, i) => (
                <div key={i} className="group cursor-default">
                  <div
                    className="aspect-[4/3] w-full rounded-xl mb-4 shadow-sm border border-neutral-100 group-hover:scale-[1.02] transition-transform duration-300"
                    style={{ backgroundColor: c.hex }}
                  />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-neutral-900">{c.name}</p>
                    <p className="font-mono text-[10px] text-neutral-400">{c.hex}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom split: Spacing + Components */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 flex-1">
          {/* Spacing */}
          {(block.spacing?.sizes?.length ?? 0) > 0 ? (
            <div className="bg-white rounded-3xl border border-neutral-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div className="flex justify-between items-start mb-6">
                <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 font-medium">Spacing</span>
              </div>
              <div className="flex-1 flex flex-col justify-center items-start gap-3 mb-6">
                {block.spacing!.sizes.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="bg-red-50 border border-red-100 rounded flex items-center justify-center text-[10px] font-mono text-red-300"
                      style={{ width: Math.min(s.px * 4, 128), height: 32 }}
                    >
                      {s.px}px
                    </div>
                    <span className="font-mono text-[10px] text-neutral-300">{s.rem}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs font-medium text-neutral-900">8pt Grid System</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-neutral-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div className="flex justify-between items-start mb-6">
                <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 font-medium">Spacing</span>
              </div>
              <div className="flex-1 flex flex-col justify-center items-start gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-red-50 border border-red-100 rounded flex items-center justify-center text-[8px] font-mono text-red-300">4</div>
                  <span className="font-mono text-[10px] text-neutral-300">0.25rem</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-red-50 border border-red-100 rounded flex items-center justify-center text-[10px] font-mono text-red-300">8</div>
                  <span className="font-mono text-[10px] text-neutral-300">0.5rem</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-8 bg-red-50 border border-red-100 rounded flex items-center justify-center text-[10px] font-mono text-red-300">16px</div>
                  <span className="font-mono text-[10px] text-neutral-300">1rem</span>
                </div>
              </div>
              <p className="text-xs font-medium text-neutral-900">8pt Grid System</p>
            </div>
          )}

          {/* Components (dark card) */}
          <div className="bg-[#18181B] rounded-3xl border border-neutral-800 p-8 shadow-xl flex flex-col justify-between">
            <div className="flex justify-between items-start mb-6">
              <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 font-medium">Components</span>
              <div className="flex gap-1">
                <div className="w-1 h-1 rounded-full bg-neutral-600" />
                <div className="w-1 h-1 rounded-full bg-neutral-600" />
              </div>
            </div>

            <div className="space-y-5 flex-1 flex flex-col justify-center">
              {/* Buttons */}
              {(block.components?.buttons || [{ label: 'Action', variant: 'primary' as const }]).map((btn, i) => (
                <div key={i}>
                  <p className="font-mono text-[10px] text-neutral-600 mb-2">
                    Btn.{btn.variant ? btn.variant.charAt(0).toUpperCase() + btn.variant.slice(1) : 'Primary'}
                  </p>
                  {btn.variant === 'outline' ? (
                    <button className="w-full border border-neutral-600 text-neutral-300 text-xs font-medium py-2.5 rounded-lg hover:border-neutral-500 transition">
                      {btn.label}
                    </button>
                  ) : btn.variant === 'secondary' ? (
                    <button className="w-full bg-neutral-700 text-neutral-200 text-xs font-medium py-2.5 rounded-lg hover:bg-neutral-600 transition">
                      {btn.label}
                    </button>
                  ) : (
                    <button className="w-full bg-white text-neutral-900 text-xs font-medium py-2.5 rounded-lg shadow-lg hover:bg-neutral-100 transition">
                      {btn.label}
                    </button>
                  )}
                </div>
              ))}

              {/* Inputs */}
              {(block.components?.inputs || [{ placeholder: 'Type...' }]).map((inp, i) => (
                <div key={i}>
                  <p className="font-mono text-[10px] text-neutral-600 mb-2">Input.Default</p>
                  <div className="w-full bg-[#27272A] border border-neutral-800 rounded-lg px-3 py-2.5 text-xs text-neutral-500 flex items-center">
                    {inp.placeholder}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Assets grid */}
    {assets.length > 0 && (
      <div className="mt-6 bg-white rounded-3xl border border-neutral-100 p-8 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
        <div className="flex justify-between items-start mb-8">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 font-medium">Assets</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {assets.map((a, i) => (
            <div key={i} className="group cursor-default">
              <div className="aspect-square w-full rounded-xl mb-3 bg-neutral-50 border border-neutral-100 flex items-center justify-center overflow-hidden group-hover:scale-[1.02] transition-transform duration-300">
                <img src={a.url} alt={a.name} className="max-w-[70%] max-h-[70%] object-contain" />
              </div>
              <p className="text-xs font-medium text-neutral-900 truncate">{a.name}</p>
              {a.kind && (
                <p className="font-mono text-[10px] text-neutral-400 uppercase tracking-wider">{a.kind}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
  );
};

/* ────────────────────────────────────────────
   Banner — dark rounded section
   ──────────────────────────────────────────── */

const BannerRenderer: React.FC<{ block: BannerBlock }> = ({ block }) => {
  const bgColor = block.background_color || '#2a090b';

  return (
    <div className="relative w-full rounded-[2.5rem] overflow-hidden mb-12 h-72 md:h-80 shadow-2xl" style={{ backgroundColor: bgColor }}>
      {/* Gradient overlay */}
      <div className="absolute inset-0 opacity-100" style={{
        background: `linear-gradient(to right, ${adjustColor(bgColor, -20)}, ${adjustColor(bgColor, 20)}, ${adjustColor(bgColor, -20)})`,
      }} />

      {/* Content */}
      <div className="relative z-10 h-full p-8 md:p-14 flex flex-col justify-between">
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight text-white max-w-lg">
          {formatBannerHeading(block.heading)}
        </h2>

        {/* Controls */}
        <div className="absolute bottom-10 right-10 flex flex-col items-end gap-4">
          <div className="flex gap-3">
            <button className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition-all">
              <ArrowLeftIcon className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition-all">
              <ArrowRightIcon className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex gap-1.5 mr-1">
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────
   Simple text blocks
   ──────────────────────────────────────────── */

const TextRenderer: React.FC<{ block: TextBlock }> = ({ block }) => (
  <div className="max-w-3xl mx-auto mb-12">
    <div className="text-lg text-neutral-500 leading-relaxed prose prose-neutral" dangerouslySetInnerHTML={{ __html: block.content }} />
  </div>
);

const HeadingRenderer: React.FC<{ block: HeadingBlock }> = ({ block }) => (
  <div className="mb-8">
    <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">{block.content}</h2>
  </div>
);

const QuoteRenderer: React.FC<{ block: QuoteBlock }> = ({ block }) => (
  <div className="max-w-3xl mx-auto mb-12">
    <blockquote className="border-l-4 border-neutral-300 pl-6">
      <div className="italic text-lg text-neutral-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: block.content }} />
    </blockquote>
  </div>
);

/* ────────────────────────────────────────────
   Footer
   ──────────────────────────────────────────── */

const FooterRenderer: React.FC<{ item: CmsPortfolioItem }> = ({ item }) => (
  <footer className="flex justify-between items-center text-[10px] uppercase text-neutral-400 tracking-widest pb-12 pt-8 border-t border-neutral-100 mt-12">
    <span>© {item.year || new Date().getFullYear()}</span>
    <div className="flex gap-6">
      {item.tech_tags?.slice(0, 3).map((tag, i) => (
        <span key={i} className="hover:text-neutral-900 transition cursor-default">{tag}</span>
      ))}
    </div>
  </footer>
);

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

/** Darken/lighten a hex color by amount (-255 to 255) */
function adjustColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Split banner heading: first sentence normal, rest dimmed */
function formatBannerHeading(heading: string): React.ReactNode {
  const parts = heading.split(/(?<=\S)\s*\|\s*/);
  if (parts.length < 2) return heading;
  return (
    <>
      {parts[0]} <span className="text-white/25">{parts.slice(1).join(' ')}</span>
    </>
  );
}
