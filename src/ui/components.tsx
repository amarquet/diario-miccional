/** Componentes de interface reutilizáveis (acessíveis, alvos táteis ≥ 44 px). */
import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { navigate, type Route } from '../app/router';

export function TopBar({ back, backLabel = 'Voltar', trailing }: { back?: Route; backLabel?: string; trailing?: ReactNode }) {
  return (
    <div className="topbar no-print">
      {back && (
        <button type="button" className="back" onClick={() => navigate(back)}>
          <Icon name="back" />
          <span>{backLabel}</span>
        </button>
      )}
      <span className="spacer" />
      {trailing}
    </div>
  );
}

export function Section({ title, footer, children, id }: { title?: string; footer?: ReactNode; children: ReactNode; id?: string }) {
  const headingId = useId();
  return (
    <section className="section" aria-labelledby={title ? headingId : undefined} id={id}>
      {title && (
        <h2 className="section-title" id={headingId}>
          {title}
        </h2>
      )}
      {children}
      {footer && <p className="section-footer">{footer}</p>}
    </section>
  );
}

export function ListRow({
  label,
  sublabel,
  detail,
  icon,
  onClick,
  href,
  danger,
}: {
  label: ReactNode;
  sublabel?: ReactNode;
  detail?: ReactNode;
  icon?: IconName;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const content = (
    <>
      {icon && <Icon name={icon} />}
      <span className="label">
        {label}
        {sublabel && <span className="sublabel">{sublabel}</span>}
      </span>
      {detail !== undefined && <span className="detail">{detail}</span>}
      {(onClick || href) && !danger && <Icon name="chevron" size={18} className="chevron" />}
    </>
  );
  if (href) {
    return (
      <a className={`list-row${danger ? ' danger' : ''}`} href={href}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={`list-row${danger ? ' danger' : ''}`} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="list-static">{content}</div>;
}

export function Banner({
  tone = 'info',
  icon = 'info',
  title,
  children,
  actions,
  role,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'night';
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  role?: 'status' | 'alert' | 'note';
}) {
  return (
    <div className={`banner ${tone === 'info' ? '' : tone}`} role={role}>
      <Icon name={icon} className="banner-icon" />
      <div className="banner-body">
        {title && <strong>{title}</strong>}
        {children}
        {actions && <div className="banner-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  night,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  night?: boolean;
}) {
  return (
    <div className={`stat${night ? ' night' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: ReactNode;
  prefix?: ReactNode;
}

/** Grupo de escolha única em "chips" (rádios nativos: teclado e leitores de ecrã). */
export function ChoiceChips<T extends string | number>({
  legend,
  legendHidden,
  options,
  value,
  onChange,
  allowDeselect,
  layout = 'wrap',
  name,
}: {
  legend: string;
  legendHidden?: boolean;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowDeselect?: boolean;
  layout?: 'wrap' | 'grid-4' | 'grid-3' | 'stack-list' | 'inline';
  name?: string;
}) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <fieldset className="fieldset">
      <legend className={legendHidden ? 'visually-hidden' : undefined}>{legend}</legend>
      <div className={`chips ${layout}`}>
        {options.map((opt) => {
          const checked = value === opt.value;
          return (
            <label key={String(opt.value)} className="chip">
              <input
                type="radio"
                name={groupName}
                value={String(opt.value)}
                checked={checked}
                onChange={() => onChange(opt.value)}
                onClick={() => {
                  if (allowDeselect && checked) onChange(null);
                }}
              />
              {opt.prefix}
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Grupo de escolha múltipla em "chips" (caixas de verificação nativas). */
export function MultiChips<T extends string>({
  legend,
  options,
  values,
  onChange,
  layout = 'wrap',
}: {
  legend: string;
  options: ChoiceOption<T>[];
  values: T[];
  onChange: (values: T[]) => void;
  layout?: 'wrap' | 'stack-list';
}) {
  return (
    <fieldset className="fieldset">
      <legend>{legend}</legend>
      <div className={`chips ${layout}`}>
        {options.map((opt) => {
          const checked = values.includes(opt.value);
          return (
            <label key={opt.value} className="chip">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? values.filter((v) => v !== opt.value) : [...values, opt.value])}
              />
              {opt.prefix}
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label className="switch-row" htmlFor={id}>
      <span>
        {label}
        {hint && <span className="sublabel">{hint}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Messages({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <div className="messages" role="alert">
      {errors.map((e) => (
        <p className="error" key={e} style={{ margin: 0 }}>
          {e}
        </p>
      ))}
      {warnings.map((w) => (
        <p className="warning" key={w} style={{ margin: 0 }}>
          ⚠︎ {w}
        </p>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="h2">{title}</h2>
      {children}
    </div>
  );
}
