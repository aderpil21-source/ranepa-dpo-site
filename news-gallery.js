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
    </section>`;
}
function initNewsGalleries(view){
    view.querySelectorAll('.news-gallery').forEach(gallery => {
        const track = gallery.querySelector('.news-gallery-track');
        const slides = Array.from(track.children);
        const output = gallery.querySelector('output');
        let index = 0;
        let settling;
        const fit = () => {
            const img = slides[index].querySelector('img');
            if (!img.naturalWidth || !img.naturalHeight) return;
            const ratio = img.naturalWidth / img.naturalHeight;
            gallery.style.setProperty('--gallery-width', Math.min(720, 420 * ratio) + 'px');
            track.style.height = slides[index].offsetHeight + 'px';
            track.scrollTo({left:index * track.clientWidth,behavior:'instant'});
        };
        const current = () => Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
        const update = () => { index = current(); output.textContent = `${index+1} / ${slides.length}`; };
        const step = delta => {
            index = (current() + delta + slides.length) % slides.length;
            track.scrollTo({left: index * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        };
        gallery.addEventListener('click', e => { const b = e.target.closest('[data-gallery-step]'); if (b) step(Number(b.dataset.galleryStep)); });
        track.addEventListener('scroll', () => {
            update(); clearTimeout(settling); settling = setTimeout(fit, 160);
        }, {passive:true});
        track.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){ e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); } });
        slides.forEach(slide => slide.querySelector('img').addEventListener('load', fit));
        if (typeof ResizeObserver !== 'undefined'){
            const observer = new ResizeObserver(() => {
                if (!gallery.isConnected){ observer.disconnect(); return; }
                fit();
            });
            observer.observe(gallery.parentElement);
        }
        fit();
    });
}
