import { useState } from 'react';
import { useApp } from '../../store/store';
import type { ChangeRecord, RecordStatus } from '../../domain/types';
import { updateChanges } from '../../store/changeActions';
import { Btn, Chips, Field, ListIn, Modal, Select } from '../../ui/kit';

/** Apply shared scope to many changes at once. Only ticked fields are written. */
export function BulkScopeModal({ changeIds, onClose }: { changeIds: string[]; onClose: () => void }) {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [fns, setFns] = useState<string[]>([]);
  const [waves, setWaves] = useState<string[]>([]);
  const [geo, setGeo] = useState('');
  const [entities, setEntities] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<RecordStatus>('confirmed');
  const [owner, setOwner] = useState('');
  const tick = (k: string) => <input type="checkbox" checked={!!on[k]} onChange={(e) => setOn({ ...on, [k]: e.target.checked })} aria-label={`Apply ${k}`} />;
  const apply = () => {
    const patch: Partial<ChangeRecord> = {};
    if (on.fns) { patch.functionTags = fns; patch.functionName = fns[0] ?? ''; }
    if (on.waves) patch.waveIds = waves;
    if (on.geo) patch.geography = geo;
    if (on.entities) patch.entities = entities;
    if (on.date) patch.effectiveDate = date || null;
    if (on.status) patch.status = status;
    if (on.owner) patch.owner = owner;
    if (!Object.keys(patch).length) { toast('Tick at least one field to apply.', 'warn'); return; }
    updateChanges(changeIds, patch, `Bulk scope applied to ${changeIds.length} change(s): ${Object.keys(patch).join(', ')}`);
    toast(`Applied to ${changeIds.length} change(s). Impact recommendations re-evaluated.`);
    onClose();
  };
  return (
    <Modal title={`Bulk assign scope — ${changeIds.length} change(s)`} wide onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={apply}>Apply to {changeIds.length} change(s)</Btn></>}>
      <p className="small muted" style={{ marginBottom: 12 }}>Tick the fields to apply. Unticked fields are left as they are on each change.</p>
      <div className="stack">
        <div className="row" style={{ alignItems: 'flex-start' }}>{tick('fns')}<div style={{ flex: 1 }}><Field label="Applicable functions (none = all in-scope functions)"><Chips options={s.engagement.functions.map((f) => ({ value: f.name, label: f.name }))} value={fns} onChange={(v) => { setFns(v); setOn({ ...on, fns: true }); }} /></Field></div></div>
        <div className="row" style={{ alignItems: 'flex-start' }}>{tick('waves')}<div style={{ flex: 1 }}><Field label="Transition waves (none = all waves)"><Chips options={s.waves.map((w) => ({ value: w.id, label: w.name }))} value={waves} onChange={(v) => { setWaves(v); setOn({ ...on, waves: true }); }} /></Field></div></div>
        <div className="grid g2">
          <div className="row" style={{ alignItems: 'flex-start' }}>{tick('geo')}<div style={{ flex: 1 }}><Field label="Geography"><input className="input" value={geo} onChange={(e) => { setGeo(e.target.value); setOn({ ...on, geo: true }); }} placeholder={s.engagement.geographies.join(', ')} /></Field></div></div>
          <div className="row" style={{ alignItems: 'flex-start' }}>{tick('entities')}<div style={{ flex: 1 }}><Field label="Entities (comma separated)"><ListIn value={entities} onCommit={(v) => { setEntities(v); setOn({ ...on, entities: true }); }} placeholder={s.engagement.entities.join(', ')} /></Field></div></div>
          <div className="row" style={{ alignItems: 'flex-start' }}>{tick('date')}<div style={{ flex: 1 }}><Field label="Expected effective date"><input type="date" className="input" value={date} onChange={(e) => { setDate(e.target.value); setOn({ ...on, date: true }); }} /></Field></div></div>
          <div className="row" style={{ alignItems: 'flex-start' }}>{tick('status')}<div style={{ flex: 1 }}><Field label="Review status"><Select value={status} options={[{ value: 'draft', label: 'Draft' }, { value: 'needs_review', label: 'Needs review' }, { value: 'confirmed', label: 'Confirmed' }]} onChange={(v) => { setStatus(v as RecordStatus); setOn({ ...on, status: true }); }} /></Field></div></div>
          <div className="row" style={{ alignItems: 'flex-start' }}>{tick('owner')}<div style={{ flex: 1 }}><Field label="Change owner"><input className="input" value={owner} onChange={(e) => { setOwner(e.target.value); setOn({ ...on, owner: true }); }} /></Field></div></div>
        </div>
      </div>
    </Modal>
  );
}
