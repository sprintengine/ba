import { cn } from "@/lib/utils";
import s from "./iphone.module.css";

/** The status bar's three glyphs, drawn to their size at 393 points. */
function StatusIcons() {
  return (
    <span className={s.statusIcons} aria-hidden>
      <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx="0.8" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
        <rect x="10" y="3" width="3" height="9" rx="0.8" />
        <rect x="15" y="0" width="3" height="12" rx="0.8" />
      </svg>
      <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
        <path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5.1.1.3.1.4 0l1.2-1.2c.1-.1.1-.3 0-.5A11.3 11.3 0 0 0 8.5 0C5.6 0 2.8 1.1.6 3.100c-.1.2-.1.4 0 .5l1.2 1.200c.1.1.3.1.4 0a9.1 9.1 0 0 1 6.3-2.500Z" />
        <path d="M8.5 6.200c1.3 0 2.6.5 3.6 1.4.1.1.3.1.4 0l1.2-1.200c.1-.1.1-.3 0-.5a7.5 7.5 0 0 0-10.4 0c-.1.2-.1.4 0 .5l1.2 1.200c.1.1.3.1.4 0a5.3 5.3 0 0 1 3.6-1.400Z" />
        <path d="M11 8.900c.1.1.1.3 0 .5l-2.3 2.400c-.1.1-.3.1-.4 0L6 9.400c-.1-.2-.1-.4 0-.5a3.6 3.6 0 0 1 5 0Z" />
      </svg>
      <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
        <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" strokeOpacity="0.38" />
        <rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor" />
        <path d="M25 4.500v4c.8-.3 1.5-1.1 1.5-2s-.7-1.7-1.5-2Z" fill="currentColor" fillOpacity="0.45" />
      </svg>
    </span>
  );
}

/**
 * The phones on the home page: a drawn iPhone with a real 393 by 852 screen, so what goes inside is laid out at phone
 * size and scaled with the frame. Set `--iphone-scale` from the parent (a class, per breakpoint); a measured width
 * isn't needed, and the frame takes the same space in the server's HTML.
 */
export function IPhone({
  children,
  time = "9:41",
  className,
}: {
  children?: React.ReactNode;
  time?: string;
  className?: string;
}) {
  return (
    <div className={cn(s.device, className)}>
      <div className={s.body}>
        <span className={cn(s.button, s.left)} style={{ top: 168, height: 32 }} />
        <span className={cn(s.button, s.left)} style={{ top: 232, height: 62 }} />
        <span className={cn(s.button, s.left)} style={{ top: 308, height: 62 }} />
        <span className={cn(s.button, s.right)} style={{ top: 268, height: 100 }} />
        <div className={s.frame}>
          <i className={s.band} style={{ top: 96, left: 0 }} />
          <i className={s.band} style={{ top: 96, right: 0 }} />
          <i className={s.band} style={{ bottom: 96, left: 0 }} />
          <i className={s.band} style={{ bottom: 96, right: 0 }} />
          <i className={s.band} style={{ top: 0, right: 92, width: 2, height: 5 }} />
          <i className={s.band} style={{ bottom: 0, left: 92, width: 2, height: 5 }} />
          <div className={s.glass}>
            <div className={s.screen}>
              <div className={s.status}>
                <span className="tnum">{time}</span>
                <StatusIcons />
              </div>
              <div className={s.island} />
              {children}
              <div className={s.homeIndicator} />
              <div className={s.sheen} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
