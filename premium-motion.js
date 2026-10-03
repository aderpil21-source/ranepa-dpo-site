/* Shared Motion controller. Vendored Motion 12.23.24; no CDN or runtime install. */
(() => {
  'use strict';
  if (window.SiteMotion) return;
  const api = window.Motion;
  if (!api?.animate || !api?.inView || !api?.hover || !api?.scroll) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const selectors = '.card,.contact-card,.main-contact-box,.faq-item,.audience-card,.material-card,.payment-card,.meta-card,.side-card,.related-card,.topic-grid li,.lesson,.timeline-card,.doc-card';
  const modalSelector = '.modal-overlay,.section-modal,.requisites-modal,.deep-view,.enroll-overlay,.schedule-overlay';
  const boxSelector = '.modal-box,.section-modal-box,.requisites-dialog,.deep-view-shell,.enroll-box,.schedule-container';
  const records = new Map();
  const batches = new Set();
  const appeared = new WeakSet();
  const seen = new Set(); // Stable IDs survive tab copies and DOM replacement within this page.
  const opened = new WeakMap();
  const scrollDisposers = [];
  const ease = [0.22, 1, 0.36, 1];
  let mutations, frame = 0, running = false;
  const queued = new Set();

  function key(el) {
    const id = el.dataset.siteProgramId || el.dataset.motionKey || el.dataset.openid || el.dataset.siteVisibilityKey || el.id;
    return id ? (el.dataset.siteProgramId ? 'program:' : 'item:') + id : null;
  }
  function stop(rec) {
    rec.control?.stop();
    rec.control = null;
  }
  function settle(el, rec) {
    stop(rec);
    el.style.opacity = '1';
    el.style.translate = '0px 0px';
  }
  function play(el, values, options = {}) {
    const rec = records.get(el);
    if (!rec || !running || reduce.matches) return;
    stop(rec);
    const control = api.animate(el, values, {duration: 0.32, ease, ...options});
    rec.control = control;
    control.then(() => {
      if (rec.control === control) rec.control = null;
    });
  }
  function bindHover(el, rec) {
    if (rec.hover || !fine.matches || reduce.matches || el.matches('.faq-item,.main-contact-box')) return;
    rec.hover = api.hover(el, () => {
      // Retarget rather than enqueue hover over a still-running entrance.
      appeared.add(el);
      if (key(el)) seen.add(key(el));
      if (rec.batch) {releaseBatch(rec.batch, el); rec.batch = null;}
      settle(el, rec);
      play(el, {translate: '0px -3px'}, {type: 'spring', stiffness: 380, damping: 32});
      return () => play(el, {translate: '0px 0px'}, {type: 'spring', stiffness: 380, damping: 32});
    });
  }
  function releaseBatch(batch, el) {
    batch.pending.delete(el);
    if (!batch.pending.size) {
      batch.dispose?.();
      batches.delete(batch);
    }
  }
  function scan(root = document) {
    if (!running) return;
    const matches = [...root.querySelectorAll(selectors)];
    if (root.matches?.(selectors)) matches.unshift(root);
    const fresh = [];
    for (const el of matches) {
      // Animate the outer card only; don't reveal its child tiles a second time.
      if (records.has(el) || el.parentElement?.closest(selectors)) continue;
      const rec = {control: null, hover: null, batch: null};
      records.set(el, rec);
      el.classList.add('motion-owned');
      bindHover(el, rec);
      if (el.closest(modalSelector) || appeared.has(el) || reduce.matches || el.classList.contains('pm-done') || (key(el) && seen.has(key(el)))) continue;
      fresh.push(el);
    }
    if (!fresh.length) return;
    const batch = {pending: new Set(fresh), dispose: null};
    batches.add(batch);
    fresh.forEach(el => records.get(el).batch = batch);
    batch.dispose = api.inView(fresh, el => {
      const rec = records.get(el);
      if (!running || !rec) return;
      const id = key(el);
      appeared.add(el);
      if (!reduce.matches && !(id && seen.has(id)) && !el.classList.contains('pm-done')) {
        if (id) seen.add(id);
        play(el, {opacity: [0, 1], translate: ['0px 12px', '0px 0px']});
      }
      rec.batch = null;
      releaseBatch(batch, el);
      // No exit callback: Motion unobserves after this first entry.
    }, {amount: 0.08});
  }
  function prune() {
    for (const [el, rec] of records) {
      if (el.isConnected) continue;
      stop(rec);
      rec.hover?.();
      if (rec.batch) releaseBatch(rec.batch, el);
      records.delete(el);
    }
  }
  function modal(el) {
    const active = el.classList.contains('active');
    if (opened.get(el) === active) return;
    opened.set(el, active);
    const box = el.querySelector(boxSelector);
    if (!box) return;
    let rec = records.get(box);
    if (!rec) {
      rec = {control: null, hover: null, batch: null};
      records.set(box, rec);
      box.classList.add('motion-owned');
    }
    settle(box, rec);
    if (active) play(box, {opacity: [0, 1], translate: ['0px 10px', '0px 0px']}, {duration: 0.22});
  }
  function answer(el) {
    if (!el.open && !el.classList.contains('active')) return;
    const body = el.querySelector('.faq-answer');
    if (!body) return;
    if (!records.has(body)) {
      records.set(body, {control: null, hover: null, batch: null});
      body.classList.add('motion-owned');
    }
    play(body, {opacity: [0.4, 1]}, {duration: 0.18});
  }
  function toggle(event) {
    if (event.target.matches('.faq-item')) answer(event.target);
  }
  function scrollEffects() {
    scrollDisposers.splice(0).forEach(dispose => dispose());
    const bar = document.getElementById('progress-bar');
    if (bar) scrollDisposers.push(api.scroll(progress => {bar.style.scale = progress + ' 1';}));
    const hero = document.querySelector('.hero');
    if (!hero || reduce.matches || !fine.matches) return;
    document.querySelectorAll('.shape').forEach((el, i) => {
      const control = api.animate(el, {translate: ['0px 0px', `0px -${18 + i * 4}px`]}, {ease: 'linear'});
      const dispose = api.scroll(control, {target: hero, offset: ['start start', 'end start']});
      scrollDisposers.push(() => {dispose(); control.stop(); el.style.translate = '';});
    });
  }
  function preferences() {
    for (const [el, rec] of records) {
      rec.hover?.(); rec.hover = null;
      settle(el, rec);
      bindHover(el, rec);
    }
    if (reduce.matches) {
      for (const batch of batches) batch.dispose();
      batches.clear();
      for (const [el, rec] of records) {
        rec.batch = null;
        appeared.add(el);
        if (key(el)) seen.add(key(el));
      }
    }
    scrollEffects();
  }
  // FLIP only for visible, persistent cards reordered by the existing filters.
  function captureLayout(root) {
    if (!root || reduce.matches || !running) return () => {};
    const before = new Map();
    root.querySelectorAll('.card:not(.filtered-out)').forEach(el => {
      const rec = records.get(el);
      if (!rec) return;
      settle(el, rec);
      const rect = el.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight) before.set(el, rect);
    });
    return () => {
      const changes = [];
      for (const [el, first] of before) {
        if (!el.isConnected || el.classList.contains('filtered-out')) continue;
        const last = el.getBoundingClientRect();
        if (last.bottom <= 0 || last.top >= innerHeight) continue;
        const x = first.left - last.left, y = first.top - last.top;
        if (Math.abs(x) + Math.abs(y) > 1 && Math.abs(y) < innerHeight) changes.push({el, x, y});
      }
      // Finish all layout reads before animation writes.
      changes.forEach(({el, x, y}) => play(el, {translate: [`${x}px ${y}px`, '0px 0px']}, {duration: 0.2}));
    };
  }
  function boot() {
    if (running) return;
    running = true;
    document.documentElement.classList.add('site-motion');
    scan();
    document.querySelectorAll(modalSelector).forEach(modal);
    scrollEffects();
    mutations = new MutationObserver(changes => {
      for (const change of changes) {
        if (change.type === 'childList') {
          change.addedNodes.forEach(node => {if (node.nodeType === 1) queued.add(node);});
        } else {
          const el = change.target;
          if (el.matches(modalSelector)) modal(el);
          if (el.matches('.faq-item') && change.oldValue !== el.className) answer(el);
          if (change.attributeName === 'hidden' || el.matches('.tab-content')) queued.add(el);
        }
      }
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        prune();
        for (const root of queued) if (root.isConnected) scan(root);
        queued.clear();
      });
    });
    mutations.observe(document.body, {childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'hidden']});
    document.addEventListener('toggle', toggle, true);
    reduce.addEventListener('change', preferences);
    fine.addEventListener('change', preferences);
  }
  function dispose() {
    if (!running) return;
    running = false;
    mutations?.disconnect();
    cancelAnimationFrame(frame); frame = 0; queued.clear();
    for (const batch of batches) batch.dispose();
    batches.clear();
    for (const [el, rec] of records) {settle(el, rec); rec.hover?.();}
    records.clear();
    scrollDisposers.splice(0).forEach(fn => fn());
    document.removeEventListener('toggle', toggle, true);
    reduce.removeEventListener('change', preferences);
    fine.removeEventListener('change', preferences);
  }
  window.SiteMotion = {scan, captureLayout, dispose};
  addEventListener('pagehide', dispose);
  addEventListener('pageshow', boot);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})();
