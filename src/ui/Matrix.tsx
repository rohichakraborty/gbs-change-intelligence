import { useMemo, useRef, useState, type ReactNode, type MouseEvent, type KeyboardEvent } from 'react';
import { Maximize2, Minimize2, Search } from 'lucide-react';
import { useApp } from '../store/store';
import { Btn } from './kit';

export interface MxCol { id: string; label: string; title?: string; group?: string }
export interface MxRow { id: string; label: ReactNode; searchText: string; meta?: ReactNode[] }
export interface MxGroup { id: string; label: string; rows: MxRow[] }
export interface MxCell { node: ReactNode; className?: string; title?: string }

interface Props {
  title: string;
  subtitle?: string;
  cols: MxCol[];
  groups: MxGroup[];
  rowHeader: string;
  metaHeaders?: string[];
  metaWidths?: number[];
  rowHeadWidth?: number;
  colWidth?: number;
  cell: (rowId: string, colId: string) => MxCell;
  onCell?: (rowId: string, colId: string, e: MouseEvent | KeyboardEvent) => void;
  selected?: { r: string; c: string } | null;
  multi?: Set<string>;
  toolbar?: ReactNode;
  legend?: ReactNode;
  footer?: ReactNode;
  colFilter?: (c: MxCol) => boolean;
}

export function Matrix({
  title, subtitle, cols, groups, rowHeader, metaHeaders = [], metaWidths = [], rowHeadWidth = 260, colWidth = 92,
  cell, onCell, selected, multi, toolbar, legend, footer, colFilter,
}: Props) {
  const fullscreen = useApp((s) => s.fullscreen);
  const setFullscreen = useApp((s) => s.setFullscreen);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const tableRef = useRef<HTMLTableElement>(null);

  const visCols = useMemo(() => cols.filter((c) => (colFilter ? colFilter(c) : true)), [cols, colFilter]);
  const visGroups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !ql || r.searchText.toLowerCase().includes(ql) || g.label.toLowerCase().includes(ql)) })).filter((g) => g.rows.length);
  }, [groups, q]);
  const flatRows = useMemo(() => visGroups.flatMap((g) => g.rows), [visGroups]);
  const offsets = useMemo(() => {
    const o = [rowHeadWidth];
    metaWidths.forEach((w, i) => o.push(o[i] + w));
    return o;
  }, [rowHeadWidth, metaWidths]);

  const focusCell = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(flatRows.length - 1, r));
    const cc = Math.max(0, Math.min(visCols.length - 1, c));
    setActive({ r: rr, c: cc });
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLElement>(`[data-r="${rr}"][data-c="${cc}"]`)?.focus());
  };
  const onKey = (e: KeyboardEvent, r: number, c: number) => {
    const map: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (map[e.key]) { e.preventDefault(); focusCell(r + map[e.key][0], c + map[e.key][1]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCell?.(flatRows[r].id, visCols[c].id, e); }
  };

  let rIdx = -1;
  const body = (
    <section className="section" style={{ marginBottom: fullscreen ? 0 : 16 }}>
      <div className="section-head">
        <h3>{title}</h3>
        {subtitle && <span className="hint">{subtitle}</span>}
        <span style={{ flex: 1 }} />
        <Btn size="sm" icon={fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? 'Exit full screen' : 'Full screen'}</Btn>
      </div>
      <div className="mx-toolbar">
        <div className="row" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-2)' }} />
          <input className="input" style={{ paddingLeft: 28 }} placeholder={`Search ${rowHeader.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rows" />
        </div>
        {toolbar}
        <span style={{ flex: 1 }} />
        <span className="small muted num">{flatRows.length} rows × {visCols.length} columns</span>
      </div>
      <div className="mx-scroll">
        {flatRows.length === 0 ? <div className="empty"><h3>No rows to show</h3><p>Adjust the search or filters.</p></div> : (
          <table className="mx" ref={tableRef} role="grid" aria-label={title}>
            <thead>
              <tr>
                <th className="frozen" style={{ left: 0, minWidth: rowHeadWidth, maxWidth: rowHeadWidth }}>{rowHeader}</th>
                {metaHeaders.map((h, i) => <th key={h} className="frozen" style={{ left: offsets[i], minWidth: metaWidths[i], maxWidth: metaWidths[i] }}>{h}</th>)}
                {visCols.map((c) => <th key={c.id} style={{ minWidth: colWidth, maxWidth: colWidth + 40 }} title={c.title ?? c.label}><span className="colhead">{c.label}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {visGroups.map((g) => (
                <FragmentRows key={g.id}>
                  <tr className="grp">
                    <td className="frozen" style={{ left: 0 }} colSpan={1}>{g.label}</td>
                    {metaHeaders.map((h, i) => <td key={h} className="frozen" style={{ left: offsets[i] }} />)}
                    <td colSpan={visCols.length} />
                  </tr>
                  {g.rows.map((r) => {
                    rIdx += 1;
                    const ri = rIdx;
                    return (
                      <tr key={r.id}>
                        <td className="frozen rowhead" style={{ left: 0, minWidth: rowHeadWidth, maxWidth: rowHeadWidth }}>{r.label}</td>
                        {(r.meta ?? []).map((m, i) => <td key={i} className="frozen" style={{ left: offsets[i], minWidth: metaWidths[i], maxWidth: metaWidths[i], padding: '4px 8px', fontSize: 11.5 }}>{m}</td>)}
                        {visCols.map((c, ci) => {
                          const x = cell(r.id, c.id);
                          const isSel = selected?.r === r.id && selected?.c === c.id;
                          const isMulti = multi?.has(`${r.id}|${c.id}`);
                          return (
                            <td key={c.id} role="gridcell" data-r={ri} data-c={ci} tabIndex={active.r === ri && active.c === ci ? 0 : -1}
                              className={`cellc ${x.className ?? ''} ${isSel ? 'sel' : ''} ${isMulti ? 'multi' : ''}`} title={x.title}
                              onClick={(e) => { setActive({ r: ri, c: ci }); onCell?.(r.id, c.id, e); }} onKeyDown={(e) => onKey(e, ri, ci)}>
                              {x.node}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </FragmentRows>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {legend && <div className="mx-legend">{legend}</div>}
      {footer}
    </section>
  );
  return fullscreen ? <div className="fullscreen-mx">{body}</div> : body;
}

function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
