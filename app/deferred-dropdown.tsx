'use client';
import {
  cloneElement,
  lazy,
  Suspense,
  useState,
  type ReactElement,
} from 'react';
import type { DropdownProps } from 'antd';
const Dropdown = lazy(() => import('antd/es/dropdown'));
export default function DeferredDropdown({
  children,
  menu,
  ...props
}: DropdownProps) {
  const [activated, setActivated] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = cloneElement(
    children as ReactElement<{
      onClick?: () => void;
      'aria-expanded'?: boolean;
    }>,
    {
      onClick: () => {
        setActivated(true);
        setOpen(true);
      },
      'aria-expanded': open,
    },
  );
  if (!activated) return trigger;
  return (
    <Suspense fallback={trigger}>
      <Dropdown
        {...props}
        open={open}
        onOpenChange={setOpen}
        menu={{
          ...menu,
          onClick: (info) => {
            setOpen(false);
            menu?.onClick?.(info);
          },
        }}
      >
        {children}
      </Dropdown>
    </Suspense>
  );
}
