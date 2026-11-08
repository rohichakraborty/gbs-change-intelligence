import { useState } from 'react';
import { useApp } from '../store/store';
import { CHANNEL_COLOR_LABEL } from '../domain/library';
import type { Channel } from '../domain/types';
import { roleShort } from '../engine/communicator';
import { Matrix } from '../ui/Matrix';
import { Btn, Empty, PageHeader } from '../ui/kit';
import { MatrixFilters, useMilestoneRows } from './AudienceMatrix';

export function CommunicatorMatrix() {
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const setView = useApp((x) => x.setView);
  const [phase, setPhase] = useState(''); const [wave, setWave] = useState(''); const [colGroup, setColGroup] = useState('');
  const { s, d, groups } = useMilestoneRows(phase, wave);
  const sel = inspector?.kind === 'comm' ? (() => { const c = d.commById.get(inspector.commId); return c ? { r: c.rec.milestoneId, c: c.rec.audienceId } : null; })() : null;
  const missing = d.activeComms.filter((c) => !c.roles.primary).length;
  return (
    <>
      <PageHeader eyebrow="Stage 3 · Change Management Plan" title="Milestone × Audience × Communicator Matrix"
        sub="Who delivers each communication. Assignments come from the Communicator Responsibility Framework rules and can be overridden; overrides are never silently replaced."
        actions={<Btn onClick={() => setView('deliverables')}>Export</Btn>} />
      {missing > 0 && <div className="banner crit"><div className="grow"><strong>{missing} communication(s) have no primary communicator.</strong> The plan cannot be execution-ready until these are assigned.</div></div>}
      {!d.activeComms.length ? <Empty title="No communication records yet" actions={<Btn variant="primary" onClick={() => setView('audience-matrix')}>Open Audience Matrix</Btn>}>Generate audience recommendations first.</Empty> : (
        <Matrix title="Communicator assignments" subtitle="Primary communicator (+ supporting). Click a cell to see why."
          cols={d.selectedStakeholders.map((x) => ({ id: x.id, label: x.roleName, group: x.groupId }))} colFilter={(c) => !colGroup || c.group === colGroup}
          groups={groups} rowHeader="Milestone / event" metaHeaders={['Timing']} metaWidths={[64]} rowHeadWidth={280} colWidth={112}
          selected={sel} onCell={(r, c) => { const cs = (d.commsByCell.get(`${r}|${c}`) ?? []).filter((x) => x.active); if (cs.length) inspect({ kind: 'comm', commId: cs[0].rec.id, tab: 'communicator' }); else inspect({ kind: 'cell', milestoneId: r, stakeholderId: c }); }}
          toolbar={<MatrixFilters phase={phase} setPhase={setPhase} wave={wave} setWave={setWave} colGroup={colGroup} setColGroup={setColGroup} />}
          cell={(r, c) => {
            const cs = (d.commsByCell.get(`${r}|${c}`) ?? []).filter((x) => x.active);
            if (!cs.length) return { node: <div className="cell-inner" /> };
            return {
              node: <div className="cell-inner" style={{ flexDirection: 'column', gap: 1 }}>{cs.map((x) => x.roles.primary
                ? <span key={x.rec.id} className={`cell-text ${x.rolesOverridden ? '' : 'rec'}`}>{roleShort(s, x.roles.primary)}{x.roles.supporting.length ? <span className="muted"> +{x.roles.supporting.map((r2) => roleShort(s, r2)).join(', ')}</span> : null}</span>
                : <span key={x.rec.id} className="cell-text missing">Requires review</span>)}
                {cs.some((x) => x.rolesOverridden) && <span className="dot-override" />}{cs.some((x) => x.rolesConflict) && <span className="dot-conflict" />}{cs.some((x) => x.rolesRec.needsReview && !x.rolesOverridden) && <span className="dot-review" />}</div>,
              title: cs.map((x) => `${x.rec.code}: ${x.rolesRec.rationale[0] ?? ''}`).join('\n'),
            };
          }}
          legend={<>
            <span><span className="cell-text rec">Blue</span> rule recommendation</span><span><span className="cell-text">Dark</span> consultant override</span><span><span className="cell-text missing">Requires review</span> no accountable communicator</span>
            <span className="row"><span className="swatch" style={{ background: 'var(--warn)', borderRadius: 6 }} /> Needs review (e.g. sensitive, unnamed governance role)</span>
            <span className="row"><span className="swatch" style={{ background: 'var(--crit)', borderRadius: 6 }} /> Override differs from current rules</span>
          </>} />
      )}
    </>
  );
}

export function ChannelMatrix() {
  const inspect = useApp((x) => x.inspect);
  const inspector = useApp((x) => x.inspector);
  const setView = useApp((x) => x.setView);
  const [phase, setPhase] = useState(''); const [wave, setWave] = useState(''); const [colGroup, setColGroup] = useState('');
  const { s, d, groups } = useMilestoneRows(phase, wave);
  const sel = inspector?.kind === 'comm' ? (() => { const c = d.commById.get(inspector.commId); return c ? { r: c.rec.milestoneId, c: c.rec.audienceId } : null; })() : null;
  const used = new Set(d.activeComms.map((c) => c.channels.primary).filter(Boolean).map((id) => s.channels.find((x) => x.id === id)?.color));
  return (
    <>
      <PageHeader eyebrow="Stage 3 · Change Management Plan" title="Communication Channel Matrix"
        sub="Recommended primary channel for each milestone and audience, with the number of additional (secondary, reinforcement, follow-up) channels. Generated from the same communication records as the Audience and Communicator matrices."
        actions={<Btn onClick={() => setView('deliverables')}>Export</Btn>} />
      {!d.activeComms.length ? <Empty title="No communication records yet" actions={<Btn variant="primary" onClick={() => setView('audience-matrix')}>Open Audience Matrix</Btn>} /> : (
        <Matrix title="Channel plan" subtitle="Colour = channel family; every cell also carries a text label"
          cols={d.selectedStakeholders.map((x) => ({ id: x.id, label: x.roleName, group: x.groupId }))} colFilter={(c) => !colGroup || c.group === colGroup}
          groups={groups} rowHeader="Milestone / event" metaHeaders={['Timing']} metaWidths={[64]} rowHeadWidth={280} colWidth={116}
          selected={sel} onCell={(r, c) => { const cs = (d.commsByCell.get(`${r}|${c}`) ?? []).filter((x) => x.active); if (cs.length) inspect({ kind: 'comm', commId: cs[0].rec.id, tab: 'channel' }); else inspect({ kind: 'cell', milestoneId: r, stakeholderId: c }); }}
          toolbar={<MatrixFilters phase={phase} setPhase={setPhase} wave={wave} setWave={setWave} colGroup={colGroup} setColGroup={setColGroup} />}
          cell={(r, c) => {
            const cs = (d.commsByCell.get(`${r}|${c}`) ?? []).filter((x) => x.active);
            if (!cs.length) return { node: <div className="cell-inner" /> };
            const x = cs[0];
            const ch = x.channels.primary ? s.channels.find((y) => y.id === x.channels.primary) : null;
            const extra = x.channels.secondary.length + (x.channels.reinforcement ? 1 : 0) + (x.channels.followUp ? 1 : 0);
            return {
              node: <div className={`chcell ${ch ? `ch-${ch.color}` : ''}`} style={{ position: 'relative' }}>
                <span className="chn">{ch ? ch.name : <span className="cell-text missing">No channel</span>}{extra ? ` +${extra}` : ''}</span>
                <span className="chs">{x.roles.primary ? roleShort(s, x.roles.primary) : 'Communicator: review'}{cs.length > 1 ? ` · ${cs.length} comms` : ''}</span>
                {x.channelsOverridden && <span className="dot-override" />}{(x.disabledInUse.length > 0 || x.channelsConflict) && <span className="dot-conflict" />}
              </div>,
              title: `${x.rec.code}: ${[x.channels.primary, ...x.channels.secondary, x.channels.reinforcement, x.channels.followUp].filter(Boolean).map((id) => s.channels.find((y) => y.id === id)?.name).join(' → ')}`,
            };
          }}
          legend={<>
            {(Object.keys(CHANNEL_COLOR_LABEL) as Channel['color'][]).filter((k) => used.has(k)).map((k) => <span key={k} className="row"><span className={`swatch ch-${k}`} /> {CHANNEL_COLOR_LABEL[k]}</span>)}
            <span>“+n” = additional channels</span>
            <span className="row"><span className="swatch" style={{ background: 'var(--ok)', borderRadius: 6 }} /> Consultant override</span>
            <span className="row"><span className="swatch" style={{ background: 'var(--crit)', borderRadius: 6 }} /> Disabled channel or override conflict</span>
          </>} />
      )}
    </>
  );
}
