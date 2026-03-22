import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';

/**
 * `'bottom-end'` — dropdown below trigger, right edges aligned (Header style)
 * `'right-end'`  — dropdown to the right of trigger, bottom edges aligned (Sidebar style)
 */
type Placement = 'bottom-end' | 'right-end';

interface HoverPopupMenuProps {
  /** Render trigger element; receives `isOpen` for active styling */
  trigger: (isOpen: boolean) => React.ReactNode;
  /** Menu content; receives `close` callback for imperative close (e.g. on item click) */
  children: (close: () => void) => React.ReactNode;
  /** Extra className for the visible dropdown card (bg, padding, border-radius, min-w, etc.) */
  contentClassName?: string;
  /** Delay (ms) before closing after mouse leaves both trigger and dropdown. Default: 300 */
  closeDelay?: number;
  /** Where the dropdown appears relative to the trigger. Default: `'bottom-end'` */
  placement?: Placement;
  /** Gap (px) between trigger and dropdown. Default: 4 for bottom-end, 12 for right-end */
  gap?: number;
}

/**
 * Hover-activated popup menu that works reliably inside Electron's drag-region.
 *
 * **Problem**: Electron's `-webkit-app-region: drag` sets `relatedTarget = undefined`
 * on mouse events, causing React to fire spurious `mouseLeave` even when the pointer
 * is still inside a child (`position: fixed` dropdown).
 *
 * **Solution**: Instead of relying on `mouseEnter / mouseLeave` for closing, a
 * `document.mousemove` listener is attached while the dropdown is open and
 * continuously hit-tests the pointer against both trigger and dropdown rects.
 *
 * The dropdown is rendered via `createPortal(document.body)` to escape the parent's
 * stacking context (e.g. header `z-[1000]`), ensuring `z-[9999]` is truly global.
 */
export const HoverPopupMenu: React.FC<HoverPopupMenuProps> = ({
  trigger,
  children,
  contentClassName = '',
  closeDelay = 300,
  placement = 'bottom-end',
  gap,
}) => {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  rectRef.current = rect;

  const cancelClose = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const open = useCallback(() => {
    cancelClose();
    if (!rectRef.current && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
  }, [cancelClose]);

  const close = useCallback(() => {
    cancelClose();
    setRect(null);
  }, [cancelClose]);

  // Auto-close via mousemove tracking while dropdown is open
  useEffect(() => {
    if (!rect) return;

    const hitTest = (cx: number, cy: number) => {
      const inside = (el: HTMLElement | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
      };
      return inside(triggerRef.current) || inside(dropdownRef.current);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (hitTest(e.clientX, e.clientY)) {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      } else if (timerRef.current === null) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          setRect(null);
        }, closeDelay);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      cancelClose();
    };
  }, [rect, closeDelay, cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  const isOpen = rect !== null;

  // Compute dropdown position based on placement
  let dropdownStyle: React.CSSProperties = {};
  if (rect) {
    if (placement === 'right-end') {
      const g = gap ?? 12;
      dropdownStyle = { left: rect.right + g, bottom: window.innerHeight - rect.bottom };
    } else {
      const g = gap ?? 4;
      dropdownStyle = { right: window.innerWidth - rect.right, top: rect.bottom + g };
    }
  }

  return (
    <>
      <div ref={triggerRef} onMouseEnter={open}>
        {trigger(isOpen)}
      </div>

      {isOpen && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] no-drag animate-in fade-in"
          style={dropdownStyle}
        >
          <div className={`bg-[var(--bg-sidebar)] border border-[var(--border-color)] shadow-2xl backdrop-blur-2xl ${contentClassName}`}>
            {children(close)}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
