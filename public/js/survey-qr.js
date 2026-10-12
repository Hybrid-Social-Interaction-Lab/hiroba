// Demo survey QR badge: a small, unobtrusive corner link to the feedback form.
// Included on every page (lobby/session, admin, guides); grows on hover so it
// can be scanned from a phone.
(function () {
  const FORM_URL =
    'https://docs.google.com/forms/d/e/1FAIpQLScKvaTe8spGREE8RgOBuqzIhbMAXghsB1_OHqH32jL9_y-hXw/viewform';
  // Resolve the image next to this script so nested pages (guides/) work too.
  const QR_SRC = new URL('../survey-qr.svg', document.currentScript.src).href;

  const css = `
    #survey-qr {
      position: fixed;
      left: 12px;
      bottom: 76px; /* clear the 64px call toolbar */
      z-index: 10000; /* above full-screen overlays (lobby, admin auth: 9999) */
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 4px 4px 3px;
      background: #fff;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      opacity: 0.7;
      text-decoration: none;
      transition: opacity 0.2s ease;
    }
    #survey-qr:hover, #survey-qr:focus-visible { opacity: 1; }
    #survey-qr img {
      display: block;
      width: 64px;
      height: 64px;
      transition: width 0.2s ease, height 0.2s ease;
    }
    #survey-qr:hover img, #survey-qr:focus-visible img { width: 180px; height: 180px; }
    #survey-qr span {
      font: 500 9px/1.2 'Rubik', system-ui, sans-serif;
      color: #444;
      letter-spacing: 0.02em;
    }
  `;

  function mount() {
    if (document.getElementById('survey-qr')) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const link = document.createElement('a');
    link.id = 'survey-qr';
    link.href = FORM_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Survey (Google Forms)';
    link.innerHTML = `<img src="${QR_SRC}" alt="Survey QR code"><span>Survey</span>`;
    document.body.appendChild(link);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
