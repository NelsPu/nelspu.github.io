// main.js
document.addEventListener('DOMContentLoaded', function () {
    const loadingSpinner = document.getElementById('loadingSpinner');

    // 處理專案列表頁面
    const projectContainer = document.getElementById('projectContainer');
    if (projectContainer) {
        fetch('projects.json')
            .then(response => response.json())
            .then(data => {
                data.projects.forEach(project => {
                    const projectCard = createProjectCard(project);
                    projectContainer.appendChild(projectCard);
                });
            })
            .catch(error => {
                console.error('Error loading projects:', error);
            });
    }

    // 處理專案詳情頁面
    const projectDetails = document.getElementById('projectDetails');
    if (projectDetails) {
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('id');

        if (projectId) {
            fetch('projects.json')
                .then(response => response.json())
                .then(data => {
                    const project = data.projects.find(p => p.id === projectId);
                    if (project) {
                        displayProjectDetails(project);
                        // 等待所有圖片載入完成
                        return waitForImages(project);
                    }
                })
                .then(() => {
                    // 隱藏 loading 動畫
                    loadingSpinner.classList.add('loading-hidden');
                    setTimeout(() => {
                        loadingSpinner.style.display = 'none';
                    }, 300);
                })
                .catch(error => {
                    console.error('Error loading project details:', error);
                    loadingSpinner.classList.add('loading-hidden');
                });
        }
    }
});

function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'project-card';

    const img = document.createElement('img');
    img.src = `projects/${project.id}/${project.cover}`;
    img.alt = project.title;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.textContent = project.title;

    card.appendChild(img);
    card.appendChild(overlay);

    card.addEventListener('click', () => {
        window.location.href = `project.html?id=${project.id}`;
    });

    return card;
}

function displayProjectDetails(project) {
    const container = document.getElementById('projectDetails');

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
        img.src = `projects/${project.id}/${imageName}`;
        img.alt = project.title;

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

// 等待所有圖片載入的輔助函數
function waitForImages(project) {
    const imagePromises = project.images.map(imageName => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = `projects/${project.id}/${imageName}`;
        });
    });

    return Promise.all(imagePromises);
}