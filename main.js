// main.js
document.addEventListener('DOMContentLoaded', async function () {
    const loadingSpinner = document.getElementById('loadingSpinner');

    // 處理專案列表頁面
    const projectContainer = document.getElementById('projectContainer');
    if (projectContainer) {
        try {
            const response = await fetch('projects.json?v=4.0');
            const data = await response.json();
            const featuredIds = ['project30', 'project8', 'project11', 'project18', 'project1', 'project4'];
            const visibleProjects = document.body.classList.contains('home-page')
                ? featuredIds.map(id => data.projects.find(project => project.id === id)).filter(Boolean)
                : data.projects;
            for (let i = 0; i < visibleProjects.length; i++) {
                const projectCard = await createProjectCard(visibleProjects[i], i);
                projectContainer.appendChild(projectCard);
            }
            initScrollAnimations(); // 初始化滾動動畫
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    }

    // 處理專案詳情頁面
    const projectDetails = document.getElementById('projectDetails');
    if (projectDetails) {
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('id');

        if (projectId) {
            try {
                const response = await fetch('projects.json?v=4.0');
                const data = await response.json();
                const project = data.projects.find(p => p.id === projectId);
                if (project) {
                    await displayProjectDetails(project);
                    updateProjectMetadata(project);
                } else {
                    showProjectError('找不到此設計案例');
                }
                loadingSpinner.classList.add('loading-hidden');
                setTimeout(() => {
                    loadingSpinner.style.display = 'none';
                }, 300);
            } catch (error) {
                console.error('Error loading project details:', error);
                loadingSpinner.classList.add('loading-hidden');
            }
        }
        else {
            showProjectError('請從作品集選擇設計案例');
            loadingSpinner.classList.add('loading-hidden');
        }
    }
});

let webPSupportPromise;
async function supportsWebP() {
    if (webPSupportPromise) return webPSupportPromise;
    if (!self.createImageBitmap) return false;

    const webpData = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    const blob = await fetch(webpData).then(r => r.blob());

    webPSupportPromise = createImageBitmap(blob).then(() => true, () => false);
    return webPSupportPromise;
}

async function createProjectCard(project, index) {
    const article = document.createElement('article');
    article.className = 'project-editorial reveal';

    const useWebP = await supportsWebP();
    const imageUrl = `projects/${project.id}/${project.cover.replace(/\.(png|jpg|jpeg)$/, useWebP ? '.webp' : '$&')}`;
    const fallbackUrl = `projects/${project.id}/${project.cover}`;
    const projectNum = String(index + 1).padStart(2, '0'); // 生成 01, 02...

    article.innerHTML = `
        <div class="project-image">
            <a href="project.html?id=${project.id}">
                <img src="${imageUrl}" alt="${project.title}室內設計案例" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${fallbackUrl}';">
            </a>
        </div>
        <div class="project-info">
            <span class="project-number">${projectNum}</span>
            <h3>${project.title}</h3>
            <p>${project.description.substring(0, 80)}...</p>
            <a href="project.html?id=${project.id}" class="discover-btn">查看設計 <span>&rarr;</span></a>
        </div>
    `;

    return article;
}

async function displayProjectDetails(project) {
    const container = document.getElementById('projectDetails');
    const useWebP = await supportsWebP();

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
    project.images.forEach(imageName => {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';

        const img = document.createElement('img');
        img.src = `projects/${project.id}/${imageName.replace(/\.(png|jpg|jpeg)$/, useWebP ? '.webp' : '$&')}`;
        img.alt = `${project.title}台中住宅室內設計完工照片`;
        img.loading = 'lazy';
        img.decoding = 'async';

        // 如果 WebP 載入失敗，回退到原始格式
        img.onerror = function () {
            this.src = `projects/${project.id}/${imageName}`;
        };

        // 圖片加載完成後確定方向
        img.onload = function () {
            imageContainer.classList.add(
                this.naturalHeight > this.naturalWidth ? 'portrait' : 'landscape'
            );
        };

        imageContainer.appendChild(img);
        imageGrid.appendChild(imageContainer);
    });

    container.appendChild(imageGrid);

    const consultation = document.createElement('section');
    consultation.className = 'project-consultation';
    consultation.innerHTML = `<p>你也有類似的格局、收納或翻新問題嗎？</p><h2>先把案場和需求聊清楚</h2><p>不急著做決定，讓我們先了解屋況、預算方向與預計時程。</p><a class="button button-primary" href="https://lin.ee/OdVZUpf" target="_blank" rel="noopener noreferrer">LINE 預約初步諮詢</a>`;
    container.appendChild(consultation);
}

function updateProjectMetadata(project) {
    const pageUrl = new URL(window.location.href);
    const description = project.description.replace(/\s+/g, ' ').slice(0, 155);
    const image = new URL(`projects/${project.id}/${project.cover}`, window.location.href).href;
    document.title = `${project.title}｜台中室內設計案例｜玥森設計`;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', document.title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:url', pageUrl.href);
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
    container.innerHTML = `<div class="project-error"><h1>${message}</h1><p><a href="index.html#portfolio">返回精選案例</a></p></div>`;
}


async function waitForImages(project) {
    const useWebP = await supportsWebP();

    const imagePromises = project.images.map(imageName => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = () => {
                // 如果 WebP 載入失敗，嘗試載入原始格式
                img.src = `projects/${project.id}/${imageName}`;
            };
            img.src = `projects/${project.id}/${imageName.replace(/\.(png|jpg|jpeg)$/, useWebP ? '.webp' : '$&')}`;
        });
    });

    return Promise.all(imagePromises);
}

// 加入 Intersection Observer 處理滾動浮現動畫
function initScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // 觸發一次後就解除觀察
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal').forEach(el => {
        observer.observe(el);
    });
}
