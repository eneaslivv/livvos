// LIVV OS — App shell
const { useState: useAppS, useEffect: useAppE } = React;

const App = () => {
  const [module, setModule] = useAppS('growth');
  const [tabs, setTabs] = useAppS({
    growth:   'pulse',
    strategy: 'icps',
    content:  'calendar',
    scaling:  'team',
    agent:    'ask',
    toolkit:  'automations',
  });
  const tab = tabs[module];
  const setTab = (t) => setTabs(prev => ({ ...prev, [module]: t }));

  // Onboarding: track which tab combos have been "set up". Default to none so
  // users land on the coach the first time they open any major tab.
  const [completed, setCompleted] = useAppS({});
  const isCoach = !completed[`${module}:${tab}`] && !!FLOWS[`${module}:${tab}`];
  const completeFlow = () => setCompleted(p => ({ ...p, [`${module}:${tab}`]: true }));
  const restartFlow = () => setCompleted(p => ({ ...p, [`${module}:${tab}`]: false }));

  const [openLead, setOpenLead]   = useAppS(null);
  const [openICP, setOpenICP]     = useAppS(null);
  const [openBrand, setOpenBrand] = useAppS(null);
  const [openPartner, setOpenPartner] = useAppS(null);
  const [openProduct, setOpenProduct] = useAppS(null);

  // Cmd+K (visual only; just for the chrome)
  useAppE(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="os">
      <Sidebar active={module} setActive={setModule}/>
      <div className="main">
        <Topbar
          activeModule={module} activeTab={tab}
          isCoach={isCoach} onRestartFlow={restartFlow}
          hasFlow={!!FLOWS[`${module}:${tab}`]}
        />
        <div className="scroll">
          <PageBody
            module={module} tab={tab} setTab={setTab}
            isCoach={isCoach} completeFlow={completeFlow}
            openLead={openLead} setOpenLead={setOpenLead}
            openICP={openICP} setOpenICP={setOpenICP}
            openBrand={openBrand} setOpenBrand={setOpenBrand}
            openPartner={openPartner} setOpenPartner={setOpenPartner}
            openProduct={openProduct} setOpenProduct={setOpenProduct}
          />
        </div>
      </div>

      {openLead && <LeadDetail lead={openLead} onClose={() => setOpenLead(null)}/>}
      {openICP && <ICPDetail icp={openICP} onClose={() => setOpenICP(null)}/>}
      {openBrand && <BrandDetail brand={openBrand} onClose={() => setOpenBrand(null)}/>}
      {openPartner && <PartnerDetail partner={openPartner} onClose={() => setOpenPartner(null)}/>}
      {openProduct && <ProductDetail product={openProduct} onClose={() => setOpenProduct(null)}/>}
    </div>
  );
};

const PageBody = ({ module, tab, setTab, isCoach, completeFlow, openLead, setOpenLead, openICP, setOpenICP, openBrand, setOpenBrand, openPartner, setOpenPartner, openProduct, setOpenProduct }) => {
  const mod = MODULES.find(m => m.id === module);
  const tabItems = TABS[module];

  // wide layout for kanban tabs + studio
  const wide = (module === 'growth' && tab === 'sales') ||
               (module === 'content' && tab === 'pipeline') ||
               (module === 'content' && tab === 'studio');

  return (
    <div className={`page ${wide ? 'wide' : ''}`}>
      <div className="ph">
        <div className="ph-l">
          <div className="ph-eyebrow">© {mod.label} module</div>
          <h1>{isCoach ? HEADERS[module][tab].onboardTitle || HEADERS[module][tab].title : HEADERS[module][tab].title}</h1>
          <div className="ph-sub">{isCoach ? HEADERS[module][tab].onboardSub || HEADERS[module][tab].sub : HEADERS[module][tab].sub}</div>
        </div>
        <div className="ph-r"/>
      </div>

      <Tabs items={tabItems} active={tab} setActive={setTab}/>

      {/* Onboarding flow — replaces tab content until completed */}
      {isCoach && <CoachFlow module={module} tab={tab} onComplete={completeFlow}/>}

      {!isCoach && (
        <>
          {/* GROWTH */}
          {module === 'growth' && tab === 'pulse' && <GrowthPulse/>}
          {module === 'growth' && tab === 'sales' && <SalesTab onOpenLead={setOpenLead} selectedId={openLead?.id}/>}
          {module === 'growth' && tab === 'partners' && <GrowthPartners onOpenPartner={setOpenPartner}/>}

          {/* STRATEGY */}
          {module === 'strategy' && tab === 'icps' && <StrategyIcps onOpenICP={setOpenICP}/>}
          {module === 'strategy' && tab === 'packages' && <StrategyPackages/>}
          {module === 'strategy' && tab === 'products' && <StrategyProducts onOpenProduct={setOpenProduct}/>}
          {module === 'strategy' && tab === 'positioning' && <StrategyPositioning/>}

          {/* CONTENT */}
          {module === 'content' && tab === 'calendar' && <ContentCalendar/>}
          {module === 'content' && tab === 'pipeline' && <ContentPipeline/>}
          {module === 'content' && tab === 'library' && <ContentLibrary/>}
          {module === 'content' && tab === 'brands' && <ContentBrands onOpenBrand={(b) => setOpenBrand(b || BRANDS[0])}/>}
          {module === 'content' && tab === 'studio' && <ContentStudio/>}

          {/* SCALING */}
          {module === 'scaling' && tab === 'team' && <ScalingTeam/>}
          {module === 'scaling' && tab === 'plan' && <ScalingPlan/>}

          {/* AGENT */}
          {module === 'agent' && tab === 'ask' && <AgentAsk/>}
          {module === 'agent' && tab === 'reports' && <AgentReports/>}
          {module === 'agent' && tab === 'workflows' && <AgentWorkflows/>}

          {/* TOOLKIT */}
          {module === 'toolkit' && tab === 'frameworks' && <ToolkitFrameworks/>}
          {module === 'toolkit' && tab === 'automations' && <ToolkitAutomations/>}
          {module === 'toolkit' && tab === 'ai' && <ToolkitAI/>}
          {module === 'toolkit' && tab === 'connections' && <><ToolkitConnections/><AIVisionSection/></>}
          {module === 'toolkit' && tab === 'settings' && <ToolkitSettings/>}
        </>
      )}
    </div>
  );
};

// Headers per module/tab
const HEADERS = {
  growth: {
    pulse: {
      title: 'Pulse',
      sub: <><strong>$58.4K</strong> MRR<span className="dot-sep">·</span><strong>$890K</strong> pipeline<span className="dot-sep">·</span>Phase 03 · 64%</>,
      onboardTitle: 'Set up your dashboard',
      onboardSub: <>4 steps · ~3 min · pick the numbers you want LIVV to grade your week on</>,
    },
    sales: {
      title: 'Pipeline',
      sub: <><strong>33</strong> open deals<span className="dot-sep">·</span><strong>$890K</strong> pipeline value<span className="dot-sep">·</span><strong>5</strong> closing this week</>,
      onboardTitle: 'Start your sales pipeline',
      onboardSub: <>4 steps · ~4 min · stages → owner → first lead → next action</>,
    },
    partners: {
      title: 'Partner program',
      sub: <><strong>{PARTNERS.length}</strong> partners<span className="dot-sep">·</span><strong>69</strong> leads referred<span className="dot-sep">·</span>$17.4K pending payouts</>,
      onboardTitle: 'Launch your partner program',
      onboardSub: <>4 steps · ~4 min · invite → type → code → first widget</>,
    },
  },
  strategy: {
    icps: {
      title: 'ICPs',
      sub: <><strong>5</strong> defined<span className="dot-sep">·</span><strong>40</strong> leads in motion<span className="dot-sep">·</span><strong>21</strong> active clients</>,
      onboardTitle: 'Define your first ICP',
      onboardSub: <>5 steps · ~5 min · who you sell to is the seed for everything downstream</>,
    },
    packages:    { title: 'Service packages',     sub: <><strong>8</strong> packages<span className="dot-sep">·</span>across <strong>5</strong> ICPs</> },
    products:    { title: 'Products', sub: <><strong>{PRODUCTS.length}</strong> productized<span className="dot-sep">·</span>${(PRODUCTS.reduce((s,p)=>s+p.revenue,0)/1000).toFixed(1)}K earned<span className="dot-sep">·</span>{PRODUCTS.reduce((s,p)=>s+p.units,0)} units sold</> },
    positioning: { title: 'Positioning',          sub: <>The library of principles your AI references across every module</> },
  },
  content: {
    calendar: {
      title: 'Content calendar',
      sub: <><strong>Week 21</strong><span className="dot-sep">·</span>3 / 5 published<span className="dot-sep">·</span>2 scheduled<span className="dot-sep">·</span>4 in draft</>,
      onboardTitle: 'Build your content engine',
      onboardSub: <>3 steps · ~3 min · channels → cadence → first piece</>,
    },
    pipeline:    { title: 'Content pipeline',     sub: <><strong>22</strong> in motion<span className="dot-sep">·</span>5 to review</> },
    library: {
      title: 'Library',
      sub: <><strong>14</strong> templates<span className="dot-sep">·</span>performance across 4 channels</>,
    },
    brands:      { title: 'Brand Studio',         sub: <><strong>4</strong> brand kits<span className="dot-sep">·</span>3 active<span className="dot-sep">·</span>120 assets total</>,
      onboardTitle: 'Configure your first brand kit',
      onboardSub: <>4 steps · ~5 min · identity → type → voice → forbidden</>,
    },
    studio:      { title: 'Generation Studio',    sub: <>Brand-aware content + ads · powered by your trained Brand Prompts</> },
  },
  scaling: {
    team: {
      title: 'Team',
      sub: <><strong>9 people</strong><span className="dot-sep">·</span>$24.6K / mo<span className="dot-sep">·</span><strong>5 / 6</strong> KPIs on track</>,
      onboardTitle: 'Map your team',
      onboardSub: <>3 steps · ~3 min · you → next hires → first KPI</>,
    },
    plan: {
      title: 'Plan',
      sub: <>Org cluster · Hiring roadmap · Cost projection</>,
      onboardTitle: 'Define your first role',
      onboardSub: <>4 steps · ~4 min · title → rationale → tasks → KPI + cost</>,
    },
  },
  agent: {
    ask: {
      title: 'Agent',
      sub: <>Connected to <strong>6 modules</strong><span className="dot-sep">·</span>184K tokens left<span className="dot-sep">·</span>Online</>,
    },
    reports: { title: 'Reports library', sub: <><strong>12</strong> reports<span className="dot-sep">·</span>generated &amp; saved by Agent</> },
    workflows: { title: 'Workflows', sub: <><strong>6</strong> workflows<span className="dot-sep">·</span>5 running<span className="dot-sep">·</span>89 executions this quarter</> },
  },
  toolkit: {
    frameworks: { title: 'Frameworks',  sub: <>Strategic frameworks sold as service</> },
    automations: {
      title: 'Automations',
      sub: <><strong>6</strong> active<span className="dot-sep">·</span>171 runs this month</>,
      onboardTitle: 'Configure your first automation',
      onboardSub: <>3 steps · ~3 min · recipe → trigger → action</>,
    },
    ai:          { title: 'AI Config',   sub: <>Prompt templates per function</> },
    connections: {
      title: 'Connections',
      sub: <><strong>5</strong> of 12 platforms connected<span className="dot-sep">·</span>last sync 5m ago</>,
      onboardTitle: 'Connect your first platform',
      onboardSub: <>3 steps · ~3 min · pick → authorize → set permissions</>,
    },
    settings:    { title: 'Settings',    sub: <>Workspace · Team · Integrations · Billing</> },
  },
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
