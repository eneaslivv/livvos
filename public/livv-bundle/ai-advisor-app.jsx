// AI Advisor — App shell
const { useState: useAdvS } = React;

const ADV_TWEAKS = /*EDITMODE-BEGIN*/{
  "view": "empty",
  "showBackdrop": true,
  "topics": ["finance", "projects", "team", "time"]
}/*EDITMODE-END*/;

const SEED_THREAD = [
  {
    role: 'user',
    text: 'Log an expense of $X concept Y to category Z. If you are missing info, ask me before proposing the action.',
  },
  {
    role: 'bot',
    text: 'Of course. I need three details to file this cleanly — fill in what you remember and I will log it the moment you confirm.',
    action: { amount: '', concept: '', category: '' },
  },
  {
    role: 'user',
    text: '$42, Figma annual seat, Software',
  },
  {
    role: 'bot',
    text: 'Got it. Ready to log $42 to Software → Figma annual seat. This will appear in your finances under "May 2026 · Software", which already sits at $284.',
    sources: [
      { label: 'Finances · May', color: '#769268' },
      { label: 'Subscriptions', color: '#6DBEDC' },
    ],
    action: { amount: '42', concept: 'Figma annual seat', category: 'Software' },
  },
];

const AdvApp = () => {
  const [tweaks, setTweak] = useTweaks(ADV_TWEAKS);
  const [value, setValue] = useAdvS('');
  const [thread, setThread] = useAdvS(() =>
    ADV_TWEAKS.view === 'conversation' ? SEED_THREAD : []
  );

  const resetThread = () => {
    setThread([]);
    setTweak('view', 'empty');
  };

  // Seed demo thread when toggling to conversation via Tweaks (only if empty).
  // Won't fire after send() because thread already has 1 message by the time
  // the view-change effect runs.
  React.useEffect(() => {
    if (tweaks.view === 'conversation' && thread.length === 0) {
      setThread(SEED_THREAD);
    }
  }, [tweaks.view]);

  const send = (text) => {
    const t = (text ?? value).trim();
    if (!t) return;
    setThread(prev => [...prev, { role: 'user', text: t }]);
    setValue('');
    setTweak('view', 'conversation');
    setTimeout(() => {
      setThread(prev => [...prev, {
        role: 'bot',
        text: 'Let me have a look at your projects and team for a moment…',
      }]);
    }, 600);
  };

  return (
    <div className={`adv-page ${tweaks.showBackdrop ? 'with-bg' : ''}`}>
      {tweaks.showBackdrop && (
        <div className="adv-backdrop" aria-hidden>
          <div className="adv-bg-blob blob-a"/>
          <div className="adv-bg-blob blob-b"/>
          <div className="adv-bg-blob blob-c"/>
        </div>
      )}

      <aside className="adv-panel" data-screen-label="AI Advisor panel">
        <PanelHeader
          onClose={resetThread}
          onReset={resetThread}
        />
        <TopicsBar
          activeTopics={tweaks.topics}
          toggleTopic={(id) => {
            const next = tweaks.topics.includes(id)
              ? tweaks.topics.filter(t => t !== id)
              : [...tweaks.topics, id];
            setTweak('topics', next);
          }}
          onOpenSettings={() => window.postMessage({type:'__activate_edit_mode'}, '*')}
        />
        <ContextStrip activeTopics={tweaks.topics}/>

        <div className="adv-body">
          {tweaks.view === 'empty'
            ? <EmptyState onPick={(t) => send(t)} activeTopics={tweaks.topics}/>
            : <Conversation messages={thread}/>
          }
        </div>

        <ChatInput
          value={value}
          setValue={setValue}
          onSend={() => send()}
        />
      </aside>

      <TweaksPanel title="Tweaks">
        <TweakSection label="State">
          <TweakRadio label="View" value={tweaks.view} onChange={v => setTweak('view', v)}
            options={[
              { value: 'empty', label: 'Empty' },
              { value: 'conversation', label: 'Chat' },
            ]}/>
          <TweakToggle label="Backdrop" value={tweaks.showBackdrop} onChange={v => setTweak('showBackdrop', v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

const advRoot = ReactDOM.createRoot(document.getElementById('root'));
advRoot.render(<AdvApp/>);
