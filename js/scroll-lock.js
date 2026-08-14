/**
 * Vintus Performance — iOS-safe body scroll lock
 *
 * body.style.overflow='hidden' alone doesn't reliably stop background
 * touch/rubber-band scroll bleed-through on iOS Safari when a modal is
 * open. Pinning the body to position:fixed at its current scroll offset
 * (and restoring it on unlock) is the standard robust fix. Nestable via
 * a counter so two overlapping modals don't unlock the page when only
 * the inner one closes.
 */

var _scrollLockCount = 0;
var _scrollLockY = 0;

function lockBodyScroll() {
  if (_scrollLockCount === 0) {
    _scrollLockY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + _scrollLockY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }
  _scrollLockCount++;
}

function unlockBodyScroll() {
  if (_scrollLockCount === 0) return;
  _scrollLockCount--;
  if (_scrollLockCount === 0) {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, _scrollLockY);
  }
}
