import type { CSSProperties, SVGProps } from 'react';

export type IconName =
  | 'mic'
  | 'mic-off'
  | 'keyboard'
  | 'send'
  | 'play'
  | 'pause'
  | 'stop'
  | 'swap'
  | 'arrow-right'
  | 'caret-right'
  | 'caret-down'
  | 'x'
  | 'check'
  | 'copy'
  | 'download'
  | 'rotate'
  | 'spark'
  | 'headphones'
  | 'globe'
  | 'flip'
  | 'dots'
  | 'info'
  | 'video'
  | 'video-off'
  | 'audio-bars'
  | 'camera'
  | 'image'
  | 'upload';

const PATHS: Record<IconName, string> = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a1 1 0 1 0-2 0 9 9 0 0 0 8 8.95V22a1 1 0 1 0 2 0v-1.05A9 9 0 0 0 21 12a1 1 0 1 0-2 0 7 7 0 1 1-14 0Z',
  'mic-off':
    'M3 3.7 4.3 2.4l16.3 16.3-1.3 1.3-3.4-3.4A6.96 6.96 0 0 1 13 20.95V22h-2v-1.05A9 9 0 0 1 3 12a1 1 0 1 1 2 0c0 1.9.66 3.64 1.77 5L3 13.23V13a1 1 0 0 1 .27-.68L3 12V3.7ZM9 6a3 3 0 0 1 6 0v3.18L9 3.18Z',
  keyboard:
    'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm2 3v2h2V9H5Zm0 4v2h2v-2H5Zm4-4v2h2V9H9Zm0 4v2h2v-2H9Zm4-4v2h2V9h-2Zm0 4v2h2v-2h-2Zm4-4v2h2V9h-2Zm0 4v2h2v-2h-2Zm-9 4h6v2H8v-2Z',
  send: 'M3.4 20.4 22 12 3.4 3.6 3 10l13 2-13 2 .4 6.4Z',
  play: 'M8 5v14l11-7L8 5Z',
  pause: 'M6 5h4v14H6V5Zm8 0h4v14h-4V5Z',
  stop: 'M6 6h12v12H6V6Z',
  swap: 'M7 7h11l-3-3 1.4-1.4L22 8l-5.6 5.4L15 12l3-3H7V7Zm10 10H6l3 3-1.4 1.4L2 16l5.6-5.4L9 12l-3 3h11v2Z',
  'arrow-right': 'M5 11h12l-5-5 1.4-1.4L21 12l-7.6 7.4L12 18l5-5H5v-2Z',
  'caret-right': 'M9 5l7 7-7 7V5Z',
  'caret-down': 'M5 9l7 7 7-7H5Z',
  x: 'M6.4 4.9 4.9 6.4 10.6 12l-5.7 5.6 1.5 1.5L12 13.4l5.6 5.7 1.5-1.5L13.4 12l5.7-5.6-1.5-1.5L12 10.6 6.4 4.9Z',
  check: 'M9.5 16.6 4.9 12l-1.4 1.4 6 6 12-12-1.4-1.4-10.6 10.6Z',
  copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z',
  download:
    'M5 20h14v2H5v-2Zm7-18v11.2l4.6-4.6L18 10l-7 7-7-7 1.4-1.4L10 13.2V2h2Z',
  rotate:
    'M12 6V3L7 8l5 5V9c2.8 0 5 2.2 5 5s-2.2 5-5 5a5 5 0 0 1-5-5H5a7 7 0 1 0 7-7Z',
  spark: 'M12 2l1.8 5.4L20 9l-4.8 2.6L12 17l-3.2-5.4L4 9l5.2-1.6L12 2Z',
  headphones:
    'M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h2v-8H5v-0a7 7 0 1 1 14 0h-3v8h2a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9Z',
  globe:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm7 9h-3.1a14 14 0 0 0-1.3-5A8 8 0 0 1 19 11Zm-7-7c1.3 0 2.9 2.7 3.3 7H8.7c.4-4.3 2-7 3.3-7ZM5 11a8 8 0 0 1 4.4-5 14 14 0 0 0-1.3 5H5Zm0 2h3.1a14 14 0 0 0 1.3 5A8 8 0 0 1 5 13Zm7 7c-1.3 0-2.9-2.7-3.3-7h6.6c-.4 4.3-2 7-3.3 7Zm2.6-2a14 14 0 0 0 1.3-5H19a8 8 0 0 1-4.4 5Z',
  flip: 'M3 12h6l-2-2 1.4-1.4L13 13l-4.6 4.4L7 16l2-2H3v-2Zm18 0h-6l2-2-1.4-1.4L11 13l4.6 4.4L17 16l-2-2h6v-2Z',
  dots: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z',
  video:
    'M4 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5l4 3v-9l-4 3V8a2 2 0 0 0-2-2H4Z',
  'video-off':
    'M3 3.7 4.3 2.4l18.3 18.3-1.3 1.3-2.4-2.4a2 2 0 0 1-1 .4H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.1-1.8L3 6V3.7Zm17 2.3v4l4-3v9l-4-3v.5l-9-9H14a2 2 0 0 1 2 2v.7l4-2.7Z',
  'audio-bars':
    'M3 10h3v4H3v-4Zm6-4h3v12H9V6Zm6 2h3v8h-3V8Z',
  camera:
    'M9.4 4 8 6H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-1.4-2H9.4Zm2.6 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  image:
    'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 12 4-4 3 3 5-6 4 5V6H4v10Zm4-7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z',
  upload:
    'M5 20h14v2H5v-2Zm7-18 7 7-1.4 1.4L13 5.8V16h-2V5.8L6.4 10.4 5 9l7-7Z'
};

export type STIconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
  readonly style?: CSSProperties;
};

export const STIcon = ({
  name,
  size = 20,
  color = 'currentColor',
  style,
  ...rest
}: STIconProps) => (
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    style={{ display: 'inline-block', flexShrink: 0, ...style }}
    {...rest}
  >
    <path d={PATHS[name]} fill={color} />
  </svg>
);
