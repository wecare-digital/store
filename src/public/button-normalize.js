import wixWindow from 'wix-window-frontend';
import wixLocation from 'wix-location-frontend';

const CSS = `
[data-testid*="buttonElement"],[class*="StylableButton"],[class*="stylablebutton"],button[class*="wixui-button"],[data-hook="button-content"]{border-radius:13px!important}
[data-testid*="buttonElement"] a,[class*="StylableButton"] a,[class*="stylablebutton"] a,button[class*="wixui-button"] a,[data-hook="button-content"] a,[data-testid*="linkElement"][class*="button"]{text-decoration:none!important}
a[data-testid*="linkElement"][class*="button"],a[class*="StylableButton"],a[class*="stylablebutton"]{border-radius:13px!important;text-decoration:none!important}
[data-hook="submit-button"],[class*="form-submit"],button[type="submit"]{border-radius:13px!important}
[data-hook="read-more-button"],[data-hook="add-to-cart-button"],[data-hook="buy-now-button"],[class*="addToCartButton"],[class*="readMoreButton"]{border-radius:13px!important;text-decoration:none!important}
[data-testid*="menuButton"],[class*="menu-button"]{border-radius:13px!important}
a[class*="cta"],a[class*="CTA"],a[class*="action-button"]{text-decoration:none!important}
`;

let injected = false;
function inject() {
  if (injected || typeof document === 'undefined') return;
  try { const s = document.createElement('style'); s.id = 'wc-btn'; s.textContent = CSS; document.head.appendChild(s); injected = true; } catch {}
}

export function initButtonNormalize() {
  if (wixWindow.rendering.env !== 'browser') return;
  inject();
  try { wixLocation.onChange(() => setTimeout(inject, 100)); } catch {}
}

export default { initButtonNormalize };
