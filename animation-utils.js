(function initializeAnimationUtils(global) {
  const SLIDE_MS = 450;
  const MORPH_MS = 550;

  /**
   * Shared slide/morph transition for the main comic and landscape view.
   * @param {HTMLImageElement} target
   * @param {string} newSrc
   * @param {string|null} direction
   * @param {object} [options]
   * @returns {Promise<void>}
   */
  function animateTransition(target, newSrc, direction, options = {}) {
    const {
      container = target?.parentElement,
      outgoingClass = 'comic-outgoing',
      morphClass = 'comic-morph-outgoing',
      preserveInlineStyles = false,
      afterIncomingLoad = null
    } = options;

    return new Promise(resolve => {
      if (!target || !newSrc) {
        resolve();
        return;
      }

      const finishIncoming = () => {
        if (typeof afterIncomingLoad === 'function') afterIncomingLoad(target);
      };

      if (!(target.src && target.src !== global.location?.href && direction) || !container) {
        target.src = newSrc;
        finishIncoming();
        resolve();
        return;
      }

      if (direction === 'next' || direction === 'prev') {
        const slideOutClass = direction === 'prev' ? 'slide-out-right' : 'slide-out-left';
        const slideInClass = direction === 'prev' ? 'slide-in-right' : 'slide-in-left';
        const tempImg = new Image();
        tempImg.onload = function() {
          const outgoingClone = target.cloneNode(true);
          outgoingClone.removeAttribute('id');
          outgoingClone.classList.add(outgoingClass);
          outgoingClone.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right', 'no-transition', 'loading', 'loaded', 'dissolve');
          if (preserveInlineStyles) {
            outgoingClone.style.cssText = target.style.cssText;
            outgoingClone.style.transition = 'transform 0.4s ease-out';
          }
          container.appendChild(outgoingClone);

          target.classList.add('no-transition');
          target.style.transition = preserveInlineStyles ? 'none' : target.style.transition;
          target.src = newSrc;
          target.classList.add(slideInClass);
          target.offsetHeight;
          outgoingClone.offsetHeight;
          target.classList.remove('no-transition');
          if (preserveInlineStyles) target.style.transition = '';

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              outgoingClone.classList.add(slideOutClass);
              target.classList.remove(slideInClass);
              finishIncoming();
              setTimeout(() => {
                outgoingClone.remove();
                resolve();
              }, SLIDE_MS);
            });
          });
        };
        tempImg.onerror = function() {
          target.src = newSrc;
          finishIncoming();
          resolve();
        };
        tempImg.src = newSrc;
        return;
      }

      const outgoingClone = target.cloneNode(true);
      outgoingClone.removeAttribute('id');
      outgoingClone.classList.remove('slide-in-left', 'slide-in-right', 'slide-out-left', 'slide-out-right', 'no-transition', 'loading', 'loaded', 'dissolve');
      outgoingClone.classList.add(morphClass);
      if (preserveInlineStyles) {
        outgoingClone.style.cssText = target.style.cssText;
        outgoingClone.style.transition = 'filter 0.5s ease-in-out, opacity 0.5s ease-in-out';
        const computedTransform = global.getComputedStyle?.(target).transform;
        outgoingClone.style.transform = computedTransform || 'none';
      }
      container.appendChild(outgoingClone);

      target.classList.add('no-transition');
      target.classList.remove('slide-in-left', 'slide-in-right', 'slide-out-left', 'slide-out-right');
      if (!preserveInlineStyles) target.style.transform = 'translateX(0)';
      else target.style.transition = 'none';
      target.offsetHeight;
      target.src = newSrc;

      const startMorph = () => {
        finishIncoming();
        requestAnimationFrame(() => {
          outgoingClone.classList.add('morph-out');
        });
        setTimeout(() => {
          outgoingClone.remove();
          target.classList.remove('no-transition');
          if (!preserveInlineStyles) target.style.transform = '';
          else target.style.transition = '';
          resolve();
        }, MORPH_MS);
      };

      if (target.complete) startMorph();
      else target.addEventListener('load', startMorph, { once: true });
    });
  }

  global.COMIC_ANIMATION = Object.freeze({ animateTransition });
})(globalThis);
