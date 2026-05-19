// Livv Dashboard — App shell
const { useState: useAppS, useEffect: useAppE } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "banner": "leaf",
  "showBanner": true,
  "mode": "thoughts",
  "greeting": "Good morning, Eneas.",
  "accent": "#C4A35A"
}/*EDITMODE-END*/;

const BANNERS = {
  leaf:  { src: 'assets/hero-bg.jpg', fallback: 'linear-gradient(120deg, #cdc14a 0%, #d6b04a 40%, #8aa9c4 100%)' },
  art:   { src: 'assets/custom-art.jpg', fallback: 'linear-gradient(120deg, #2c0405 0%, #5c1d18 40%, #2c0405 100%)' },
  rain:  { src: 'assets/footer-gradient.png', fallback: 'linear-gradient(180deg, #fce6f2 0%, #ffefcf 30%, #ffe8c2 50%, #c8e4f5 100%)' },
  none:  { src: '', fallback: '' },
};

const ModeTabs = ({ mode, setMode }) => (
  <div className="mode-tabs">
    {[
      { id: 'thoughts', label: 'Thoughts', icon: 'bulb' },
      { id: 'vision', label: 'Vision', icon: 'eye' },
      { id: 'deep', label: 'Deep work', icon: 'bolt' },
    ].map(t => (
      <button key={t.id} className={`mode-tab ${mode === t.id ? 'active' : ''}`} onClick={() => setMode(t.id)}>
        <Icon name={t.icon} size={13}/>
        <span>{t.label}</span>
      </button>
    ))}
  </div>
);

const App = () => {
  const [active, setActive] = useAppS('home');
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const banner = BANNERS[tweaks.banner] || BANNERS.leaf;

  return (
    <div className="app">
      <Sidebar active={active} setActive={setActive}/>

      <div className="main-col">
        <Topbar/>

        <div className="scroll-body">
          <div className="page">
            {tweaks.showBanner && banner.src && (
              <div className="banner" data-screen-label="Banner" style={{background: banner.fallback}}>
                <img src={banner.src} alt="banner"/>
              </div>
            )}

            <div className="greeting-row">
              <div>
                <div className="greeting-eyebrow">Martes, 19 de mayo</div>
                <h1 className="greeting-title">{tweaks.greeting}</h1>
              </div>
              <ModeTabs mode={tweaks.mode} setMode={(m) => setTweak('mode', m)}/>
            </div>

            <div className="cols">
              <div>
                <BriefSection/>
                <TodaysBrief/>
                <TasksSection/>
                <AgendaSection/>
                <ProjectsSection/>
              </div>
              <Rail/>
            </div>
          </div>
        </div>
      </div>

      <button className="ai-fab" title="Ask AI">
        <span className="label">Ask AI</span>
        <Icon name="sparkle" size={20}/>
      </button>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Greeting">
          <TweakText label="Headline" value={tweaks.greeting} onChange={v => setTweak('greeting', v)}/>
        </TweakSection>
        <TweakSection label="Banner">
          <TweakToggle label="Show banner" value={tweaks.showBanner} onChange={v => setTweak('showBanner', v)}/>
          <TweakRadio label="Imagery" value={tweaks.banner} onChange={v => setTweak('banner', v)}
            options={[
              { value: 'leaf', label: 'Leaf' },
              { value: 'art', label: 'Art' },
              { value: 'rain', label: 'Rainbow' },
            ]}/>
        </TweakSection>
        <TweakSection label="Default mode">
          <TweakRadio label="Mode" value={tweaks.mode} onChange={v => setTweak('mode', v)}
            options={[
              { value: 'thoughts', label: 'Thoughts' },
              { value: 'vision', label: 'Vision' },
              { value: 'deep', label: 'Deep' },
            ]}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
