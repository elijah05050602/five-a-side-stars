/**
 * Drag one player onto another to swap them, with a mouse, a pen or a finger.
 * Anything marked `data-swap="<player id>"` inside `root` can be picked up and dropped on.
 * Mouse and pen drag straight away. A finger drags straight away on elements marked
 * `data-swap-instant` (the little pitch, which never scrolls); elsewhere it needs a short
 * hold first so the squad row still scrolls. A tap stays a tap: no swap, and the click goes through.
 */
export function wireDragSwap(root: HTMLElement, onSwap: (fromId: string, toId: string) => void): () => void {
  const HOLD_MS = 280;
  const MOVE_PX = 7;
  let drag: {
    id: string; el: Element; x: number; y: number; pointerId: number;
    instant: boolean; armed: boolean; moving: boolean; hold: number; ghost: HTMLElement | null; over: Element | null;
  } | null = null;

  const targetAt = (x: number, y: number): Element | null => {
    const hit = document.elementFromPoint(x, y)?.closest('[data-swap]') ?? null;
    return hit && root.contains(hit) ? hit : null;
  };
  const setOver = (el: Element | null) => {
    if (!drag || drag.over === el) return;
    drag.over?.classList.remove('is-drop-target');
    drag.over = el && el !== drag.el ? el : null;
    drag.over?.classList.add('is-drop-target');
  };
  const end = () => {
    if (!drag) return;
    window.clearTimeout(drag.hold);
    drag.ghost?.remove();
    drag.el.classList.remove('is-lifted', 'is-dragging');
    drag.over?.classList.remove('is-drop-target');
    document.body.classList.remove('is-drag-swapping');
    drag = null;
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const el = (e.target as Element).closest('[data-swap]');
    if (!el || !root.contains(el)) return;
    end();
    const instant = e.pointerType !== 'touch' || el.closest('[data-swap-instant]') !== null;
    drag = { id: (el as HTMLElement).dataset.swap!, el, x: e.clientX, y: e.clientY, pointerId: e.pointerId, instant, armed: instant, moving: false, hold: 0, ghost: null, over: null };
    if (!instant) {
      drag.hold = window.setTimeout(() => {
        if (!drag) return;
        drag.armed = true;
        drag.el.classList.add('is-lifted');
        navigator.vibrate?.(12);
      }, HOLD_MS);
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const far = Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > MOVE_PX;
    if (!drag.armed) { if (far) end(); return; }
    if (!drag.moving) {
      if (!far) return;
      drag.moving = true;
      drag.el.classList.add('is-dragging');
      document.body.classList.add('is-drag-swapping');
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = (drag.el as HTMLElement).dataset.swapLabel ?? '';
      document.body.appendChild(ghost);
      drag.ghost = ghost;
    }
    drag.ghost!.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    setOver(targetAt(e.clientX, e.clientY));
  };

  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { moving, id, armed, instant } = drag;
    const over = moving ? targetAt(e.clientX, e.clientY) : null;
    const toId = over && over !== drag.el ? (over as HTMLElement).dataset.swap : undefined;
    end();
    if (moving || (armed && !instant)) {
      // A drag (or a held finger) is not a tap: swallow the click it would make.
      const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    }
    if (toId && toId !== id) onSwap(id, toId);
  };

  // Once a finger has picked a player up, stop the page from scrolling under it.
  const onTouchMove = (e: TouchEvent) => { if (drag?.armed) e.preventDefault(); };
  const onCancel = () => end();

  root.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  return () => {
    end();
    root.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('touchmove', onTouchMove);
  };
}
