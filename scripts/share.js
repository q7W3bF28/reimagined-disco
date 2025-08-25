document.addEventListener('DOMContentLoaded', function() {
    if (typeof Ably === 'undefined') {
        console.error('Ably library not loaded');
        showError('必要库加载失败，请刷新页面重试');
        return;
    }

    // Ably配置
    const ably = new Ably.Realtime('nc5NGw.wSmsXg:SMs5pD5aJ4hGMvNZnd7pJp2lYS2X1iCmWm_yeLx_pkk');
    const channel = ably.channels.get('comic-share');
    
    // GoFile配置
    const goFileToken = '8UO7T53rxM6Eh3WzolDR4SeaLedZ17bE';
    
    // DOM元素
    const bookshelfGrid = document.getElementById('bookshelf-grid');
    const nextToUploadBtn = document.getElementById('next-to-upload');
    const backToShelvesBtn = document.getElementById('back-to-shelves');
    const uploadForm = document.getElementById('upload-form');
    const shareAnotherBtn = document.getElementById('share-another');
    const selectedShelfName = document.getElementById('selected-shelf-name');
    const newPasswordEl = document.getElementById('new-password');
    const comicFileInput = document.getElementById('comic-file');
    const fileNameSpan = document.getElementById('file-name');
    const copyPasswordBtn = document.getElementById('copy-password-btn');
    const copyFeedback = document.getElementById('copy-feedback');
    const uploadStatusEl = document.getElementById('upload-status');
    const submitBtn = document.getElementById('submit-btn');

    let selectedShelf = null;

    // 显示错误消息
    function showError(message) {
        uploadStatusEl.innerHTML = `<div class="error">${message}</div>`;
    }

    // 显示成功消息
    function showSuccess(message) {
        uploadStatusEl.innerHTML = `<div class="success">${message}</div>`;
    }

    // 显示加载状态
    function showLoading(message = "处理中，请稍候...") {
        uploadStatusEl.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <span>${message}</span>
            </div>
        `;
    }

    function switchStep(stepToShow) {
        document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
        document.getElementById(stepToShow).classList.add('active');
    }

    function initBookshelves() {
        if (!bookshelfGrid) return;
        bookshelfGrid.innerHTML = '';
        for (let i = 1; i <= 10; i++) {
            const bookshelfItem = document.createElement('div');
            bookshelfItem.className = 'bookshelf-item';
            bookshelfItem.dataset.shelfId = i;
            
            bookshelfItem.innerHTML = `
                <div class="icon">📚</div>
                <h3>书柜 ${i}</h3>
                <p>点击选择</p>
            `;
            bookshelfItem.addEventListener('click', () => selectBookshelf(i));
            bookshelfGrid.appendChild(bookshelfItem);
        }
    }

    function selectBookshelf(shelfId) {
        document.querySelectorAll('.bookshelf-item').forEach(item => {
            item.classList.remove('selected');
        });
        const selectedItem = document.querySelector(`.bookshelf-item[data-shelf-id="${shelfId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        selectedShelf = shelfId;
        if (nextToUploadBtn) {
            nextToUploadBtn.disabled = false;
        }
    }

    comicFileInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            fileNameSpan.textContent = file.name;
            // 检查文件大小
            if (file.size > 500 * 1024 * 1024) {
                showError('文件太大！最大不能超过 500MB。');
                this.value = ''; // 清空文件选择
                fileNameSpan.textContent = '未选择文件';
            } else {
                uploadStatusEl.innerHTML = ''; // 清除错误信息
            }
        } else {
            fileNameSpan.textContent = '未选择文件';
        }
    });

    nextToUploadBtn.addEventListener('click', () => switchStep('step2'));
    backToShelvesBtn.addEventListener('click', () => switchStep('step1'));

    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const title = document.getElementById('comic-title').value.trim();
        const description = document.getElementById('comic-desc').value.trim();
        const file = comicFileInput.files[0];
        
        // 验证输入
        if (!title) {
            showError('请输入漫画标题');
            return;
        }
        
        if (!file) {
            showError('请选择一个漫画文件');
            return;
        }
        
        if (file.size > 500 * 1024 * 1024) {
            showError('文件太大！最大不能超过 500MB');
            return;
        }
        
        submitBtn.disabled = true;
        showLoading('上传中，请稍候...');
        
        try {
            // 获取GoFile服务器
            const serverResponse = await fetch('https://api.gofile.io/getServer');
            const serverData = await serverResponse.json();
            
            if (serverData.status !== 'ok') {
                throw new Error('无法获取上传服务器: ' + (serverData.message || '未知错误'));
            }
            
            const server = serverData.data.server;
            
            // 创建FormData
            const formData = new FormData();
            formData.append('file', file);
            
            // 上传文件 - 修复API调用方式
            const uploadResponse = await fetch(`https://${server}.gofile.io/uploadFile`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${goFileToken}`
                }
            });
            
            const result = await uploadResponse.json();
            
            if (result.status !== 'ok') {
                throw new Error(result.message || '文件上传失败');
            }
            
            const fileUrl = `https://gofile.io/d/${result.data.fileId}`;
            const newPassword = Math.floor(100000 + Math.random() * 900000).toString();
            
            const comicData = {
                id: result.data.fileId,
                title,
                description,
                fileUrl,
                fileType: file.name.split('.').pop().toLowerCase(),
                uploadTime: new Date().toISOString(),
                shelfId: selectedShelf,
                fileName: file.name,
                fileSize: (file.size / 1024 / 1024).toFixed(2) + ' MB'
            };
            
            // 发布到Ably频道
            channel.publish({ 
                name: `comic-upload:shelf-${selectedShelf}`, 
                data: { 
                    password: newPassword, 
                    data: comicData 
                } 
            });
            
            switchStep('step3');
            selectedShelfName.textContent = `书柜 ${selectedShelf}`;
            newPasswordEl.textContent = newPassword;
            
        } catch (error) {
            console.error('上传失败:', error);
            showError(`上传失败: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
        }
    });

    shareAnotherBtn.addEventListener('click', function() {
        uploadForm.reset();
        fileNameSpan.textContent = '未选择文件';
        uploadStatusEl.innerHTML = '';
        switchStep('step1');
        
        document.querySelectorAll('.bookshelf-item').forEach(item => item.classList.remove('selected'));
        selectedShelf = null;
        nextToUploadBtn.disabled = true;
    });

    copyPasswordBtn.addEventListener('click', function() {
        navigator.clipboard.writeText(newPasswordEl.textContent).then(() => {
            copyFeedback.textContent = '复制成功!';
            copyFeedback.style.color = 'var(--success-color)';
            setTimeout(() => { copyFeedback.textContent = ''; }, 2000);
        }, () => {
            copyFeedback.textContent = '复制失败!';
            copyFeedback.style.color = 'var(--danger-color)';
        });
    });

    // 初始化页面
    initBookshelves();
});