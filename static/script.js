// ComfyUI Web Interface JavaScript

// State
let queueUpdateInterval;
let currentImageIndex = 0;
let images = [];
let currentImageData = null;
let touchStartX = 0;
let touchEndX = 0;
let mouseActivityTimer = null;
let isFullscreenActive = false;
let currentPath = '';
let selectedItems = new Set();
let allItems = [];
let selectionMode = false;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeTabs();
    browseFolder('');
    startQueueUpdates();
});

// Event Listeners
function initializeEventListeners() {
    // Queue toggle
    document.getElementById('toggleQueue').addEventListener('click', toggleQueue);
    document.getElementById('clearQueueBtn').addEventListener('click', clearQueue);
    
    // Generate button
    document.getElementById('generateBtn').addEventListener('click', generateImage);
    
    // Image modal
    document.getElementById('closeImageBtn').addEventListener('click', closeImageModal);
    document.getElementById('imageOverlay').addEventListener('click', closeImageModal);
    document.getElementById('imagePrev').addEventListener('click', prevImage);
    document.getElementById('imageNext').addEventListener('click', nextImage);
    document.getElementById('importBtn').addEventListener('click', importImageData);
    document.getElementById('deleteImageBtn').addEventListener('click', deleteCurrentImage);
    
    // Clear seed button
    document.getElementById('clearSeedBtn').addEventListener('click', clearSeed);
    
    // Fullscreen viewer
    document.getElementById('fullscreenBtn').addEventListener('click', openFullscreen);
    document.getElementById('fullscreenClose').addEventListener('click', closeFullscreen);
    document.getElementById('fullscreenPrev').addEventListener('click', fullscreenPrevImage);
    document.getElementById('fullscreenNext').addEventListener('click', fullscreenNextImage);
    
    // Folder management
    document.getElementById('newFolderBtn').addEventListener('click', createNewFolder);
    document.getElementById('setOutputFolderBtn').addEventListener('click', setOutputFolder);
    document.getElementById('selectionModeBtn').addEventListener('click', toggleSelectionMode);
    document.getElementById('moveBtn').addEventListener('click', moveSelectedItems);
    document.getElementById('deleteBtn').addEventListener('click', deleteSelectedItems);
    
    // NSFW toggle
    document.getElementById('nsfwToggle').addEventListener('click', toggleNSFW);
    
    // Touch support for fullscreen
    initTouchSupport();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
}

// Tab Management
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabName) {
    // Update button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Update content visibility
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const tabs = {
        'single': 'singleTab',
        'batch': 'batchTab',
        'browser': 'browserTab'
    };
    
    const targetContent = document.getElementById(tabs[tabName]);
    if (targetContent) {
        targetContent.classList.add('active');
    }
}

// NSFW Toggle
function toggleNSFW() {
    const checkbox = document.getElementById('nsfw');
    const toggle = document.getElementById('nsfwToggle');
    
    checkbox.checked = !checkbox.checked;
    
    if (checkbox.checked) {
        toggle.classList.add('nsfw-active');
    } else {
        toggle.classList.remove('nsfw-active');
    }
}

// Initialize NSFW button state on import
function updateNSFWButton() {
    const checkbox = document.getElementById('nsfw');
    const toggle = document.getElementById('nsfwToggle');
    
    if (checkbox.checked) {
        toggle.classList.add('nsfw-active');
    } else {
        toggle.classList.remove('nsfw-active');
    }
}

// Custom Dialog Functions
function showAlert(message, title = 'Notice') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customAlert');
        document.getElementById('alertTitle').textContent = title;
        document.getElementById('alertMessage').textContent = message;
        modal.style.display = 'flex';
        
        const okBtn = document.getElementById('alertOkBtn');
        const handler = () => {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', handler);
            resolve();
        };
        okBtn.addEventListener('click', handler);
    });
}

function showPrompt(message, defaultValue = '', title = 'Input Required') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customDialog');
        document.getElementById('dialogTitle').textContent = title;
        document.getElementById('dialogMessage').textContent = message;
        document.getElementById('dialogInput').style.display = 'block';
        document.getElementById('dialogInputField').value = defaultValue;
        document.getElementById('dialogInputField').placeholder = defaultValue || '';
        modal.style.display = 'flex';
        
        const confirmBtn = document.getElementById('dialogConfirmBtn');
        const cancelBtn = document.getElementById('dialogCancelBtn');
        
        const cleanup = (result) => {
            modal.style.display = 'none';
            document.getElementById('dialogInput').style.display = 'none';
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            resolve(result);
        };
        
        const confirmHandler = () => {
            const value = document.getElementById('dialogInputField').value;
            cleanup(value);
        };
        
        const cancelHandler = () => cleanup(null);
        
        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);
        
        // Focus input
        setTimeout(() => document.getElementById('dialogInputField').focus(), 100);
    });
}

function showConfirm(message, title = 'Confirm') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customDialog');
        document.getElementById('dialogTitle').textContent = title;
        document.getElementById('dialogMessage').textContent = message;
        document.getElementById('dialogInput').style.display = 'none';
        modal.style.display = 'flex';
        
        const confirmBtn = document.getElementById('dialogConfirmBtn');
        const cancelBtn = document.getElementById('dialogCancelBtn');
        
        const cleanup = (result) => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            resolve(result);
        };
        
        const confirmHandler = () => cleanup(true);
        const cancelHandler = () => cleanup(false);
        
        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);
    });
}

// Delete Current Image
async function deleteCurrentImage() {
    if (!currentImageData) return;
    
    const confirmed = await showConfirm('Delete this image? This cannot be undone.', 'Confirm Delete');
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: [currentImageData.relative_path]
            })
        });
        
        const result = await response.json();
        if (result.success) {
            closeImageModal();
            browseFolder(currentPath);
        } else if (result.errors.length > 0) {
            await showAlert('Error: ' + result.errors.join('\n'), 'Delete Error');
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        await showAlert('Error deleting image', 'Error');
    }
}

// Clear seed field
function clearSeed() {
    document.getElementById('seed').value = '';
    document.getElementById('seed').focus();
}

// Queue Management
function toggleQueue() {
    const sidebar = document.getElementById('queueSidebar');
    sidebar.classList.toggle('collapsed');
}

async function clearQueue() {
    const confirmed = await showConfirm('Clear all queued and completed items? This will not cancel the currently generating item.', 'Clear Queue');
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/queue/clear', {
            method: 'POST'
        });
        
        if (response.ok) {
            updateQueue();
        } else {
            await showAlert('Failed to clear queue', 'Error');
        }
    } catch (error) {
        console.error('Error clearing queue:', error);
        await showAlert('Error clearing queue', 'Error');
    }
}

function startQueueUpdates() {
    updateQueue();
    queueUpdateInterval = setInterval(updateQueue, 1000);
}

async function updateQueue() {
    try {
        const response = await fetch('/api/queue');
        const data = await response.json();
        
        renderQueue(data.queue, data.active, data.completed || []);
        
        // Check if active job just completed with refresh flag
        if (data.active && data.active.status === 'completed' && data.active.refresh_folder) {
            // Refresh folder after a short delay
            setTimeout(() => browseFolder(currentPath), 1000);
        }
    } catch (error) {
        console.error('Error updating queue:', error);
    }
}

function renderQueue(queue, active, completed) {
    const queueList = document.getElementById('queueList');
    const activeJob = document.getElementById('activeJob');
    const completedList = document.getElementById('completedList');
    const queueEmpty = document.getElementById('queueEmpty');
    
    // Filter out the active job from the queue to avoid duplicates
    if (active) {
        queue = queue.filter(job => job.id !== active.id);
    }
    
    // Render queued jobs at the top
    if (queue.length > 0) {
        queueList.innerHTML = queue.map(job => renderQueueItem(job, false)).join('');
        queueList.style.display = 'block';
    } else {
        queueList.innerHTML = '';
        queueList.style.display = 'none';
    }
    
    // Render active/generating job in the middle
    if (active) {
        activeJob.innerHTML = renderQueueItem(active, true);
        activeJob.style.display = 'block';
    } else {
        activeJob.style.display = 'none';
    }
    
    // Render completed jobs at the bottom
    if (completed && completed.length > 0) {
        completedList.innerHTML = completed.map(job => renderQueueItem(job, false)).join('');
        completedList.style.display = 'block';
    } else {
        completedList.innerHTML = '';
        completedList.style.display = 'none';
    }
    
    // Show empty message only if nothing to display
    const hasItems = queue.length > 0 || active || (completed && completed.length > 0);
    queueEmpty.style.display = hasItems ? 'none' : 'block';
}

function renderQueueItem(job, isActive) {
    const statusClass = `status-${job.status}`;
    const hasImage = job.status === 'completed' && job.relative_path;
    
    return `
        <div class="queue-item ${isActive ? 'active' : ''} ${hasImage ? 'has-image' : ''}">
            ${hasImage ? `
                <div class="queue-item-image">
                    <img src="/outputs/${job.relative_path}" alt="Generated image" onclick="event.stopPropagation(); openCompletedImage('${job.relative_path}')">
                </div>
            ` : ''}
            <div class="queue-item-content">
                <div class="queue-item-header">
                    <span class="queue-item-status ${statusClass}">${job.status}</span>
                    ${job.status === 'queued' ? `
                        <button class="queue-item-cancel" onclick="cancelJob('${job.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    ` : ''}
                </div>
                <div class="queue-item-prompt">${escapeHtml(job.prompt)}</div>
                <div class="queue-item-params">
                    <span class="param-badge">${job.width}x${job.height}</span>
                    <span class="param-badge">${job.steps} steps</span>
                    ${job.nsfw ? '<span class="param-badge nsfw-badge">NSFW</span>' : ''}
                </div>
            </div>
        </div>
    `;
}

async function cancelJob(jobId) {
    try {
        const response = await fetch(`/api/queue/${jobId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            updateQueue();
        }
    } catch (error) {
        console.error('Error canceling job:', error);
    }
}

function openCompletedImage(relativePath) {
    // Switch to browser tab and find the image
    switchTab('browser');
    
    // Extract folder path from relative path
    const parts = relativePath.split(/[\/\\]/);
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    
    // Browse to the folder containing the image
    browseFolder(folderPath);
}

// Image Generation
async function generateImage() {
    const prompt = document.getElementById('prompt').value.trim();
    
    if (!prompt) {
        await showAlert('Please enter a prompt');
        return;
    }
    
    const data = {
        prompt: prompt,
        width: parseInt(document.getElementById('width').value),
        height: parseInt(document.getElementById('height').value),
        steps: parseInt(document.getElementById('steps').value),
        seed: document.getElementById('seed').value ? parseInt(document.getElementById('seed').value) : null,
        nsfw: document.getElementById('nsfw').checked,
        file_prefix: document.getElementById('filePrefix').value.trim() || 'comfyui',
        subfolder: document.getElementById('subfolder').value.trim()
    };
    
    try {
        const response = await fetch('/api/queue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Job queued:', result.job_id);
            
            // Update queue immediately
            updateQueue();
            
            // Reload gallery after a delay to show new image
            setTimeout(() => browseFolder(currentPath), 3000);
        }
    } catch (error) {
        console.error('Error queueing job:', error);
        await showAlert('Error queueing job. Make sure ComfyUI is running.', 'Error');
    }
}

// Folder Browsing
async function browseFolder(path) {
    try {
        const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        currentPath = data.current_path;
        allItems = [...data.folders, ...data.files];
        images = data.files;
        selectedItems.clear();
        
        renderBreadcrumb(currentPath);
        renderGallery(data.folders, data.files);
        updateSelectionButtons();
    } catch (error) {
        console.error('Error browsing folder:', error);
    }
}

function renderBreadcrumb(path) {
    const breadcrumb = document.getElementById('breadcrumb');
    const parts = path ? path.split(/[/\\]/).filter(p => p) : [];
    
    let html = '<span class="breadcrumb-item" onclick="browseFolder(\'\')">🏠 Root</span>';
    
    let currentPath = '';
    parts.forEach((part, index) => {
        currentPath += (currentPath ? '/' : '') + part;
        const pathCopy = currentPath;
        html += ' / ';
        html += `<span class="breadcrumb-item" onclick="browseFolder('${pathCopy}')">${escapeHtml(part)}</span>`;
    });
    
    breadcrumb.innerHTML = html;
}

function renderGallery(folders, files) {
    const galleryGrid = document.getElementById('galleryGrid');
    const galleryEmpty = document.getElementById('galleryEmpty');
    
    let html = '';
    
    // Add back button if not at root
    if (currentPath) {
        const parentPath = currentPath.split(/[/\\]/).slice(0, -1).join('/');
        html += `
            <div class="gallery-item folder-item" onclick="browseFolder('${parentPath}')">
                <div class="folder-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">..</div>
                </div>
            </div>
        `;
    }
    
    // Render folders
    folders.forEach(folder => {
        const isSelected = selectedItems.has(folder.path);
        const clickHandler = selectionMode ? `toggleItemSelection(event, '${folder.path}')` : `browseFolder('${folder.path}')`;
        html += `
            <div class="gallery-item folder-item ${isSelected ? 'selected' : ''} ${selectionMode ? 'selection-mode' : ''}" 
                 data-path="${folder.path}" 
                 data-type="folder"
                 onclick="${clickHandler}">
                <div class="folder-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">${escapeHtml(folder.name)}</div>
                </div>
            </div>
        `;
    });
    
    // Render files
    files.forEach(file => {
        const isSelected = selectedItems.has(file.relative_path);
        const clickHandler = selectionMode ? `toggleItemSelection(event, '${file.relative_path}')` : `openImageModal('${file.id}')`;
        html += `
            <div class="gallery-item ${isSelected ? 'selected' : ''} ${selectionMode ? 'selection-mode' : ''}" 
                 data-path="${file.relative_path}" 
                 data-type="file"
                 onclick="${clickHandler}">
                <img src="/outputs/${file.relative_path}" alt="Generated Image" class="gallery-item-image">
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">${escapeHtml(file.prompt)}</div>
                    <div class="gallery-item-meta">
                        <span class="param-badge">${file.width}x${file.height}</span>
                        <span class="param-badge">${file.steps} steps</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    if (html) {
        galleryGrid.innerHTML = html;
        galleryGrid.style.display = 'grid';
        galleryEmpty.style.display = 'none';
    } else {
        galleryGrid.style.display = 'none';
        galleryEmpty.style.display = 'block';
    }
}

function toggleItemSelection(event, path) {
    if (event.target.closest('.folder-icon')) return; // Don't select on folder icon click
    
    event.stopPropagation();
    
    if (selectedItems.has(path)) {
        selectedItems.delete(path);
    } else {
        selectedItems.add(path);
    }
    
    // Update UI
    const item = document.querySelector(`[data-path="${path}"]`);
    if (item) {
        item.classList.toggle('selected');
    }
    
    updateSelectionButtons();
}

function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const btn = document.getElementById('selectionModeBtn');
    
    if (selectionMode) {
        btn.classList.add('btn-active');
    } else {
        btn.classList.remove('btn-active');
        // Clear selections when exiting selection mode
        selectedItems.clear();
    }
    
    // Re-render gallery to update click handlers
    browseFolder(currentPath);
}

function updateSelectionButtons() {
    const moveBtn = document.getElementById('moveBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const hasSelection = selectedItems.size > 0 && selectionMode;
    
    moveBtn.style.display = hasSelection ? 'inline-flex' : 'none';
    deleteBtn.style.display = hasSelection ? 'inline-flex' : 'none';
}

// Folder Management
async function createNewFolder() {
    const name = await showPrompt('Enter folder name:', '', 'Create Folder');
    if (!name) return;
    
    try {
        const response = await fetch('/api/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                parent: currentPath
            })
        });
        
        const result = await response.json();
        if (result.success) {
            browseFolder(currentPath);
        } else {
            await showAlert('Error: ' + result.error, 'Error');
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        await showAlert('Error creating folder', 'Error');
    }
}

async function setOutputFolder() {
    document.getElementById('subfolder').value = currentPath;
    await showAlert(`Output folder set to: ${currentPath || 'Root'}`, 'Output Folder Set');
}

async function moveSelectedItems() {
    if (selectedItems.size === 0) return;
    
    const target = await showPrompt('Enter target folder path (leave empty for root):', '', 'Move Items');
    if (target === null) return; // Cancelled
    
    try {
        const response = await fetch('/api/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: Array.from(selectedItems),
                target: target
            })
        });
        
        const result = await response.json();
        if (result.errors.length > 0) {
            await showAlert('Errors occurred:\n' + result.errors.join('\n'), 'Move Errors');
        }
        
        browseFolder(currentPath);
    } catch (error) {
        console.error('Error moving items:', error);
        await showAlert('Error moving items', 'Error');
    }
}

async function deleteSelectedItems() {
    if (selectedItems.size === 0) return;
    
    const count = selectedItems.size;
    const confirmed = await showConfirm(`Delete ${count} item(s)? This cannot be undone.`, 'Confirm Delete');
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: Array.from(selectedItems)
            })
        });
        
        const result = await response.json();
        if (result.errors.length > 0) {
            await showAlert('Errors occurred:\n' + result.errors.join('\n'), 'Delete Errors');
        }
        
        browseFolder(currentPath);
    } catch (error) {
        console.error('Error deleting items:', error);
        await showAlert('Error deleting items', 'Error');
    }
}

// Image Modal
async function openImageModal(imageId) {
    try {
        // Find the index of this image
        currentImageIndex = images.findIndex(img => img.id === imageId);
        if (currentImageIndex === -1) currentImageIndex = 0;
        
        showImageAtIndex(currentImageIndex);
        document.getElementById('imageModal').classList.add('active');
    } catch (error) {
        console.error('Error loading image:', error);
    }
}

function closeImageModal() {
    document.getElementById('imageModal').classList.remove('active');
}

function showImageAtIndex(index) {
    if (images.length === 0) return;
    
    // Wrap around
    if (index >= images.length) {
        currentImageIndex = 0;
    } else if (index < 0) {
        currentImageIndex = images.length - 1;
    } else {
        currentImageIndex = index;
    }
    
    const image = images[currentImageIndex];
    currentImageData = image; // Store current image data for import
    document.getElementById('detailImage').src = `/outputs/${image.filename}`;
    document.getElementById('imageCounter').textContent = `${currentImageIndex + 1} / ${images.length}`;
    document.getElementById('imageMetadata').innerHTML = renderMetadata(image);
}

function nextImage() {
    showImageAtIndex(currentImageIndex + 1);
}

function prevImage() {
    showImageAtIndex(currentImageIndex - 1);
}



// Metadata Rendering
function renderMetadata(image) {
    return `
        <div class="metadata-grid">
            <div class="metadata-item metadata-prompt">
                <div class="metadata-label">Prompt</div>
                <div class="metadata-value">${escapeHtml(image.prompt)}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Dimensions</div>
                <div class="metadata-value">${image.width} × ${image.height}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Steps</div>
                <div class="metadata-value">${image.steps}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Seed</div>
                <div class="metadata-value">${image.seed}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">NSFW</div>
                <div class="metadata-value">${image.nsfw ? 'Yes' : 'No'}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Generated</div>
                <div class="metadata-value">${formatDate(image.timestamp)}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Filename</div>
                <div class="metadata-value">${image.filename}</div>
            </div>
        </div>
    `;
}

// Import Image Data
function importImageData() {
    if (!currentImageData) return;
    
    // Import all parameters to the form
    document.getElementById('prompt').value = currentImageData.prompt || '';
    document.getElementById('width').value = currentImageData.width || 512;
    document.getElementById('height').value = currentImageData.height || 1024;
    document.getElementById('steps').value = currentImageData.steps || 4;
    document.getElementById('seed').value = currentImageData.seed || '';
    document.getElementById('nsfw').checked = currentImageData.nsfw || false;
    document.getElementById('filePrefix').value = currentImageData.file_prefix || 'comfyui';
    document.getElementById('subfolder').value = currentImageData.subfolder || '';
    
    // Update NSFW button visual state
    updateNSFWButton();
    
    // Close the modal
    closeImageModal();
    
    // Scroll to the form
    document.querySelector('.generation-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Show a brief visual feedback
    const generateBtn = document.getElementById('generateBtn');
    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Imported!
    `;
    generateBtn.style.background = 'var(--success)';
    
    setTimeout(() => {
        generateBtn.innerHTML = originalText;
        generateBtn.style.background = '';
    }, 2000);
}

// Fullscreen Viewer
function openFullscreen() {
    if (images.length === 0) return;
    
    const viewer = document.getElementById('fullscreenViewer');
    viewer.classList.add('active');
    isFullscreenActive = true;
    
    // Request browser fullscreen
    if (viewer.requestFullscreen) {
        viewer.requestFullscreen();
    } else if (viewer.webkitRequestFullscreen) {
        viewer.webkitRequestFullscreen();
    } else if (viewer.msRequestFullscreen) {
        viewer.msRequestFullscreen();
    }
    
    showFullscreenImage(currentImageIndex);
    setupMouseActivityTracking();
}

function closeFullscreen() {
    isFullscreenActive = false;
    
    // Exit browser fullscreen
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
    
    const viewer = document.getElementById('fullscreenViewer');
    viewer.classList.remove('active');
    
    // Clear mouse activity timer
    if (mouseActivityTimer) {
        clearTimeout(mouseActivityTimer);
        mouseActivityTimer = null;
    }
}

function showFullscreenImage(index) {
    if (images.length === 0) return;
    
    // Wrap around
    if (index >= images.length) {
        currentImageIndex = 0;
    } else if (index < 0) {
        currentImageIndex = images.length - 1;
    } else {
        currentImageIndex = index;
    }
    
    const image = images[currentImageIndex];
    document.getElementById('fullscreenImage').src = `/outputs/${image.filename}`;
    document.getElementById('fullscreenCounter').textContent = `${currentImageIndex + 1} / ${images.length}`;
}

function fullscreenNextImage() {
    showFullscreenImage(currentImageIndex + 1);
}

function fullscreenPrevImage() {
    showFullscreenImage(currentImageIndex - 1);
}

// Touch Support
function initTouchSupport() {
    const viewer = document.getElementById('fullscreenViewer');
    
    viewer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, false);
    
    viewer.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, false);
}

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // Swiped left - next image
            fullscreenNextImage();
        } else {
            // Swiped right - previous image
            fullscreenPrevImage();
        }
    }
}

// Mouse Activity Tracking
function setupMouseActivityTracking() {
    const viewer = document.getElementById('fullscreenViewer');
    const controls = document.getElementById('fullscreenControls');
    
    // Show controls initially
    controls.classList.add('visible');
    
    // Hide controls after 2 seconds of inactivity
    const hideControls = () => {
        if (mouseActivityTimer) {
            clearTimeout(mouseActivityTimer);
        }
        mouseActivityTimer = setTimeout(() => {
            if (isFullscreenActive) {
                controls.classList.remove('visible');
            }
        }, 2000);
    };
    
    // Show controls on mouse movement
    viewer.addEventListener('mousemove', () => {
        if (isFullscreenActive) {
            controls.classList.add('visible');
            hideControls();
        }
    });
    
    // Start the initial timer
    hideControls();
}

// Keyboard Shortcuts
function handleKeyboard(e) {
    const imageModal = document.getElementById('imageModal');
    const fullscreenViewer = document.getElementById('fullscreenViewer');
    
    // Fullscreen viewer controls
    if (fullscreenViewer.classList.contains('active')) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            fullscreenPrevImage();
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            fullscreenNextImage();
        } else if (e.key === 'Escape') {
            closeFullscreen();
        }
        return;
    }
    
    // Image modal controls
    if (imageModal.classList.contains('active')) {
        if (e.key === 'ArrowLeft') {
            prevImage();
        } else if (e.key === 'ArrowRight') {
            nextImage();
        } else if (e.key === 'Escape') {
            closeImageModal();
        }
    }
}

// Utilities
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString();
}

// Auto-refresh gallery every 5 seconds
setInterval(() => {
    loadGallery();
}, 5000);
