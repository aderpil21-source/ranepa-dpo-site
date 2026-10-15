/* Image blocks keep their existing shape; presentation is an optional preference. */
function newsGalleryGroups(blocks){
    const groups = [];
    for (const block of blocks){
        const previous = groups[groups.length - 1];
        if (block.type === 'image' && block.url && block.presentation === 'carousel'){
            if (previous && previous.carousel) previous.blocks.push(block);
            else groups.push({carousel:true, blocks:[block]});
        } else groups.push({carousel:false, blocks:[block]});
    }
    return groups;
}
function newsGalleryHtml(blocks, media){
    return `<section class="news-gallery" role="region" aria-roledescription="карусель" aria-label="Фотографии новости">
        <div class="news-gallery-track" tabindex="0" aria-label="Фотографии. Используйте стрелки для перелистывания">${blocks.map((b,i) => `<figure class="news-gallery-slide" role="group" aria-label="${i+1} из ${blocks.length}"><button type="button" class="news-gallery-open" data-lightbox="${media.indexOf(b)}" aria-label="Открыть фото ${i+1} на весь экран"><img src="${escapeHtml(imageUrl(b.url))}" alt="${escapeHtml(b.caption || 'Фото ' + (i+1))}" loading="lazy"><span>⛶ На весь экран</span></button>${b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : ''}</figure>`).join('')}</div>
        <div class="news-gallery-controls"><button type="button" data-gallery-step="-1" aria-label="Предыдущее фото">←</button><output aria-live="polite">1 / ${blocks.length}</output><button type="button" data-gallery-step="1" aria-label="Следующее фото">→</button></div>
        <div class="news-gallery-dots" aria-label="Выбор фотографии">${blocks.map((_,i) => `<button type="button" data-gallery-index="${i}" aria-label="Фото ${i+1}" aria-pressed="${i === 0}"></button>`).join('')}</div>
    </section>`;
}
function initNewsGalleries(view){
    view.querySelectorAll('.news-gallery').forEach(gallery => {
        const track = gallery.querySelector('.news-gallery-track');
        const slides = Array.from(track.children);
        const output = gallery.querySelector('output');
        const dots = Array.from(gallery.querySelectorAll('[data-gallery-index]'));
        let index = 0, touch = null, swiped = false;
        const render = () => {
            let stageHeight = 0;
            const sizes = slides.map(slide => {
                const img = slide.querySelector('img');
                const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4/3;
                const width = Math.min(580, gallery.clientWidth * .68, 360 * ratio);
                slide.style.width = width + 'px';
                stageHeight = Math.max(stageHeight, width/ratio + (slide.querySelector('figcaption')?.offsetHeight || 0));
                return width;
            });
            slides.forEach((slide,i) => {
                let delta = (i - index + slides.length) % slides.length;
                if (delta > slides.length/2) delta -= slides.length;
                const active = delta === 0, visible = Math.abs(delta) <= 1;
                slide.classList.toggle('is-active',active);
                slide.style.setProperty('--slide-x', delta * (sizes[index] + sizes[i]) * .43 + 'px');
                slide.style.setProperty('--slide-angle', -Math.sign(delta) * 38 + 'deg');
                slide.style.setProperty('--slide-scale', active ? '1' : '.82');
                slide.style.opacity = visible ? (active ? '1' : '.65') : '0';
                slide.style.zIndex = active ? '3' : visible ? '2' : '0';
                slide.inert = !visible;
                slide.setAttribute('aria-hidden',String(!visible));
                slide.querySelector('button').tabIndex = active ? 0 : -1;
            });
            track.style.height = Math.ceil(stageHeight + 36) + 'px';
            output.textContent = `${index+1} / ${slides.length}`;
            dots.forEach((dot,i) => dot.setAttribute('aria-pressed',String(i === index)));
        };
        const select = value => { index = (value + slides.length) % slides.length; render(); };
        gallery.addEventListener('click', e => {
            if (swiped){ e.preventDefault(); e.stopPropagation(); swiped = false; return; }
            const step = e.target.closest('[data-gallery-step]'), dot = e.target.closest('[data-gallery-index]');
            if (step) select(index + Number(step.dataset.galleryStep));
            if (dot) select(Number(dot.dataset.galleryIndex));
            const slide = e.target.closest('.news-gallery-slide');
            if (slide && !slide.classList.contains('is-active')){ e.preventDefault(); e.stopPropagation(); select(slides.indexOf(slide)); }
        });
        track.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){ e.preventDefault(); select(index + (e.key === 'ArrowLeft' ? -1 : 1)); } });
        track.addEventListener('touchstart', e => { touch = e.touches.length === 1 ? {x:e.touches[0].clientX,y:e.touches[0].clientY} : null; swiped = false; },{passive:true});
        track.addEventListener('touchend', e => {
            if (!touch || !e.changedTouches.length) return;
            const dx = e.changedTouches[0].clientX-touch.x, dy = e.changedTouches[0].clientY-touch.y;
            touch = null;
            if (Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.3){ swiped = true; select(index + (dx<0 ? 1 : -1)); setTimeout(() => { swiped = false; },350); }
        },{passive:true});
        slides.forEach(slide => slide.querySelector('img').addEventListener('load',render));
        if (typeof ResizeObserver !== 'undefined'){
            const observer = new ResizeObserver(() => { if (!gallery.isConnected){ observer.disconnect(); return; } render(); });
            observer.observe(gallery);
        }
        render();
    });
}
