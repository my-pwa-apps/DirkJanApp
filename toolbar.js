(function initializeToolbar(global) {
  /**
   * Makes an absolutely positioned element draggable from a handle.
   * Callers supply snap/persist behavior so this helper stays UI-agnostic.
   * @param {HTMLElement} element
   * @param {HTMLElement} dragHandle
   * @param {object} [options]
   */
  function makeDraggable(element, dragHandle, options = {}) {
    if (!element || !dragHandle) return;

    const {
      keepHorizontallyCentered = false,
      onDragStart = null,
      onDragEnd = null,
      trySnap = null,
      persistPosition = null
    } = options;

    let isDragging = false;
    let offsetX, offsetY;
    let elementStartX, elementStartY;

    function onDown(e) {
      if (e.type === 'mousedown' && e.button !== 0) return;
      if (e.target.closest('button, input')) return;
      if (!(e.target === dragHandle || dragHandle.contains(e.target))) return;

      isDragging = true;
      element.style.cursor = 'grabbing';
      element.style.transition = 'none';

      const event = e.touches ? e.touches[0] : e;
      const rect = element.getBoundingClientRect();

      elementStartX = parseFloat(element.style.left) || rect.left + window.scrollX;
      elementStartY = parseFloat(element.style.top) || rect.top + window.scrollY;

      offsetX = event.clientX + window.scrollX - elementStartX;
      offsetY = event.clientY + window.scrollY - elementStartY;

      if (onDragStart) onDragStart(element);

      document.addEventListener('mousemove', onMove, { passive: false });
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchend', onUp);

      e.preventDefault();
    }

    function onMove(e) {
      if (!isDragging) return;
      e.preventDefault();

      const event = e.touches ? e.touches[0] : e;
      let newLeft = event.clientX - offsetX + window.scrollX;
      let newTop = event.clientY - offsetY + window.scrollY;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const docWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const docHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);

      if (keepHorizontallyCentered) {
        newLeft = (window.innerWidth - width) / 2;
      } else {
        newLeft = Math.max(0, Math.min(newLeft, docWidth - width));
      }

      newTop = Math.max(0, Math.min(newTop, docHeight - height));
      element.style.left = `${newLeft}px`;
      element.style.top = `${newTop}px`;
      element.style.transform = 'none';
    }

    function onUp() {
      if (!isDragging) return;

      isDragging = false;
      element.style.cursor = dragHandle === element ? 'grab' : '';

      let numericTop = parseFloat(element.style.top) || 0;
      let numericLeft = parseFloat(element.style.left) || 0;

      if (keepHorizontallyCentered) {
        numericLeft = (window.innerWidth - element.offsetWidth) / 2;
        element.style.left = numericLeft + 'px';
      }

      if (typeof trySnap === 'function') {
        const snapped = trySnap(numericTop, numericLeft, element);
        if (snapped && Number.isFinite(snapped.top) && Number.isFinite(snapped.left)) {
          numericTop = snapped.top;
          numericLeft = snapped.left;
        }
      }

      if (typeof persistPosition === 'function') {
        persistPosition(numericTop, numericLeft, element);
      }

      if (onDragEnd) onDragEnd(element);

      setTimeout(() => { element.style.transition = ''; }, 50);

      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
    }

    dragHandle.addEventListener('mousedown', onDown);
    dragHandle.addEventListener('touchstart', onDown, { passive: false });
  }

  global.TOOLBAR = Object.freeze({ makeDraggable });
})(globalThis);
