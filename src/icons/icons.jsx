// Minimal monochrome line icons. Each accepts standard SVG props (className,
// style, etc.) so callers can size/color them via the "icon" CSS class or
// inline style overrides, same as the rest of the design system.

const base = { viewBox: '0 0 24 24', className: 'icon' };

export function HomeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-7h4v7h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}
export function ChatIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}
export function BriefcaseIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7" width="18" height="12.5" rx="2" />
      <path d="M8 7V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V7" />
      <path d="M3 12.5h18" />
    </svg>
  );
}
export function CalendarIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}
export function ShieldIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l7 3v5.5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6l7-3Z" />
    </svg>
  );
}
export function UsersIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="9" r="2.3" />
      <path d="M15.7 14.2c2 .5 3.5 2.4 3.8 4.8" />
    </svg>
  );
}
export function BuildingIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="10" width="16" height="11" rx="1" />
      <path d="M9 21v-6h6v6" />
      <path d="M4 10 12 3l8 7" />
    </svg>
  );
}
export function LockIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
export function BagIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
export function PlaneIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M2 21l20-9L2 3v7l14 2-14 2v7Z" />
    </svg>
  );
}
export function DotsIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" style={{ stroke: 'currentColor', strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function CheckBigIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function AlertIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 22 20H2L12 3Z" />
      <path d="M12 9v5" />
      <circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function ArrowRightIcon(props) {
  return (
    <svg {...base} style={{ width: 14, height: 14 }} {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}
export function SendIcon(props) {
  return (
    <svg {...base} style={{ width: 16, height: 16, color: '#fff' }} {...props}>
      <path d="M2 21l20-9L2 3v7l14 2-14 2v7Z" />
    </svg>
  );
}
export function InfoIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v6" />
      <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function SearchIcon(props) {
  return (
    <svg {...base} style={{ width: 16, height: 16, color: 'var(--ink-faint)' }} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
export function StarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'currentColor', stroke: 'none' }} {...props}>
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8L12 2.5z" />
    </svg>
  );
}
export function UserIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c0-4 3.4-6.8 7.5-6.8s7.5 2.8 7.5 6.8" />
    </svg>
  );
}
export function PhoneIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4.5h3l1.8 4.4-1.9 1.6a11 11 0 0 0 5.6 5.6l1.6-1.9 4.4 1.8v3a1.5 1.5 0 0 1-1.6 1.5C10.5 20.1 4 13.6 3.5 6.1A1.5 1.5 0 0 1 5 4.5Z" />
    </svg>
  );
}
export function MailIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 6.5 8 6 8-6" />
    </svg>
  );
}
export function PinIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s7-6.7 7-11.7A7 7 0 0 0 5 9.3C5 14.3 12 21 12 21Z" />
      <circle cx="12" cy="9.3" r="2.2" />
    </svg>
  );
}
export function LogoutIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H9" />
      <path d="M15.5 16l4-4-4-4" />
      <path d="M19 12H9.5" />
    </svg>
  );
}
export function SunIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
export function MoonIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2Z" />
    </svg>
  );
}
export function ChevronIcon(props) {
  return (
    <svg {...base} style={{ width: 15, height: 15 }} {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
export function ReceiptIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3h12v18l-2.5-1.5L13 21l-1-1.5L11 21l-2.5-1.5L6 21V3Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}
export function GoogleGIcon(props) {
  // Generic circular monogram, not Google's official multi-color mark —
  // kept monochrome to match this app's icon language.
  return (
    <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} {...props}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" stroke="none" fontFamily="Inter, sans-serif">
        G
      </text>
    </svg>
  );
}
export function AppleFruitIcon(props) {
  // A generic, abstracted fruit-with-leaf silhouette — intentionally not a
  // reproduction of Apple Inc.'s trademarked logo artwork.
  return (
    <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'currentColor', stroke: 'none' }} {...props}>
      <path d="M15.5 8.2c-1 0-1.9.5-2.5 1.1-.6-.6-1.5-1.1-2.5-1.1-2 0-3.7 1.7-3.7 4.4 0 3.1 2.3 6.9 4.3 6.9.8 0 1.2-.5 1.9-.5s1.1.5 1.9.5c2 0 4.3-3.6 4.3-6.5 0-.1 0-.2 0-.3-1.3-.2-2.2-1.4-2.2-2.7 0-.6.2-1.2.5-1.7Z" />
      <path d="M12.6 7.6c.2-1 1-1.9 2-2.1.1.9-.2 1.9-.8 2.5-.5.6-1.3.9-2 .8 0-.4.2-.9.8-1.2Z" />
    </svg>
  );
}
export function PlusIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function TrashIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
export function MicIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
export function SpeakerIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10v4h4l5 4V6L8 10H4Z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}
export function SpeakerOffIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10v4h4l5 4V6L8 10H4Z" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </svg>
  );
}
export function MicOffIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M15 10V6a3 3 0 0 0-5.7-1.3" />
      <path d="M9 9v2a3 3 0 0 0 4.9 2.3" />
      <path d="M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8" />
      <path d="M12 18v3M3 3l18 18" />
    </svg>
  );
}
