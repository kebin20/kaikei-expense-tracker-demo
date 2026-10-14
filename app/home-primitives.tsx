'use client';

import { useId, type ReactNode } from 'react';

// Display-only Home components do not need the form/table UI machinery. Keep
// the established structural classes so responsive and seasonal styles apply.
export function Card({
  children,
  title,
  extra,
  className = '',
  variant,
  id,
}: {
  children: ReactNode;
  title?: ReactNode;
  extra?: ReactNode;
  className?: string;
  variant?: 'borderless' | 'outlined';
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`ant-card kaikei-home-card ${variant === 'borderless' ? '' : 'ant-card-bordered'} ${className}`}
    >
      {(title || extra) && (
        <div className="ant-card-head">
          <div className="ant-card-head-wrapper">
            <div className="ant-card-head-title">{title}</div>
            {extra && <div className="ant-card-extra">{extra}</div>}
          </div>
        </div>
      )}
      <div className="ant-card-body">{children}</div>
    </section>
  );
}

export function Progress({
  percent,
  strokeColor,
  'aria-label': label,
  'aria-valuetext': valueText,
}: {
  percent: number;
  strokeColor?: string;
  showInfo?: boolean;
  'aria-label'?: string;
  'aria-valuetext'?: string;
}) {
  const value = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, percent))
    : 0;
  return (
    <progress
      className="ant-progress kaikei-home-progress"
      value={value}
      max={100}
      aria-label={label}
      aria-valuetext={valueText}
      style={{ color: strokeColor }}
    />
  );
}

export function FlowScope({
  value,
  onChange,
}: {
  value: 'year' | 'month';
  onChange: (value: 'year' | 'month') => void;
}) {
  const name = useId();
  return (
    <fieldset className="kaikei-flow-scope" aria-label="Money flow period">
      {(['year', 'month'] as const).map((option) => (
        <label key={option} className={value === option ? 'selected' : ''}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span>{option === 'year' ? 'Year' : 'Month'}</span>
        </label>
      ))}
    </fieldset>
  );
}
