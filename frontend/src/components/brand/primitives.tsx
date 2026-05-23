import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

import { STIcon, type IconName } from './Icons';

export const ST = {
  navy: '#0B1149',
  navyDeep: '#060A2E',
  purple: '#6B3FD0',
  purpleSoft: '#8B5BFF',
  pink: '#FF3E9E',
  pinkDeep: '#D81F7E',
  cyan: '#2BE6F2',
  cyanDeep: '#0FB8C5',
  yellow: '#FFD23F',
  white: '#FFFFFF'
} as const;

export const FONT_DISPLAY = "'Luckiest Guy', 'Lilita One', system-ui, sans-serif";
export const FONT_BODY = "'Poppins', system-ui, sans-serif";

export const NEBULA = `radial-gradient(120% 90% at 50% 40%, #7A4DE6 0%, #4327B0 32%, #1A1A78 60%, ${ST.navyDeep} 100%)`;

type Variant = 'primary' | 'secondary' | 'dark' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const palette: Record<Variant, { bg: string; fg: string; stroke: string; shadow: string }> = {
  primary:   { bg: ST.pink, fg: ST.white, stroke: ST.navy, shadow: ST.navy },
  secondary: { bg: ST.cyan, fg: ST.navy,  stroke: ST.navy, shadow: ST.navy },
  dark:      { bg: ST.navy, fg: ST.white, stroke: ST.navyDeep, shadow: ST.navyDeep },
  ghost:     { bg: 'transparent', fg: ST.white, stroke: 'rgba(255,255,255,0.4)', shadow: 'transparent' }
};

const sizes: Record<Size, { fs: number; px: number; py: number; sh: number }> = {
  sm: { fs: 13, px: 14, py: 8,  sh: 4 },
  md: { fs: 17, px: 22, py: 12, sh: 6 },
  lg: { fs: 22, px: 28, py: 16, sh: 8 }
};

export type STButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  readonly children: ReactNode;
  readonly variant?: Variant;
  readonly size?: Size;
  readonly full?: boolean;
  readonly icon?: IconName;
};

export const STButton = ({
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  icon,
  disabled = false,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  style,
  ...rest
}: STButtonProps) => {
  const [pressed, setPressed] = useState(false);
  const p = palette[variant];
  const s = sizes[size];
  const sh = pressed ? Math.max(2, s.sh - 4) : s.sh;
  const ty = pressed ? s.sh - sh : 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(event) => {
        if (!disabled) setPressed(true);
        onMouseDown?.(event);
      }}
      onMouseUp={(event) => {
        setPressed(false);
        onMouseUp?.(event);
      }}
      onMouseLeave={(event) => {
        setPressed(false);
        onMouseLeave?.(event);
      }}
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: s.fs,
        letterSpacing: '0.04em',
        lineHeight: 1,
        padding: `${s.py}px ${s.px}px`,
        background: disabled ? 'rgba(255,255,255,0.18)' : p.bg,
        color: disabled ? 'rgba(255,255,255,0.5)' : p.fg,
        border: `3px solid ${disabled ? 'rgba(255,255,255,0.18)' : p.stroke}`,
        borderRadius: 16,
        boxShadow: variant === 'ghost' || disabled ? 'none' : `0 ${sh}px 0 0 ${p.shadow}`,
        transform: `translateY(${ty}px)`,
        transition: 'transform 100ms cubic-bezier(.34,1.56,.64,1), box-shadow 100ms',
        textTransform: 'uppercase',
        width: full ? '100%' : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...style
      }}
      {...rest}
    >
      {icon ? <STIcon name={icon} size={s.fs + 2} color={p.fg} /> : null}
      <span>{children}</span>
    </button>
  );
};

export type STCardProps = {
  readonly children: ReactNode;
  readonly tone?: 'white' | 'pink' | 'cyan' | 'navy' | 'glass';
  readonly onClick?: () => void;
  readonly style?: CSSProperties;
  readonly padding?: number | string;
};

export const STCard = ({
  children,
  tone = 'white',
  onClick,
  style,
  padding = 18
}: STCardProps) => {
  const toneStyles: Record<NonNullable<STCardProps['tone']>, CSSProperties> = {
    white: { background: ST.white, color: ST.navy, border: `3px solid ${ST.navy}`, boxShadow: `0 6px 0 0 ${ST.navy}` },
    pink:  { background: ST.pink,  color: ST.white, border: `3px solid ${ST.navy}`, boxShadow: `0 6px 0 0 ${ST.navy}` },
    cyan:  { background: ST.cyan,  color: ST.navy,  border: `3px solid ${ST.navy}`, boxShadow: `0 6px 0 0 ${ST.navy}` },
    navy:  { background: ST.navy,  color: ST.white, border: `3px solid ${ST.navyDeep}`, boxShadow: `0 6px 0 0 ${ST.navyDeep}` },
    glass: {
      background: 'rgba(255,255,255,0.08)',
      color: ST.white,
      border: '2px solid rgba(255,255,255,0.18)',
      boxShadow: 'none',
      backdropFilter: 'blur(12px)'
    }
  };

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 22,
        padding,
        cursor: onClick ? 'pointer' : 'default',
        ...toneStyles[tone],
        ...style
      }}
    >
      {children}
    </div>
  );
};

export type STTitleProps = {
  readonly children: ReactNode;
  readonly size?: number;
  readonly color?: string;
  readonly stroke?: number;
  readonly shadow?: number;
  readonly as?: 'h1' | 'h2' | 'h3' | 'div';
  readonly style?: CSSProperties;
  readonly id?: string;
};

export const STTitle = ({
  children,
  size = 40,
  color = ST.white,
  stroke = 3,
  shadow = 5,
  as: Tag = 'div',
  style,
  id
}: STTitleProps) => (
  <Tag
    id={id}
    style={{
      fontFamily: FONT_DISPLAY,
      fontSize: size,
      lineHeight: 1.0,
      letterSpacing: '-0.005em',
      color,
      WebkitTextStroke: `${stroke}px ${ST.navy}`,
      paintOrder: 'stroke fill',
      textShadow: `${shadow}px ${shadow + 1}px 0 ${ST.navy}`,
      textTransform: 'uppercase',
      margin: 0,
      ...style
    }}
  >
    {children}
  </Tag>
);

export type STChipProps = {
  readonly children: ReactNode;
  readonly color?: string;
  readonly fg?: string;
  readonly icon?: IconName;
  readonly stroke?: boolean;
};

export const STChip = ({
  children,
  color = ST.white,
  fg = ST.navy,
  icon,
  stroke = true
}: STChipProps) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: color,
      color: fg,
      border: stroke ? `2px solid ${ST.navy}` : 'none',
      borderRadius: 999,
      padding: '4px 10px',
      fontFamily: FONT_BODY,
      fontWeight: 700,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      whiteSpace: 'nowrap'
    }}
  >
    {icon ? <STIcon name={icon} size={12} color={fg} /> : null}
    {children}
  </span>
);

export type STPillProps = {
  readonly children: ReactNode;
  readonly color?: string;
  readonly fg?: string;
  readonly icon?: IconName;
};

export const STPill = ({
  children,
  color = ST.yellow,
  fg = ST.navy,
  icon
}: STPillProps) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: color,
      color: fg,
      border: `2px solid ${ST.navy}`,
      borderRadius: 999,
      padding: '5px 12px',
      fontFamily: FONT_DISPLAY,
      fontSize: 13,
      letterSpacing: '0.04em',
      lineHeight: 1
    }}
  >
    {icon ? <STIcon name={icon} size={14} color={fg} /> : null}
    {children}
  </span>
);

export type LiveDotProps = { readonly color?: string };

export const LiveDot = ({ color = ST.cyan }: LiveDotProps) => (
  <span
    aria-hidden="true"
    style={{
      width: 8,
      height: 8,
      borderRadius: 999,
      background: color,
      boxShadow: `0 0 12px ${color}`,
      animation: 'st-pulse-soft 1.4s ease-in-out infinite',
      display: 'inline-block'
    }}
  />
);
