/* Shared Motion controller. Vendored Motion 12.23.24; no CDN or runtime install. */
(() => {
  'use strict';
  if (window.SiteMotion) return;
  const api = window.Motion;
  if (!api?.animate || !api?.inView || !api?.hover || !api?.scroll) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const headingSelectors = '.hero h1,.hero p,.audience-hero h1,.audience-hero p,.page-title,.page-lead,.page-kicker,.schedule-title,.section-header,.sector-header';
  const controlSelectors = '.button,.buy-btn,.header-nav-btn,.tab-btn,.nav-enroll,.action,.cta,.cta-button,.back-btn,.control-panel-btn';
  const cardSelectors = '.card,.contact-card,.main-contact-box,.faq-item,.audience-card,.material-card,.payment-card,.meta-card,.side-card,.related-card,.topic-grid li,.lesson,.timeline-card,.doc-card';
  const selectors = cardSelectors + ',' + headingSelectors;
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
    if (!id && el.matches(headingSelectors)) return 'heading:' + el.textContent.trim();
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
    el.style.setProperty('--motion-scale', '1');
    el.style.setProperty('--motion-line', '1');
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
  function controlFeedback(el, rec) {
    const state = rec.pressed ? 'pressed' : (rec.hovered || rec.focused ? 'active' : 'idle');
    if (rec.feedbackState === state) return;
    rec.feedbackState = state;
    play(el, {
      '--motion-scale': state === 'pressed' ? 0.97 : state === 'active' ? 1.025 : 1,
      translate: state === 'active' ? '0px -2px' : '0px 0px'
    }, {type:'spring', stiffness:state === 'pressed' ? 460 : 320, damping:state === 'pressed' ? 32 : 28});
  }
  function bindHover(el, rec) {
    if (rec.hover || !fine.matches || reduce.matches || el.matches(headingSelectors + ',.faq-item,.main-contact-box')) return;
    if (!rec.isControl) bindLight(el, rec);
    rec.hover = api.hover(el, () => {
      if (rec.isControl) {
        rec.hovered = true;
        controlFeedback(el, rec);
        return () => {rec.hovered = false; controlFeedback(el, rec);};
      }
      appeared.add(el);
      if (key(el)) seen.add(key(el));
      if (rec.batch) {releaseBatch(rec.batch, el); rec.batch = null;}
      settle(el, rec);
      play(el, {translate:'0px -7px', '--motion-scale':1.012}, {type:'spring', stiffness:320, damping:28});
      return () => play(el, {translate:'0px 0px', '--motion-scale':1}, {type:'spring', stiffness:320, damping:28});
    });
  }
  function bindLight(el, rec) {
    if (rec.light || !el.matches(cardSelectors) || el.matches('.faq-item,.lesson,.timeline-card')) return;
    const oldPosition = el.style.position;
    const needsPosition = getComputedStyle(el).position === 'static';
    if (needsPosition) el.style.position = 'relative';
    el.classList.add('motion-card');
    let layer = el.querySelector(':scope > .motion-sheen');
    if (!layer) {
      layer = document.createElement('i');
      layer.className = 'motion-sheen';
      layer.setAttribute('aria-hidden', 'true');
      el.prepend(layer);
    }
    let raf = 0, rect = null, x = 50, y = 50;
    const enter = () => {rect = el.getBoundingClientRect();};
    const move = event => {
      if (!rect) return;
      x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
      y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        layer.style.setProperty('--light-x', x + '%');
        layer.style.setProperty('--light-y', y + '%');
      });
    };
    const leave = () => {rect = null; cancelAnimationFrame(raf); raf = 0;};
    el.addEventListener('pointerenter', enter, {passive:true});
    el.addEventListener('pointermove', move, {passive:true});
    el.addEventListener('pointerleave', leave, {passive:true});
    rec.light = () => {
      leave();
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      layer.remove();
      if (needsPosition) el.style.position = oldPosition;
    };
  }
  function controls(root) {
    const nodes = [...root.querySelectorAll(controlSelectors)];
    if (root.matches?.(controlSelectors)) nodes.unshift(root);
    for (const el of nodes) {
      if (records.has(el)) continue;
      const rec = {control:null, hover:null, batch:null, isControl:true};
      records.set(el, rec);
      el.classList.add('motion-owned', 'motion-control');
      bindHover(el, rec);
      const focus = () => {rec.focused = true; controlFeedback(el, rec);};
      const blur = () => {rec.focused = false; controlFeedback(el, rec);};
      el.addEventListener('focus', focus);
      el.addEventListener('blur', blur);
      rec.focus = () => {el.removeEventListener('focus', focus); el.removeEventListener('blur', blur);};
      if (api.press) rec.press = api.press(el, () => {
        rec.pressed = true;
        controlFeedback(el, rec);
        return () => {rec.pressed = false; controlFeedback(el, rec);};
      });
    }
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
    controls(root);
    const matches = [...root.querySelectorAll(selectors)];
    if (root.matches?.(selectors)) matches.unshift(root);
    const fresh = [];
    for (const el of matches) {
      // Animate the outer card only; don't reveal its child tiles a second time.
      if (records.has(el) || el.parentElement?.closest(selectors)) continue;
      const rec = {control: null, hover: null, batch: null, isHeading:el.matches(headingSelectors)};
      records.set(el, rec);
      el.classList.add('motion-owned');
      if (rec.isHeading && !el.matches('p,.page-lead,.page-kicker')) el.classList.add('motion-heading');
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
        const distance = rec.isHeading ? 28 : (fine.matches ? 26 : 16);
        const delay = rec.isHeading ? 0 : Math.min((fresh.indexOf(el) % 4) * 0.045, 0.135);
        play(el, {opacity: [0, 1], translate: [`0px ${distance}px`, '0px 0px'], '--motion-line':[0, 1]}, {duration:rec.isHeading ? 0.6 : 0.5, delay});
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
      rec.hover?.(); rec.light?.(); rec.focus?.(); rec.press?.();
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
    if (active) play(box, {opacity: [0, 1], translate: ['0px 20px', '0px 0px']}, {duration: 0.32});
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
      const control = api.animate(el, {translate: ['0px 0px', `0px -${42 + i * 10}px`]}, {ease: 'linear'});
      const dispose = api.scroll(control, {target: hero, offset: ['start start', 'end start']});
      scrollDisposers.push(() => {dispose(); control.stop(); el.style.translate = '';});
    });
  }
  function preferences() {
    for (const [el, rec] of records) {
      rec.hover?.(); rec.hover = null;
      rec.light?.(); rec.light = null;
      rec.hovered = false; rec.focused = false; rec.pressed = false; rec.feedbackState = null;
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
    for (const [el, rec] of records) {settle(el, rec); rec.hover?.(); rec.light?.(); rec.focus?.(); rec.press?.();}
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
