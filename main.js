// main.js
document.addEventListener('DOMContentLoaded', async function () {
    const loadingSpinner = document.getElementById('loadingSpinner');

    // 處理專案列表頁面
    const projectContainer = document.getElementById('projectContainer');
    if (projectContainer) {
        try {
            const response = await fetch('projects.json');
            const data = await response.json();
            for (let i = 0; i < data.projects.length; i++) {
                const projectCard = await createProjectCard(data.projects[i], i);
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
                const response = await fetch('projects.json');
                const data = await response.json();
                const project = data.projects.find(p => p.id === projectId);
                if (project) {
                    await displayProjectDetails(project);
                    await waitForImages(project);
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
    }
});

async function supportsWebP() {
    if (!self.createImageBitmap) return false;

    const webpData = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    const blob = await fetch(webpData).then(r => r.blob());

    return createImageBitmap(blob).then(() => true, () => false);
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
                <img src="${imageUrl}" alt="${project.title}" onerror="this.onerror=null;this.src='${fallbackUrl}';">
            </a>
        </div>
        <div class="project-info">
            <span class="project-number">${projectNum}</span>
            <h3>${project.title}</h3>
            <p>${project.description.substring(0, 80)}...</p>
            <a href="project.html?id=${project.id}" class="discover-btn">Discover <span>&rarr;</span></a>
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

    // 添加描述
    const description = document.createElement('p');
    description.textContent = project.description;
    container.appendChild(description);

    // 創建圖片網格容器
    const imageGrid = document.createElement('div');
    imageGrid.className = 'project-images';

    // 添加所有項目圖片
    project.images.forEach(imageName => {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';

        const img = document.createElement('img');
        img.src = `projects/${project.id}/${imageName.replace(/\.(png|jpg|jpeg)$/, useWebP ? '.webp' : '$&')}`;
        img.alt = project.title;

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