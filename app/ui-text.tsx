import type { HTMLAttributes, ReactNode } from 'react';

interface TextProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  strong?: boolean;
  type?: 'secondary';
}

function classes(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Text({
  children,
  className,
  strong = false,
  type,
  ...props
}: TextProps) {
  const combinedClassName = classes(
    'ant-typography',
    strong && 'ant-typography-strong',
    type === 'secondary' && 'ant-typography-secondary',
    className,
  );

  return strong ? (
    <strong className={combinedClassName} {...props}>
      {children}
    </strong>
  ) : (
    <span className={combinedClassName} {...props}>
      {children}
    </span>
  );
}

interface TitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children?: ReactNode;
  level?: 1 | 2;
}

export function Title({
  children,
  className,
  level = 1,
  ...props
}: TitleProps) {
  const combinedClassName = classes('ant-typography', className);
  return level === 2 ? (
    <h2 className={combinedClassName} {...props}>
      {children}
    </h2>
  ) : (
    <h1 className={combinedClassName} {...props}>
      {children}
    </h1>
  );
}
