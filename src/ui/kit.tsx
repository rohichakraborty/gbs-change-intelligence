import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Provenance } from '../domain/types';
import { PLACEHOLDER_RE } from '../domain/util';

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="titles">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Section({ title, hint, actions, children, flush }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="section">
      {(title || actions) && (
        <div className="section-head">
          {title && <h3>{title}</h3>}
          {hint && <span className="hint">{hint}</span>}
          <span style={{ flex: 1 }} />
          {actions}
        </div>
      )}
      <div className={`section-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'teal' | 'ghost' | 'danger' | 'default'; size?: 'sm'; icon?: ReactNode };
export function Btn({ variant = 'default', size, icon, children, className = '', ...rest }: BtnProps) {
  return (
    <button type="button" className={`btn ${variant !== 'default' ? variant : ''} ${size ?? ''} ${!children ? 'icon' : ''} ${className}`} {...rest}>
      {icon}{children}
    </button>
  );
}

export function Badge({ tone = 'muted', children, title }: { tone?: 'ok' | 'warn' | 'crit' | 'info' | 'muted' | 'ai'; children: ReactNode; title?: string }) {
  return <span className={`badge b-${tone}`} title={title}>{children}</span>;
}

const PROV_LABEL: Record<Provenance, string> = { fact: 'Engagement fact', rule: 'Rule recommendation', ai: 'AI suggestion', consultant: 'Consultant decision', missing: 'Missing information' };
export function Prov({ kind, label }: { kind: Provenance; label?: string }) {
  return <span className={`prov ${kind}`} title={PROV_LABEL[kind]}>{label ?? PROV_LABEL[kind]}</span>;
}

export function Field({ label, help, children, htmlFor }: { label: string; help?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

/** Text input that commits on blur/Enter so typing does not create an audit event per keystroke. */
export function TextIn({ value, onCommit, placeholder, id, type = 'text', invalid, multiline, rows, className }: {
  value: string; onCommit: (v: string) => void; placeholder?: string; id?: string; type?: string; invalid?: boolean; multiline?: boolean; rows?: number; className?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v); };
  if (multiline) {
    return <textarea id={id} className={`textarea ${className ?? ''}`} value={v} rows={rows ?? 3} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />;
  }
  return (
    <input id={id} type={type} className={`input ${invalid ? 'invalid' : ''} ${className ?? ''}`} value={v} placeholder={placeholder}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

export function Select<T extends string>({ value, onChange, options, id, placeholder, disabled }: {
  value: T | '' | null; onChange: (v: T) => void; options: { value: T; label: string }[]; id?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Chips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button type="button" key={o.value} className={`chip ${on ? 'on' : ''}`} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>{o.label}</button>
        );
      })}
    </div>
  );
}

/** Free-text list editor (comma separated). */
export function ListIn({ value, onCommit, placeholder, id }: { value: string[]; onCommit: (v: string[]) => void; placeholder?: string; id?: string }) {
  return <TextIn id={id} value={value.join(', ')} placeholder={placeholder} onCommit={(v) => onCommit(v.split(',').map((x) => x.trim()).filter(Boolean))} />;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => <button key={t.value} role="tab" aria-selected={t.value === value} className={`tab ${t.value === value ? 'on' : ''}`} onClick={() => onChange(t.value)}>{t.label}</button>)}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => <button key={o.value} type="button" className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Empty({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Modal({ title, children, footer, onClose, wide }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">{title}<span style={{ flex: 1 }} /><Btn variant="ghost" icon={<X size={16} />} onClick={onClose} aria-label="Close" /></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** In-page confirmation (browser confirm() is unavailable inside the artifact viewer). */
export function useConfirm() {
  const [req, setReq] = useState<{ title: string; body: ReactNode; confirm: string; danger?: boolean; resolve: (b: boolean) => void } | null>(null);
  const ask = (title: string, body: ReactNode, confirm = 'Confirm', danger = false) => new Promise<boolean>((resolve) => setReq({ title, body, confirm, danger, resolve }));
  const node = req ? (
    <Modal title={req.title} onClose={() => { req.resolve(false); setReq(null); }}
      footer={<><Btn onClick={() => { req.resolve(false); setReq(null); }}>Cancel</Btn><Btn variant={req.danger ? 'danger' : 'primary'} onClick={() => { req.resolve(true); setReq(null); }}>{req.confirm}</Btn></>}>
      {req.body}
    </Modal>
  ) : null;
  return { ask, node };
}

/** Renders text with [PLACEHOLDERS] highlighted. */
export function PhText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<mark key={i++} className="ph">{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function Kpi({ label, value, sub, pct, onClick }: { label: string; value: ReactNode; sub?: ReactNode; pct?: number; onClick?: () => void }) {
  return (
    <div className="kpi" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick(); }}>
      <div className="k-label">{label}</div>
      <div className="k-value">{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
      {pct !== undefined && <div className="meter"><i style={{ width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%` }} /></div>}
    </div>
  );
}

export function Bars({ data, color = 'var(--blue)' }: { data: { label: string; value: number; segments?: { value: number; color: string; label: string }[] }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <span className="muted" title={d.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
          <span className="bar-track" title={d.segments?.map((s) => `${s.label}: ${s.value}`).join(' · ')}>
            {d.segments ? d.segments.map((s, i) => <i key={i} style={{ width: `${(s.value / max) * 100}%`, background: s.color }} />) : <i style={{ width: `${(d.value / max) * 100}%`, background: color }} />}
          </span>
          <span className="num strong" style={{ textAlign: 'right' }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}
