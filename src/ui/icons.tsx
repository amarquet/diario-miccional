/** Ícones SVG em linha (decorativos: aria-hidden; o texto acompanha sempre). */
import type { SVGProps } from 'react';

type IconName =
  | 'drop'
  | 'toilet'
  | 'home'
  | 'book'
  | 'chart'
  | 'gear'
  | 'plus'
  | 'close'
  | 'chevron'
  | 'back'
  | 'moon'
  | 'sun'
  | 'trash'
  | 'copy'
  | 'download'
  | 'upload'
  | 'lock'
  | 'info'
  | 'alert'
  | 'bell'
  | 'calendar'
  | 'doc'
  | 'note'
  | 'leak'
  | 'share'
  | 'check';

const PATHS: Record<IconName, string> = {
  drop: 'M12 3.2c3 3.6 6 7.3 6 10.8a6 6 0 0 1-12 0c0-3.5 3-7.2 6-10.8Z',
  toilet: 'M7 3h5v6H7zM5 9h14v1.5a7 7 0 0 1-7 7h0a7 7 0 0 1-7-7V9Zm4 8.2L8.2 21h7.6L15 17.2',
  home: 'M3.5 10.5 12 3.5l8.5 7M5.5 9v11h13V9M10 20v-5.5h4V20',
  book: 'M4.5 5.2A2.2 2.2 0 0 1 6.7 3h12.8v15H6.7a2.2 2.2 0 0 0-2.2 2.2V5.2Zm0 15a2.2 2.2 0 0 0 2.2 1.8h12.8M8.5 7.5h7M8.5 11h5',
  chart: 'M4 20h16M7 16.5V11M12 16.5V6.5M17 16.5v-8',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7.4-3.2c0-.5 0-1-.1-1.4l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.4-1.4L14.1 3h-4.2l-.4 2.2a7.6 7.6 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2.8l-2 1.6 2 3.4 2.4-1c.7.6 1.5 1.1 2.4 1.4l.4 2.2h4.2l.4-2.2c.9-.3 1.7-.8 2.4-1.4l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.4Z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'm9 5 7 7-7 7',
  back: 'm15 5-7 7 7 7',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6',
  trash: 'M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4.5 19.5h15',
  upload: 'M12 15.5V4.5m0 0L7.5 9M12 4.5 16.5 9M4.5 19.5h15',
  lock: 'M6.5 10.5h11v9.5h-11zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6m0-8.6v.1',
  alert: 'M12 4 2.8 19.5h18.4L12 4Zm0 5.5v4.5m0 2.6v.1',
  bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 20.5a2 2 0 0 0 4 0',
  calendar: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5V7M15.5 3.5V7',
  doc: 'M6.5 3h8l3.5 3.5V21h-11.5zM14.5 3v4h3.5M9 12h6M9 15.5h6',
  note: 'M5 4.5h14v15H5zM8.5 9h7M8.5 12.5h7M8.5 16h4',
  leak: 'M12 3.5c2.4 2.9 4.8 5.8 4.8 8.6a4.8 4.8 0 0 1-9.6 0c0-2.8 2.4-5.7 4.8-8.6ZM6 20.5h2M11 20.5h2M16 20.5h2',
  share: 'M12 3.5v11M8 7.5l4-4 4 4M6 11H4.5v9.5h15V11H18',
  check: 'm5 12.5 4.5 4.5L19 7.5',
};

export function Icon({ name, size = 22, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type { IconName };
