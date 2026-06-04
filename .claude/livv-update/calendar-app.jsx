// Calendar — App shell
const { useState: useCalAppS } = React;

const CAL_TWEAKS = /*EDITMODE-BEGIN*/{
  "groupMode": "band",
  "density": "comfy",
  "showWeeklyAi": true
}/*EDITMODE-END*/;

const CalApp = () => {
  const [active, setActive] = useCalAppS('calendar');
  const [view, setView] = useCalAppS('List');
  const [scope, setScope] = useCalAppS('Schedule');
  const [preset, setPreset] = useCalAppS('all');
  const [group, setGroup] = useCalAppS('band');
  const [tweaks, setTweak] = useTweaks(CAL_TWEAKS);

  const filtered = (() => {
    if (preset === 'mine') return CAL_TASKS.filter(t => t.owner === 'EN');
    if (preset === 'overdue') return CAL_TASKS.filter(t => t.band === 'overdue');
    if (preset === 'urgent') return CAL_TASKS.filter(t => t.priority === 'high' || t.priority === 'urgent');
    return CAL_TASKS;
  })();

  return (
    <div className="app">
      <Sidebar active={active} setActive={setActive}/>

      <div className="main-col">
        <Topbar/>

        <div className="scroll-body">
          <div className="cal-page" data-screen-label="Calendar page">
            <CalendarHeader view={view} setView={setView} scope={scope} setScope={setScope}/>

            {tweaks.showWeeklyAi && <WeeklySummary/>}

            <FilterBar preset={preset} setPreset={setPreset} group={group} setGroup={setGroup}/>

            <div className="cal-cols">
              <div>
                {BANDS.map(band => {
                  const tasks = filtered.filter(t => t.band === band.id);
                  if (preset !== 'all' && tasks.length === 0) return null;
                  return <Band key={band.id} band={band} tasks={tasks} defaultOpen={band.id !== 'later'}/>;
                })}
              </div>

              <aside className="rail-stack">
                <MiniMonth/>
                <WorkloadStrip/>
                <QuickFilters/>
              </aside>
            </div>
          </div>
        </div>
      </div>

      <a className="ai-fab" href="index.html" title="Home">
        <span className="label">Back to Home</span>
        <Icon name="home" size={18}/>
      </a>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Layout">
          <TweakToggle label="AI weekly card" value={tweaks.showWeeklyAi} onChange={v => setTweak('showWeeklyAi', v)}/>
          <TweakRadio label="Density" value={tweaks.density} onChange={v => setTweak('density', v)}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfy', label: 'Comfy' },
            ]}/>
        </TweakSection>
        <TweakSection label="Grouping">
          <TweakRadio label="Group by" value={tweaks.groupMode} onChange={v => setTweak('groupMode', v)}
            options={[
              { value: 'band', label: 'Smart' },
              { value: 'date', label: 'Date' },
              { value: 'project', label: 'Project' },
            ]}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

const calRoot = ReactDOM.createRoot(document.getElementById('root'));
calRoot.render(<CalApp/>);
