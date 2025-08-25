document.addEventListener('DOMContentLoaded', function() {
    if (typeof Ably === 'undefined') {
        console.error('Ably library not loaded');
        document.getElementById('comic-loading').innerHTML = '<p>必要库加载失败，请刷新页面重试</p>';
        return;
    }

    const ably = new Ably.Realtime('nc5NGw.wSmsXg:SMs5pD5aJ4hGMvNZnd7pJp2lYS2X1iCmWm_yeLx_pkk');
    
    const comicTitle = document.getElementById('comic-title');
    const comicTitleInfo = document.getElementById('comic-title-info');
    const comicDesc = document.getElementById('comic-desc');
    const uploadTime = document.getElementById('upload-time');
    const fileType = document.getElementById('file-type');
    const fileSize = document.getElementById('file-size');
    const comicContent = document.getElementById('comic-content');
    const comicLoading = document.getElementById('comic-loading');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageCounter = document.getElementById('page-counter');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');

    const urlParams = new URLSearchParams(window.location.search);
    const shelfId = urlParams.get('shelf');
    const password = urlParams.get('password');
    
    let currentComic = null;
    let currentPage = 1;
    let totalPages = 1;
    let zoomLevel = 1;
    let images = []; // 用于ZIP文件的图像数组
    
    if (!shelfId || !password) {
        window.location.href = 'view.html';
        return;
    }
    
    // 显示错误消息
    function showError(message) {
        comicLoading.innerHTML = `<p class="error">${message}</p>`;
    }
    
    // 显示加载状态
    function showLoading(message = "正在加载漫画...") {
        comicLoading.innerHTML = `
            <div class="spinner"></div>
            <p>${message}</p>
        `;
    }
    
    async function loadComic() {
        showLoading();
        try {
            const shelfChannel = ably.channels.get(`comic-share:shelf-${shelfId}`);
            
            const handleMessage = (message) => {
                if (message.data && message.data.password === password) {
                    currentComic = message.data.data;
                    displayComic();
                    shelfChannel.unsubscribe(handleMessage); 
                }
            };

            shelfChannel.subscribe('comic-upload', handleMessage);

            // 检查历史消息
            const history = await shelfChannel.history({ limit: 100 });
            for (let i = 0; i < history.items.length; i++) {
                const message = history.items[i];
                if (message.data && message.data.password === password) {
                    currentComic = message.data.data;
                    displayComic();
                    shelfChannel.unsubscribe(handleMessage);
                    return; 
                }
            }
            
            // 如果没有找到匹配的漫画，显示提示
            setTimeout(() => {
                if (!currentComic) {
                    showError('书柜中没有找到与密码匹配的漫画。');
                }
            }, 5000);

        } catch (error) {
            console.error('加载漫画失败:', error);
            showError('加载漫画失败，请检查网络连接。');
        }
    }
    
    function displayComic() {
        if (!currentComic) return;

        comicTitle.textContent = currentComic.title;
        comicTitleInfo.textContent = currentComic.title;
        comicDesc.textContent = currentComic.description || '无描述';
        uploadTime.textContent = new Date(currentComic.uploadTime).toLocaleString();
        fileType.textContent = currentComic.fileType.toUpperCase();
        fileSize.textContent = currentComic.fileSize || '未知';
        
        comicLoading.classList.add('hidden');
        comicContent.classList.remove('hidden');
        
        if (currentComic.fileType === 'pdf') {
            displayPdf();
        } else if (currentComic.fileType === 'epub') {
            displayEpub();
        } else if (currentComic.fileType === 'zip') {
            displayZip();
        } else {
            comicContent.innerHTML = '<p>不支持的文件类型。</p>';
        }
    }
    
    function displayPdf() {
        comicContent.innerHTML = `<iframe src="https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(currentComic.fileUrl)}" width="100%" height="100%" style="border: none;"></iframe>`;
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        pageCounter.textContent = 'PDF阅读器';
        zoomInBtn.disabled = true;
        zoomOutBtn.disabled = true;
        zoomResetBtn.disabled = true;
    }
    
    function displayEpub() {
        comicContent.innerHTML = `<div id="epub-container" style="height: 100%; width: 100%;"></div>`;
        
        // 创建并加载EPUB.js
        const book = ePub(currentComic.fileUrl);
        const rendition = book.renderTo("epub-container", { 
            width: "100%", 
            height: "100%", 
            spread: "auto" 
        });
        
        rendition.display();
        
        // 设置导航
        prevPageBtn.onclick = () => rendition.prev();
        nextPageBtn.onclick = () => rendition.next();
        
        // 更新页面计数器
        rendition.on("relocated", function(location){
            if (book.locations.length()) {
                totalPages = book.locations.length();
                const currentLocation = book.locations.locationFromCfi(location.start.cfi);
                currentPage = Math.round(currentLocation * totalPages) || 1;
                updatePageCounter();
            }
        });
        
        book.ready.then(() => {
            if (book.locations.length()) {
                totalPages = book.locations.length();
                updatePageCounter();
            } else {
                pageCounter.textContent = 'EPUB阅读器';
            }
        });
    }
    
    async function displayZip() {
        showLoading('正在解压文件...');
        
        try {
            // 获取ZIP文件
            const response = await fetch(currentComic.fileUrl);
            const blob = await response.blob();
            
            // 使用JSZip解压
            const zip = await JSZip.loadAsync(blob);
            const imageFiles = [];
            
            // 收集所有图片文件
            zip.forEach((relativePath, file) => {
                if (!file.dir && file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                    imageFiles.push(file);
                }
            });
            
            // 按文件名排序
            imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            
            // 转换为Blob URL
            images = await Promise.all(
                imageFiles.map(file => file.async('blob').then(blob => URL.createObjectURL(blob)))
            );
            
            totalPages = images.length;
            currentPage = 1;
            
            // 显示第一页
            showImage(currentPage);
            
            // 设置导航
            const navigate = (direction) => {
                const newPage = currentPage + direction;
                if (newPage >= 1 && newPage <= totalPages) {
                    currentPage = newPage;
                    showImage(currentPage);
                }
            };
            
            prevPageBtn.onclick = () => navigate(-1);
            nextPageBtn.onclick = () => navigate(1);
            
            // 键盘导航
            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') navigate(-1);
                if (e.key === 'ArrowRight') navigate(1);
            });
            
        } catch (error) {
            console.error('解压ZIP失败:', error);
            showError(`解压文件失败: ${error.message}`);
        }
    }
    
    function showImage(page) {
        comicContent.innerHTML = `<img src="${images[page - 1]}" alt="Page ${page}" style="max-width: 100%; max-height: 100%; object-fit: contain; transform: scale(${zoomLevel}); transform-origin: center;">`;
        updatePageCounter();
    }

    function updatePageCounter() {
        pageCounter.textContent = `${currentPage} / ${totalPages}`;
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    }

    function applyZoom() {
        const img = comicContent.querySelector('img');
        if (img) {
            img.style.transform = `scale(${zoomLevel})`;
        }
    }

    zoomInBtn.addEventListener('click', () => { 
        zoomLevel = Math.min(zoomLevel + 0.2, 3); 
        applyZoom(); 
    });
    
    zoomOutBtn.addEventListener('click', () => { 
        zoomLevel = Math.max(zoomLevel - 0.2, 0.5); 
        applyZoom(); 
    });
    
    zoomResetBtn.addEventListener('click', () => { 
        zoomLevel = 1; 
        applyZoom(); 
    });

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('全屏请求失败:', err);
            });
        } else {
            document.exitFullscreen();
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            fullscreenBtn.textContent = '❐';
            fullscreenBtn.title = '退出全屏';
        } else {
            fullscreenBtn.textContent = '⛶';
            fullscreenBtn.title = '全屏';
        }
    });

    // 初始化
    loadComic();
});