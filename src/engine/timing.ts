import type { CommunicationRecord, EngagementState, ISODate, Milestone, Wave } from '../domain/types';
import { addUnits, diffUnits } from '../domain/util';

export function primaryWave(s: EngagementState): Wave | null {
  return s.waves.find((w) => w.id === s.engagement.primaryWaveId) ?? s.waves[0] ?? null;
}

/** Go-live date that a milestone's relative timing is measured against. */
export function anchorGoLive(s: EngagementState, waveId: string | null): ISODate | null {
  const w = waveId ? s.waves.find((x) => x.id === waveId) : primaryWave(s);
  return w?.goLiveDate ?? s.engagement.plannedGoLive ?? null;
}

export function milestoneDate(s: EngagementState, m: Milestone): ISODate | null {
  if (m.anchor === 'date') return m.date;
  const g = anchorGoLive(s, m.waveId);
  if (!g || m.relativeOffset === null) return null;
  return addUnits(g, m.relativeOffset, s.engagement.timeUnit);
}

export function milestoneOffset(s: EngagementState, m: Milestone): number | null {
  if (m.anchor === 'relative') return m.relativeOffset;
  const g = anchorGoLive(s, m.waveId);
  if (!g || !m.date) return null;
  return diffUnits(m.date, g, s.engagement.timeUnit);
}

export function commPlannedDate(s: EngagementState, c: CommunicationRecord, m: Milestone | undefined): ISODate | null {
  if (c.plannedDateOverride) return c.plannedDateOverride;
  if (!m) return null;
  const d = milestoneDate(s, m);
  if (!d) return null;
  return m.trigger.leadTime ? addUnits(d, -m.trigger.leadTime, s.engagement.timeUnit) : d;
}

export function waveName(s: EngagementState, waveId: string | null): string {
  if (!waveId) return 'All waves';
  return s.waves.find((w) => w.id === waveId)?.name ?? 'Unknown wave';
}
