// 선 아이콘 (24×24, stroke). 이모지 대신 쓴다.
const PATHS: Record<string, string> = {
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4.5v15l12-7.5z',
  forward: 'M4 5l8 7-8 7zM12 5l8 7-8 7z',
  close: 'M6 6l12 12M18 6L6 18',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5h14v-5',
  download: 'M12 4v11M7 10l5 5 5-5M5 19h14',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 100-18 9 9 0 000 18z',
  auto: 'M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M18 3v4h-4M6 21v-4h4',
};

export function Icon({ name, className = 'size-5', label }: { name: keyof typeof PATHS | string; className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={PATHS[name]} />
    </svg>
  );
}
