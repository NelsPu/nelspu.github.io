// Shared interactions for the homepage, portfolio and renovation guides.
async function fetchProjects() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch('projects.json?v=7.0', { signal: controller.signal });
        // Consume the body inside the timeout so stalled downloads also recover.
        if (!response.ok) throw new Error(`Projects request failed: ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.projects) || !data.projects.length) throw new Error('Projects data is empty');
        return data;
    } finally {
        clearTimeout(timeout);
    }
}

function imageAttributes(media, sizes) {
    if (!media) return '';
    const srcset = media.variants.map(v => `${v.src} ${v.width}w`).join(', ');
    return `width="${media.width}" height="${media.height}" srcset="${srcset}" sizes="${sizes}"`;
}

function markSinglePortrait(grid) {
    const portraits = [...grid.querySelectorAll('.portrait')];
    portraits.forEach(item => item.classList.remove('portrait-single'));
    if (portraits.length % 2) portraits.at(-1).classList.add('portrait-single');
}

function showLoadError(container, message) {
    container.innerHTML = `<div class="project-error" role="alert"><p>${message}</p><button class="button button-primary" type="button">重新載入案例</button> <a class="text-link" href="https://lin.ee/OdVZUpf" target="_blank" rel="noopener noreferrer" data-track="line-load-error">LINE 聯絡我們 →</a></div>`;
    container.querySelector('button').addEventListener('click', () => window.location.reload());
}

function initConsultationCopy() {
    const button = document.getElementById('copy-consultation');
    const template = document.getElementById('consultation-template');
    const status = document.getElementById('copy-status');
    if (!button || !template || !status) return;
    button.hidden = false;
    button.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(template.value);
            status.textContent = '已複製，貼到 LINE 填寫後傳給我們即可。';
        } catch {
            template.focus();
            template.select();
            template.setSelectionRange(0, template.value.length);
            status.textContent = '格式已選取，請長按或按 Ctrl／⌘ + C 複製。';
        }
    });
}

function initContactTracking() {
    document.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!link || typeof window.gtag !== 'function') return;
        const href = link.getAttribute('href');
        const method = /^https:\/\/(lin\.ee|line\.me)\//.test(href) ? 'line' : href.startsWith('mailto:') ? 'email' : null;
        if (!method) return;
        const location = link.dataset.track || (link.classList.contains('mobile-contact') ? 'mobile' : link.closest('nav') ? 'header' : 'content');
        window.gtag('event', 'contact_click', { contact_method: method, contact_location: location, page_path: window.location.pathname });
    });
}

document.addEventListener('DOMContentLoaded', async function () {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const initialHash = window.location.hash;
    let userScrolled = false;
    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => {
        window.addEventListener(type, () => { userScrolled = true; }, { once: true, passive: true });
    });
    initConsultationCopy();
    initContactTracking();
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') document.querySelector('.mobile-menu[open]')?.removeAttribute('open');
    });

    document.querySelectorAll('.mobile-menu a').forEach(link => {
        link.addEventListener('click', () => link.closest('details')?.removeAttribute('open'));
    });
    initScrollAnimations();

    // 處理專案列表頁面
    const projectContainer = document.getElementById('projectContainer');
    if (projectContainer) {
        try {
            const data = await fetchProjects();
            const featuredIds = ['project30', 'project8', 'project11', 'project18', 'project1', 'project4'];
            const visibleProjects = document.body.classList.contains('home-page')
                ? featuredIds.map(id => data.projects.find(project => project.id === id)).filter(Boolean)
                : data.projects;
            for (let i = 0; i < visibleProjects.length; i++) {
                const projectCard = await createProjectCard(visibleProjects[i], i);
                projectContainer.appendChild(projectCard);
            }
            initScrollAnimations(); // 初始化滾動動畫
            // Restore direct section links after asynchronously inserting the cards.
            if (initialHash && window.location.hash === initialHash && !userScrolled) {
                let target;
                try { target = document.getElementById(decodeURIComponent(initialHash.slice(1))); } catch { /* Invalid fragment. */ }
                target?.scrollIntoView({ behavior: 'instant', block: 'start' });
            }
        } catch (error) {
            console.error('Error loading projects:', error);
            showLoadError(projectContainer, '案例暫時無法載入，請重試或直接與我們聊聊。');
        }
    }

    // 處理專案詳情頁面
    const projectDetails = document.getElementById('projectDetails');
    if (projectDetails) {
        const urlParams = new URLSearchParams(window.location.search);
        const requestedProjectId = urlParams.get('id');
        const mergedProjectIds = {
            project7: 'project6',
            project13: 'project12',
            project14: 'project12',
            project16: 'project15',
            project17: 'project15',
            project20: 'project19',
            project21: 'project19',
            project23: 'project22',
            project24: 'project22',
            project28: 'project27',
            project29: 'project27'
        };
        const projectId = mergedProjectIds[requestedProjectId] || requestedProjectId;

        if (projectId) {
            try {
                const data = await fetchProjects();
                const project = data.projects.find(p => p.id === projectId);
                if (project) {
                    if (requestedProjectId !== projectId) {
                        const canonicalUrl = new URL(window.location.href);
                        canonicalUrl.searchParams.set('id', projectId);
                        window.history.replaceState({}, '', canonicalUrl);
                    }
                    await displayProjectDetails(project);
                    updateProjectMetadata(project);
                } else {
                    showProjectError('找不到此設計案例');
                }
            } catch (error) {
                console.error('Error loading project details:', error);
                showLoadError(projectDetails, '案例暫時無法載入，請重試或直接與我們聊聊。');
            } finally {
                if (loadingSpinner) loadingSpinner.hidden = true;
            }
        }
        else {
            showProjectError('請從作品集選擇設計案例');
            if (loadingSpinner) loadingSpinner.hidden = true;
        }
    }
});

async function createProjectCard(project, index) {
    const article = document.createElement('article');
    article.className = 'project-editorial reveal';

    const media = project.media?.[project.cover];
    const imageUrl = media?.src || `projects/${project.id}/${project.cover}`;
    const fallbackUrl = `projects/${project.id}/${project.cover}`;
    const projectNum = String(index + 1).padStart(2, '0'); // 生成 01, 02...

    article.innerHTML = `
        <div class="project-image">
            <a href="project.html?id=${project.id}">
                <img src="${imageUrl}" ${imageAttributes(media, '(max-width: 600px) calc(100vw - 32px), (max-width: 900px) 46vw, 380px')} alt="${project.title}，案例封面" loading="lazy" decoding="async" onerror="this.onerror=null;this.removeAttribute('srcset');this.src='${fallbackUrl}';">
            </a>
        </div>
        <div class="project-info">
            <span class="project-number">${projectNum}</span>
            <h3>${project.title}</h3>
            <p>${project.description.length > 80 ? project.description.substring(0, 80) + '…' : project.description}</p>
            <a href="project.html?id=${project.id}" class="discover-btn">查看設計 <span>&rarr;</span></a>
        </div>
    `;

    return article;
}

async function displayProjectDetails(project) {
    const container = document.getElementById('projectDetails');

    // 添加標題
    const title = document.createElement('h1');
    title.textContent = project.title;
    container.appendChild(title);

    // 添加案例導言
    const description = document.createElement('p');
    description.textContent = project.description;
    container.appendChild(description);

    if (project.story) {
        const story = document.createElement('section');
        story.className = 'project-story';
        story.innerHTML = `
            <div class="story-intro"><span>Design Notes</span><h2>${project.story.headline}</h2></div>
            <div class="story-grid">
                <article><span>01</span><h3>屋主需求</h3><p>${project.story.brief}</p></article>
                <article><span>02</span><h3>空間判斷</h3><p>${project.story.decision}</p></article>
                <article><span>03</span><h3>設計解法</h3><p>${project.story.solution}</p></article>
                <article><span>04</span><h3>材質與細節</h3><p>${project.story.detail}</p></article>
            </div>`;
        container.appendChild(story);
    }

    // 創建圖片網格容器
    const imageGrid = document.createElement('div');
    imageGrid.className = 'project-images';

    // 添加所有項目圖片
    project.images.forEach((imageName, index) => {
        const imageContainer = document.createElement('div');
        const media = project.media?.[imageName];
        imageContainer.className = `image-container ${media && media.height > media.width ? 'portrait' : 'landscape'}`;

        const img = document.createElement('img');
        if (media) {
            img.width = media.width;
            img.height = media.height;
            img.srcset = media.variants.map(v => `${v.src} ${v.width}w`).join(', ');
            img.sizes = media.height > media.width ? '(max-width: 900px) calc(100vw - 40px), 470px' : '(max-width: 1000px) calc(100vw - 40px), 960px';
        }
        img.src = media?.src || `projects/${project.id}/${imageName}`;
        const stage = project.id === 'project26' && index < 2 ? '翻新前空間紀錄' : '空間設計圖片';
        img.alt = `${project.title}，${stage} ${index + 1}`;
        img.loading = 'lazy';
        img.decoding = 'async';

        // 如果 WebP 載入失敗，回退到原始格式
        img.onerror = function () {
            this.onerror = null;
            this.removeAttribute('srcset');
            this.src = `projects/${project.id}/${imageName}`;
        };

        // 圖片加載完成後確定方向
        if (!media) img.onload = function () {
            const isPortrait = this.naturalHeight > this.naturalWidth;
            imageContainer.classList.toggle('portrait', isPortrait);
            imageContainer.classList.toggle('landscape', !isPortrait);
            markSinglePortrait(imageGrid);
        };

        imageContainer.appendChild(img);
        imageGrid.appendChild(imageContainer);
    });

    markSinglePortrait(imageGrid);
    container.appendChild(imageGrid);

    const consultation = document.createElement('section');
    consultation.className = 'project-consultation';
    consultation.innerHTML = `<p>你也有類似的格局、收納或翻新問題嗎？</p><h2>先把案場和需求聊清楚</h2><p>提供案場地區、房屋類型、室內坪數、預計交屋時間與預算方向，就能開始討論。</p><a class="button button-primary" href="https://lin.ee/OdVZUpf" target="_blank" rel="noopener noreferrer" data-track="line-project-end">LINE 預約初步諮詢</a>`;
    container.appendChild(consultation);
}

function updateProjectMetadata(project) {
    const pageUrl = new URL(window.location.pathname, window.location.origin);
    pageUrl.searchParams.set('id', project.id);
    const description = project.description.replace(/\s+/g, ' ').slice(0, 155);
    const image = new URL(`projects/${project.id}/${project.cover}`, window.location.href).href;
    document.title = `${project.title}｜住宅室內設計案例｜玥森設計`;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', document.title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:url', pageUrl.href);
    setMeta('name', 'twitter:title', document.title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', image);
    document.querySelector('link[rel="canonical"]').href = pageUrl.href;
}

function setMeta(attribute, key, content) {
    let element = document.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
    }
    element.content = content;
}

function showProjectError(message) {
    const container = document.getElementById('projectDetails');
    container.innerHTML = `<div class="project-error"><h1>${message}</h1><p><a href="projects.html">返回住宅案例列表</a></p></div>`;
}


// 加入 Intersection Observer 處理滾動浮現動畫
function initScrollAnimations() {
    const elements = document.querySelectorAll('.reveal:not(.active)');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        elements.forEach(el => el.classList.add('active'));
        return;
    }

    document.body.classList.add('motion-ready');
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.05
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // 觸發一次後就解除觀察
            }
        });
    }, observerOptions);

    elements.forEach(el => {
        observer.observe(el);
    });
}
