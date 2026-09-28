'use client';

import type { HTMLAttributes, ReactNode } from 'react';

type IconProps = HTMLAttributes<HTMLSpanElement> & { spin?: boolean };

function Icon({
  children,
  className = '',
  spin = false,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`anticon kaikei-ui-icon${spin ? ' kaikei-ui-icon-spin' : ''}${className ? ` ${className}` : ''}`}
      {...props}
    >
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  );
}

export function ArrowDownOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v15M6.5 13.5 12 19l5.5-5.5" />
    </Icon>
  );
}

export function ArrowUpOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20V5M6.5 10.5 12 5l5.5 5.5" />
    </Icon>
  );
}

export function BarChartOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20V10M10 20V5M16 20v-7M22 20H2" />
    </Icon>
  );
}

export function CheckCircleOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.7 2.7L16.5 9" />
    </Icon>
  );
}

export function ClockCircleOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  );
}

export function DeleteOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </Icon>
  );
}

export function DownloadOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v11m-4-4 4 4 4-4M5 18v2h14v-2" />
    </Icon>
  );
}

export function EditOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 16-.8 4 4-.8L18 8.4 14.6 5 4 16Z" />
      <path d="m13.8 5.8 3.4 3.4M12 20h8" />
    </Icon>
  );
}

export function MoreOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function MoonOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
    </Icon>
  );
}

export function PlusOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function ProfileOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h2M13 8h3M8 12h2M13 12h3M8 16h2M13 16h3" />
    </Icon>
  );
}

export function ReloadOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 7v5h-5" />
      <path d="M18.2 9A7 7 0 1 0 19 15" />
    </Icon>
  );
}

export function SwapOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 8h13l-3-3M19 16H6l3 3" />
    </Icon>
  );
}

export function SyncOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M18.2 9A7 7 0 0 0 6.5 6.5L4 9M5.8 15A7 7 0 0 0 17.5 17.5L20 15" />
    </Icon>
  );
}

export function SunOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function UploadOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15V4m-4 4 4-4 4 4M5 18v2h14v-2" />
    </Icon>
  );
}

export function WalletOutlined(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6.5h14a2 2 0 0 1 2 2V19H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h12" />
      <path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z" />
    </Icon>
  );
}
