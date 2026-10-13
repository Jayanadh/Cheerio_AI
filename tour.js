// Product tour: spotlights real UI one step at a time. It only reads the DOM and clicks
// existing controls, so the troubleshooting app doesn't know it exists.
// Cards and spotlight are popovers, so they can sit above the modal drawer; while a step
// is inside the drawer they're moved into the <dialog>, otherwise the modal makes them inert.

export const TOUR_STEPS = [
  {
    target: '#rules-body tr.is-focus',
    title: 'Keyword auto-replies live here',
    body: '“Pricing reply” sends an automatic answer when a customer messages PRICE. In this demo, it has stopped replying.',
  },
  {
    target: '.card-head [data-open]',
    title: 'Help where the problem shows up',
    body: 'Customers open the guide right from the Keywords page, instead of searching a help centre or raising a ticket.',
  },
  {
    target: '.proto',
    title: 'Prototype controls',
    body: 'Only for this demo: load any of the four scenarios, or press Reset demo to put the data back.',
  },
  {
    target: '#rules-body [data-open]',
    title: 'Try it',
    body: 'Click Troubleshoot on the Pricing reply rule.',
    opensDrawer: true,
    nextLabel: 'Open it for me',
  },
  {
    target: '#stages',
    inDrawer: true,
    prefer: 'left',
    title: 'One question at a time',
    body: 'The guide moves through Describe, Check, Fix and Test. Back always keeps your answers.',
  },
  {
    target: '.drawer-foot [data-action="escalate"]',
    inDrawer: true,
    prefer: 'left',
    title: 'Human help, one click away',
    body: 'At any step, customers can get a ready-to-send summary instead of explaining everything again.',
  },
  {
    target: '[data-action="symptom"][data-value="no-reply"]',
    inDrawer: true,
    prefer: 'left',
    finishOnTargetClick: true,
    title: 'Your turn',
    body: 'Choose “My auto-reply did not arrive” to follow the fix. Everything here is demo data, and nothing is sent.',
    nextLabel: 'Finish',
  },
];

// Where the card goes around the spotlighted target, kept inside the viewport.
export function placeCard(target, card, view, { prefer, gap = 12, margin = 12 } = {}) {
  if (!target) return { top: (view.height - card.height) / 2, left: (view.width - card.width) / 2, side: 'center' };
  if (view.width < 640) {
    // Phones: dock to whichever half of the screen the target isn't in.
    const targetInLowerHalf = target.top + target.height / 2 > view.height / 2;
    return targetInLowerHalf
      ? { top: margin, left: margin, side: 'top' }
      : { top: view.height - card.height - margin, left: margin, side: 'bottom' };
  }
  const clampX = (x) => Math.min(Math.max(x, margin), view.width - card.width - margin);
  const clampY = (y) => Math.min(Math.max(y, margin), view.height - card.height - margin);
  const left = clampX(target.left + target.width / 2 - card.width / 2);
  if (prefer === 'left' && target.left - gap - card.width >= margin) {
    return { top: clampY(target.top), left: target.left - gap - card.width, side: 'left' };
  }
  if (target.bottom + gap + card.height <= view.height - margin) return { top: target.bottom + gap, left, side: 'bottom' };
  if (target.top - gap - card.height >= margin) return { top: target.top - gap - card.height, left, side: 'top' };
  return { top: clampY(view.height - card.height - margin), left, side: 'bottom' };
}

const SEEN_KEY = 'cheerio-troubleshoot-tour-seen';

export function initTour() {
  const $ = (sel) => document.querySelector(sel);
  const drawer = $('#drawer');
  const card = $('#tour-card');
  const spot = $('#tour-spot');
  const prompt = $('#tour-prompt');
  const backBtn = card.querySelector('[data-tour="back"]');
  const nextBtn = card.querySelector('[data-tour="next"]');
  let index = -1;
  let frame = 0;
  let lastKey = '';
  let returnFocus = null;

  // Remembering the tour is a per-viewer convenience; private windows may refuse storage.
  const remember = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } };
  const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };

  function lift(el, host) {
    if (el.parentElement !== host) {
      if (el.matches(':popover-open')) el.hidePopover();
      host.append(el);
    }
    if (!el.matches(':popover-open')) el.showPopover();
  }

  function render() {
    const step = TOUR_STEPS[index];
    const host = step.inDrawer ? drawer : document.body;
    $('#tour-count').textContent = `Step ${index + 1} of ${TOUR_STEPS.length}`;
    $('#tour-title').textContent = step.title;
    $('#tour-body').textContent = step.body;
    backBtn.hidden = index === 0;
    nextBtn.textContent = step.nextLabel ?? 'Next';
    lift(spot, host);
    lift(card, host); // after the spotlight, so the card stays on top
    lastKey = '';
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector(step.target)?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    nextBtn.focus({ preventScroll: true });
    cancelAnimationFrame(frame);
    follow();
  }

  // Re-measure every frame: targets move with scrolling, resizing and app re-renders.
  function follow() {
    const step = TOUR_STEPS[index];
    const el = document.querySelector(step.target);
    const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null;
    const c = card.getBoundingClientRect();
    const key = [r?.top, r?.left, r?.width, r?.height, c.width, c.height, innerWidth, innerHeight].join('|');
    if (key !== lastKey) {
      lastKey = key;
      const pad = 6;
      const box = r && { top: r.top - pad, left: r.left - pad, width: r.width + 2 * pad, height: r.height + 2 * pad, bottom: r.bottom + pad, right: r.right + pad };
      spot.style.visibility = box ? 'visible' : 'hidden';
      if (box) Object.assign(spot.style, { top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` });
      const p = placeCard(box, { width: c.width, height: c.height }, { width: innerWidth, height: innerHeight }, { prefer: step.prefer });
      Object.assign(card.style, { top: `${p.top}px`, left: `${p.left}px` });
    }
    frame = requestAnimationFrame(follow);
  }

  function go(i) {
    index = i;
    if (!TOUR_STEPS[i].inDrawer && drawer.open) $('#drawer [data-action="close"]').click();
    render();
  }

  function start() {
    remember();
    prompt.hidden = true;
    returnFocus = document.activeElement;
    go(0);
  }

  function end() {
    if (index < 0) return;
    index = -1;
    cancelAnimationFrame(frame);
    for (const el of [card, spot]) {
      if (el.matches(':popover-open')) el.hidePopover();
      document.body.append(el);
    }
    (drawer.open ? $('#step-title') : returnFocus?.isConnected ? returnFocus : null)?.focus();
  }

  function next() {
    const step = TOUR_STEPS[index];
    if (step.opensDrawer) $('#rules-body [data-open]').click(); // the drawer observer moves the tour on
    else if (index === TOUR_STEPS.length - 1) end();
    else go(index + 1);
  }

  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-tour]')?.dataset.tour;
    if (action === 'start') return start();
    if (action === 'dismiss') { remember(); prompt.hidden = true; return; }
    if (action === 'skip') return end();
    if (action === 'back') return go(index - 1);
    if (action === 'next') return next();
    if (e.target.closest('[data-open]')) { remember(); prompt.hidden = true; } // found the feature on their own
    const step = TOUR_STEPS[index];
    if (step?.finishOnTargetClick && e.target.closest(step.target)) end();
  });

  // Esc leaves the tour first; the drawer stays open.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || index < 0) return;
    e.preventDefault();
    e.stopPropagation();
    end();
  }, true);

  new MutationObserver(() => {
    const step = TOUR_STEPS[index];
    if (!step) return;
    if (drawer.open && step.opensDrawer) go(index + 1);
    else if (!drawer.open && step.inDrawer) end(); // drawer closed mid-tour
  }).observe(drawer, { attributes: true, attributeFilter: ['open'] });

  if (!seen()) prompt.hidden = false;
}
