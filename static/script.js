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
let lastSeenCompletedIds = new Set();

// Fullscreen zoom state
let zoomLevel = 1;
let zoomPanX = 0;
let zoomPanY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let lastTouchDistance = 0;

// Autoplay state
let autoplayTimer = null;
let isAutoplayActive = false;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeTabs();
    initializeMobileOverlay();
    browseFolder('');
    startQueueUpdates();
});

// Mobile Overlay for Sidebar
function initializeMobileOverlay() {
    const mainContent = document.querySelector('.main-content');
    const sidebar = document.getElementById('queueSidebar');
    
    // Start with sidebar collapsed on mobile
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.add('collapsed');
    }
    
    // Prevent clicks inside sidebar from closing it
    if (sidebar) {
        sidebar.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
    
    // Close sidebar when clicking on main content on mobile
    if (mainContent && sidebar) {
        mainContent.addEventListener('click', function(e) {
            if (window.innerWidth <= 768 && !sidebar.classList.contains('collapsed')) {
                // Only close if we're on mobile and sidebar is open
                sidebar.classList.add('collapsed');
            }
        });
    }
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (sidebar) {
            if (window.innerWidth > 768) {
                // On desktop, remove collapsed class to show normal behavior
                sidebar.classList.remove('collapsed');
            } else {
                // On mobile, ensure it's collapsed by default
                if (!sidebar.classList.contains('collapsed')) {
                    // Only add if user hasn't manually opened it
                }
            }
        }
    });
}

// Event Listeners
function initializeEventListeners() {
    // Mobile menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }
    
    // Collapsible sections
    initializeCollapsibleSections();
    
    // Queue toggle
    document.getElementById('toggleQueue').addEventListener('click', toggleQueue);
    document.getElementById('clearQueueBtn').addEventListener('click', clearQueue);
    document.getElementById('unloadModelsBtn').addEventListener('click', unloadComfyUIModels);
    
    // Event delegation for cancel buttons and completed images (handles dynamically created content)
    document.addEventListener('click', function(e) {
        // Check if click is on or inside a cancel button
        const cancelBtn = e.target.closest('.queue-item-cancel');
        if (cancelBtn) {
            e.preventDefault();
            e.stopPropagation();
            
            const jobId = cancelBtn.getAttribute('data-job-id');
            console.log('Cancel button clicked, jobId:', jobId, 'button:', cancelBtn);
            
            if (jobId) {
                cancelJob(jobId);
            } else {
                console.error('Cancel button found but no job ID', cancelBtn);
            }
            return;
        }
        
        // Handle completed image clicks
        const completedImg = e.target.closest('.completed-image-thumb');
        if (completedImg) {
            const relativePath = completedImg.getAttribute('data-completed-image');
            if (relativePath) {
                e.preventDefault();
                e.stopPropagation();
                openCompletedImage(relativePath);
            }
        }
    }, true);
    
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
    
    // Fullscreen zoom controls
    document.getElementById('fullscreenZoomIn').addEventListener('click', () => adjustZoom(0.2));
    document.getElementById('fullscreenZoomOut').addEventListener('click', () => adjustZoom(-0.2));
    document.getElementById('fullscreenZoomReset').addEventListener('click', resetZoom);
    
    // Fullscreen autoplay controls
    document.getElementById('fullscreenPlayPause').addEventListener('click', toggleAutoplay);
    
    // Folder management
    document.getElementById('newFolderBtn').addEventListener('click', createNewFolder);
    document.getElementById('setOutputFolderBtn').addEventListener('click', setOutputFolder);
    document.getElementById('selectionModeBtn').addEventListener('click', toggleSelectionMode);
    document.getElementById('moveBtn').addEventListener('click', moveSelectedItems);
    document.getElementById('deleteBtn').addEventListener('click', deleteSelectedItems);
    
    // Touch support for fullscreen
    initTouchSupport();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
}

// Mobile Menu Toggle
function toggleMobileMenu(event) {
    // Prevent event from bubbling to main content
    if (event) {
        event.stopPropagation();
    }
    
    const sidebar = document.getElementById('queueSidebar');
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
        // Opening the sidebar
        sidebar.classList.remove('collapsed');
    } else {
        // Closing the sidebar
        sidebar.classList.add('collapsed');
    }
}

// Collapsible Sections
function initializeCollapsibleSections() {
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
    
    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const content = document.getElementById(targetId);
            
            if (content) {
                const isActive = content.classList.contains('active');
                
                // Toggle active state
                if (isActive) {
                    content.classList.remove('active');
                    this.classList.add('collapsed');
                } else {
                    content.classList.add('active');
                    this.classList.remove('collapsed');
                }
            }
        });
    });
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
        'browser': 'browserTab'
    };
    
    const targetContent = document.getElementById(tabs[tabName]);
    if (targetContent) {
        targetContent.classList.add('active');
    }
}

// Toast Notification System
function showNotification(message, title = 'Notice', type = 'info', duration = 5000) {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Icon based on type
    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };
    
    notification.innerHTML = `
        <div class="notification-icon">${icons[type]}</div>
        <div class="notification-content">
            <div class="notification-title">${escapeHtml(title)}</div>
            <div class="notification-message">${escapeHtml(message)}</div>
        </div>
        <button class="notification-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    
    container.appendChild(notification);
    
    // Close button handler
    const closeBtn = notification.querySelector('.notification-close');
    const close = () => {
        notification.classList.add('closing');
        setTimeout(() => notification.remove(), 300);
    };
    
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
    });
    
    // Click notification to close
    notification.addEventListener('click', close);
    
    // Auto-close after duration
    if (duration > 0) {
        setTimeout(close, duration);
    }
}

// Legacy showAlert wrapper for compatibility
function showAlert(message, title = 'Notice') {
    showNotification(message, title, 'info', 5000);
    return Promise.resolve();
}

// Custom Dialog Functions (keep for prompts and confirms)

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
            showNotification('Image deleted successfully', 'Deleted', 'success', 3000);
        } else if (result.errors.length > 0) {
            showNotification('Error: ' + result.errors.join('\n'), 'Delete Error', 'error');
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        showNotification('Error deleting image', 'Error', 'error');
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
    const confirmed = await showConfirm('Clear all queued items? Completed history will be preserved.', 'Clear Queue');
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/queue/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Force immediate UI update
            await updateQueue();
            showNotification(`Cleared ${result.cleared_queued} queued item(s)`, 'Queue Cleared', 'success', 3000);
        } else {
            showNotification('Failed to clear queue', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error clearing queue:', error);
        showNotification('Error clearing queue', 'Error', 'error');
    }
}

async function unloadComfyUIModels() {
    const confirmed = await showConfirm(
        'Unload all ComfyUI models and clear memory (RAM/VRAM/cache)? This is useful to free up system resources when idle.',
        'Unload Models'
    );
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/comfyui/unload', {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        let result;
        try {
            result = await response.json();
        } catch (jsonError) {
            // If JSON parsing fails, assume success if response was OK
            console.warn('Could not parse JSON response, assuming success');
            result = { success: true };
        }
        
        if (result.success) {
            showNotification('Models unloaded and memory cleared', 'Success', 'success', 3000);
            // Hide timer immediately after manual unload
            const timerElement = document.getElementById('autoUnloadTimer');
            if (timerElement) {
                timerElement.style.display = 'none';
            }
            // Update timer status to reflect reset
            setTimeout(() => updateAutoUnloadTimer(), 500);
        } else {
            showNotification('Error: ' + (result.error || 'Unknown error'), 'Unload Failed', 'error');
        }
    } catch (error) {
        console.error('Error unloading models:', error);
        showNotification('Failed to unload models: ' + error.message, 'Error', 'error');
    }
}

async function updateAutoUnloadTimer() {
    try {
        const response = await fetch('/api/comfyui/status');
        if (!response.ok) return;
        
        const status = await response.json();
        const timerElement = document.getElementById('autoUnloadTimer');
        const timerText = document.getElementById('timerText');
        
        if (!timerElement || !timerText) return;
        
        if (status.timer_active && status.unload_in_seconds > 0) {
            // Show timer with countdown
            const minutes = Math.floor(status.unload_in_seconds / 60);
            const seconds = status.unload_in_seconds % 60;
            timerText.textContent = `Auto-unload in ${minutes}:${seconds.toString().padStart(2, '0')}`;
            timerElement.style.display = 'flex';
        } else {
            // Hide timer when not active
            timerElement.style.display = 'none';
        }
    } catch (error) {
        console.error('Error updating timer:', error);
    }
}

function startQueueUpdates() {
    // Clear tracking on startup to allow folder refresh for existing completions
    lastSeenCompletedIds.clear();
    
    // Start polling queue and timer
    updateQueue();
    updateAutoUnloadTimer();
    queueUpdateInterval = setInterval(() => {
        updateQueue();
        updateAutoUnloadTimer();
    }, 1000);
}

async function updateQueue() {
    try {
        const response = await fetch('/api/queue');
        if (!response.ok) {
            console.error('Queue update failed:', response.status);
            return;
        }
        
        const data = await response.json();
        
        // Check for new completions BEFORE rendering
        const completedJobs = data.completed || [];
        let shouldRefreshFolder = false;
        
        for (const job of completedJobs) {
            if (job.status === 'completed' && job.refresh_folder && !lastSeenCompletedIds.has(job.id)) {
                lastSeenCompletedIds.add(job.id);
                shouldRefreshFolder = true;
            }
        }
        
        // Render the queue
        renderQueue(data.queue, data.active, completedJobs);
        
        // Refresh folder if we detected new completions
        if (shouldRefreshFolder) {
            setTimeout(() => {
                browseFolder(currentPath);
            }, 500);
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
    const queueCounter = document.getElementById('queueCounter');
    
    if (!queueList || !activeJob || !completedList || !queueEmpty || !queueCounter) {
        console.error('Queue DOM elements not found');
        return;
    }
    
    // Ensure we have arrays
    queue = Array.isArray(queue) ? queue : [];
    completed = Array.isArray(completed) ? completed : [];
    
    // Filter out the active job from the queue to avoid duplicates
    if (active) {
        queue = queue.filter(job => job.id !== active.id);
    }
    
    // Update queue counter
    queueCounter.textContent = queue.length;
    queueCounter.style.display = queue.length > 0 ? 'inline-block' : 'none';
    
    // Render queued jobs at the top
    if (queue.length > 0) {
        queueList.innerHTML = queue.map(job => renderQueueItem(job, false)).join('');
        queueList.style.display = 'block';
    } else {
        queueList.innerHTML = '';
        queueList.style.display = 'none';
    }
    
    // Render active/generating job in the middle
    if (active && active.id) {
        activeJob.innerHTML = renderQueueItem(active, true);
        activeJob.style.display = 'block';
    } else {
        activeJob.innerHTML = '';
        activeJob.style.display = 'none';
    }
    
    // Render completed jobs at the bottom
    if (completed.length > 0) {
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
    
    // Ensure job.id exists
    if (!job.id) {
        console.error('Job missing ID:', job);
        return '';
    }
    
    return `
        <div class="queue-item ${isActive ? 'active' : ''} ${hasImage ? 'has-image' : ''}" data-job-id="${escapeHtml(job.id)}">
            ${hasImage ? `
                <div class="queue-item-image">
                    <img src="/outputs/${job.relative_path}" alt="Generated image" data-completed-image="${escapeHtml(job.relative_path)}" class="completed-image-thumb">
                </div>
            ` : ''}
            <div class="queue-item-content">
                <div class="queue-item-header">
                    <span class="queue-item-status ${statusClass}">${job.status}</span>
                    ${(job.status === 'queued' || job.status === 'completed' || job.status === 'failed') && !isActive ? `
                        <button class="queue-item-cancel" data-job-id="${escapeHtml(job.id)}" title="Remove this item">
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
                </div>
            </div>
        </div>
    `;
}

async function cancelJob(jobId) {
    console.log('cancelJob called with jobId:', jobId);
    try {
        const response = await fetch(`/api/queue/${jobId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('Delete response status:', response.status);
        const result = await response.json();
        console.log('Delete response:', result);
        
        if (result.success) {
            // Remove from local tracking if it was completed
            lastSeenCompletedIds.delete(jobId);
            
            // Force immediate UI update
            console.log('Updating queue after deletion...');
            await updateQueue();
            showNotification('Item removed', 'Removed', 'success', 2000);
        } else {
            console.error('Failed to remove:', result.error);
            showNotification(result.error || 'Failed to remove item', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error removing job:', error);
        showNotification('Error removing item', 'Error', 'error');
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
        showNotification('Please enter a prompt', 'Missing Prompt', 'warning');
        return;
    }
    
    const data = {
        prompt: prompt,
        width: parseInt(document.getElementById('width').value),
        height: parseInt(document.getElementById('height').value),
        steps: parseInt(document.getElementById('steps').value),
        seed: document.getElementById('seed').value ? parseInt(document.getElementById('seed').value) : null,
        file_prefix: document.getElementById('filePrefix').value.trim() || 'comfyui',
        subfolder: document.getElementById('subfolder').value.trim(),
        mcnl_lora: document.getElementById('mcnlLora').checked,
        snofs_lora: document.getElementById('snofsLora').checked,
        oface_lora: document.getElementById('ofaceLora').checked
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
            showNotification('Image added to queue', 'Queued', 'success', 3000);
        }
    } catch (error) {
        console.error('Error queueing job:', error);
        showNotification('Error queueing job. Make sure ComfyUI is running.', 'Error', 'error');
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
            showNotification('Folder created successfully', 'Created', 'success', 3000);
        } else {
            showNotification('Error: ' + result.error, 'Error', 'error');
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        showNotification('Error creating folder', 'Error', 'error');
    }
}

async function setOutputFolder() {
    // Set output folder
    document.getElementById('subfolder').value = currentPath;
    showNotification(`Output folder set to: ${currentPath || 'Root'}`, 'Output Folder Set', 'success', 3000);
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
            showNotification('Errors occurred:\n' + result.errors.join('\n'), 'Move Errors', 'error');
        } else if (result.moved.length > 0) {
            showNotification(`Moved ${result.moved.length} item(s) successfully`, 'Moved', 'success', 3000);
        }
        
        browseFolder(currentPath);
    } catch (error) {
        console.error('Error moving items:', error);
        showNotification('Error moving items', 'Error', 'error');
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
            showNotification('Errors occurred:\n' + result.errors.join('\n'), 'Delete Errors', 'error');
        } else if (result.deleted.length > 0) {
            showNotification(`Deleted ${result.deleted.length} item(s) successfully`, 'Deleted', 'success', 3000);
        }
        
        browseFolder(currentPath);
    } catch (error) {
        console.error('Error deleting items:', error);
        showNotification('Error deleting items', 'Error', 'error');
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
    
    // Use relative_path if available (includes subfolder), otherwise fall back to filename
    const imagePath = image.relative_path || image.filename;
    document.getElementById('detailImage').src = `/outputs/${imagePath}`;
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
    const loraStatus = [];
    if (image.mcnl_lora) loraStatus.push('MCNL');
    if (image.snofs_lora) loraStatus.push('Snofs');
    if (image.oface_lora) loraStatus.push('OFace');
    const loraText = loraStatus.length > 0 ? loraStatus.join(', ') : 'None';
    
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
                <div class="metadata-label">LoRAs</div>
                <div class="metadata-value">${loraText}</div>
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
    document.getElementById('filePrefix').value = currentImageData.file_prefix || 'comfyui';
    document.getElementById('subfolder').value = currentImageData.subfolder || '';
    document.getElementById('mcnlLora').checked = currentImageData.mcnl_lora || false;
    document.getElementById('snofsLora').checked = currentImageData.snofs_lora || false;
    document.getElementById('ofaceLora').checked = currentImageData.oface_lora || false;
    
    // Close the modal
    closeImageModal();
    
    // Switch to single generation tab
    switchTab('single');
    
    // Scroll to the form
    setTimeout(() => {
        document.querySelector('.generation-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    
    // Show notification
    showNotification('Image parameters imported to form', 'Imported', 'success', 3000);
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
    setupZoomControls();
}

function closeFullscreen() {
    isFullscreenActive = false;
    
    // Stop autoplay
    stopAutoplay();
    
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
    
    // Reset zoom
    resetZoom();
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
    
    // Use relative_path if available (includes subfolder), otherwise fall back to filename
    const imagePath = image.relative_path || image.filename;
    document.getElementById('fullscreenImage').src = `/outputs/${imagePath}`;
    document.getElementById('fullscreenCounter').textContent = `${currentImageIndex + 1} / ${images.length}`;
    
    // Reset zoom when changing images
    resetZoom();
}

// Zoom Functions
function adjustZoom(delta) {
    zoomLevel = Math.max(1, Math.min(5, zoomLevel + delta));
    applyZoom();
}

function resetZoom() {
    zoomLevel = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    applyZoom();
}

function applyZoom() {
    const img = document.getElementById('fullscreenImage');
    const container = document.getElementById('fullscreenImageContainer');
    
    img.style.transform = `translate(${zoomPanX}px, ${zoomPanY}px) scale(${zoomLevel})`;
    img.style.cursor = zoomLevel > 1 ? 'move' : 'default';
    
    // Update zoom level display
    document.getElementById('fullscreenZoomLevel').textContent = `${Math.round(zoomLevel * 100)}%`;
    
    // Enable/disable dragging based on zoom level
    if (zoomLevel > 1) {
        container.style.overflow = 'hidden';
    } else {
        container.style.overflow = 'visible';
        zoomPanX = 0;
        zoomPanY = 0;
    }
}

// Autoplay Functions
function toggleAutoplay() {
    if (isAutoplayActive) {
        stopAutoplay();
    } else {
        startAutoplay();
    }
}

function startAutoplay() {
    isAutoplayActive = true;
    
    // Update button icon
    document.querySelector('#fullscreenPlayPause .play-icon').style.display = 'none';
    document.querySelector('#fullscreenPlayPause .pause-icon').style.display = 'block';
    
    // Start the timer
    scheduleNextImage();
}

function stopAutoplay() {
    isAutoplayActive = false;
    
    // Update button icon
    document.querySelector('#fullscreenPlayPause .play-icon').style.display = 'block';
    document.querySelector('#fullscreenPlayPause .pause-icon').style.display = 'none';
    
    // Clear the timer
    if (autoplayTimer) {
        clearTimeout(autoplayTimer);
        autoplayTimer = null;
    }
}

function scheduleNextImage() {
    if (!isAutoplayActive) return;
    
    const interval = parseFloat(document.getElementById('fullscreenAutoplayInterval').value) || 3;
    const milliseconds = interval * 1000;
    
    autoplayTimer = setTimeout(() => {
        fullscreenNextImage();
        scheduleNextImage();
    }, milliseconds);
}

function fullscreenNextImage() {
    showFullscreenImage(currentImageIndex + 1);
}

function fullscreenPrevImage() {
    showFullscreenImage(currentImageIndex - 1);
}

// Zoom Controls Setup
function setupZoomControls() {
    const img = document.getElementById('fullscreenImage');
    const container = document.getElementById('fullscreenImageContainer');
    
    // Mouse wheel zoom
    container.addEventListener('wheel', (e) => {
        if (!isFullscreenActive) return;
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        adjustZoom(delta);
    }, { passive: false });
    
    // Drag to pan when zoomed
    img.addEventListener('mousedown', (e) => {
        if (zoomLevel <= 1) return;
        e.preventDefault();
        
        isDragging = true;
        dragStartX = e.clientX - zoomPanX;
        dragStartY = e.clientY - zoomPanY;
        img.style.cursor = 'grabbing';
    });
    
    container.addEventListener('mousemove', (e) => {
        if (!isDragging || zoomLevel <= 1) return;
        e.preventDefault();
        
        zoomPanX = e.clientX - dragStartX;
        zoomPanY = e.clientY - dragStartY;
        applyZoom();
    });
    
    container.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            const img = document.getElementById('fullscreenImage');
            img.style.cursor = zoomLevel > 1 ? 'move' : 'default';
        }
    });
    
    container.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            const img = document.getElementById('fullscreenImage');
            img.style.cursor = zoomLevel > 1 ? 'move' : 'default';
        }
    });
    
    // Touch support for pinch-to-zoom
    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom start
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            lastTouchDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
        } else if (e.touches.length === 1) {
            // Single touch for swipe
            touchStartX = e.touches[0].screenX;
            
            // Pan if zoomed
            if (zoomLevel > 1) {
                isDragging = true;
                dragStartX = e.touches[0].clientX - zoomPanX;
                dragStartY = e.touches[0].clientY - zoomPanY;
            }
        }
    }, false);
    
    container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const distance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            if (lastTouchDistance > 0) {
                const delta = (distance - lastTouchDistance) * 0.01;
                adjustZoom(delta);
            }
            
            lastTouchDistance = distance;
        } else if (e.touches.length === 1 && isDragging && zoomLevel > 1) {
            // Pan when zoomed
            e.preventDefault();
            zoomPanX = e.touches[0].clientX - dragStartX;
            zoomPanY = e.touches[0].clientY - dragStartY;
            applyZoom();
        }
    }, { passive: false });
    
    container.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            lastTouchDistance = 0;
        }
        
        if (e.touches.length === 0) {
            // Touch ended
            if (isDragging) {
                isDragging = false;
            } else if (touchStartX !== 0) {
                // Swipe detection
                touchEndX = e.changedTouches[0].screenX;
                handleSwipe();
            }
        }
    }, false);
}

// Touch Support
function initTouchSupport() {
    // Touch support is now handled in setupZoomControls
}

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold && zoomLevel <= 1) {
        if (diff > 0) {
            // Swiped left - next image
            fullscreenNextImage();
        } else {
            // Swiped right - previous image
            fullscreenPrevImage();
        }
    }
    
    // Reset touch positions
    touchStartX = 0;
    touchEndX = 0;
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
        } else if (e.key === '+' || e.key === '=') {
            adjustZoom(0.2);
        } else if (e.key === '-' || e.key === '_') {
            adjustZoom(-0.2);
        } else if (e.key === '0') {
            resetZoom();
        } else if (e.key === ' ') {
            e.preventDefault();
            toggleAutoplay();
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
        return;
    }
    
    // Ctrl+Enter to generate (works anywhere except in modals)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generateImage();
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

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    initializeAIFeatures();
});

// ============================================================================
// AI ASSISTANT FEATURES
// ============================================================================

let aiModels = { ollama: [], gemini: [] };
let aiCurrentPromptSource = 'single';

function initializeAIFeatures() {
    // Load available models
    loadAIModels();
    
    // Single generation AI edit button
    document.getElementById('editPromptWithAI').addEventListener('click', () => {
        openAIEditModal('single');
    });
    
    // AI Edit Modal events
    document.getElementById('aiProvider').addEventListener('change', updateAIModelList);
    document.getElementById('aiOptimizeBtn').addEventListener('click', aiOptimizePrompt);
    document.getElementById('aiApplySuggestionBtn').addEventListener('click', aiApplySuggestion);
    document.getElementById('aiCopyPromptBtn').addEventListener('click', aiCopyCurrentPrompt);
    document.getElementById('aiModalCancelBtn').addEventListener('click', closeAIEditModal);
    document.getElementById('aiModalUseBtn').addEventListener('click', aiUseResult);
    
    // Allow Enter key in suggestion input
    document.getElementById('aiSuggestion').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            aiApplySuggestion();
        }
    });
}

async function loadAIModels() {
    try {
        const response = await fetch('/api/ai/models');
        const result = await response.json();
        
        if (result.success) {
            aiModels = result.models;
            updateAIModelList();
            updateAIParamModelList();
        } else {
            console.error('Failed to load AI models:', result.error);
        }
    } catch (error) {
        console.error('Error loading AI models:', error);
    }
}

function updateAIModelList() {
    const provider = document.getElementById('aiProvider').value;
    const modelSelect = document.getElementById('aiModel');
    const modelInfo = document.getElementById('modelInfo');
    
    const models = aiModels[provider] || [];
    
    if (models.length === 0) {
        modelSelect.innerHTML = '<option value="">No models available</option>';
        if (provider === 'ollama') {
            modelInfo.textContent = 'Make sure Ollama is running with at least one model installed';
            modelInfo.style.color = 'var(--warning)';
        } else {
            modelInfo.textContent = 'Add GEMINI_API_KEY to .env file to use Gemini models';
            modelInfo.style.color = 'var(--warning)';
        }
    } else {
        modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
        modelInfo.textContent = `${models.length} model(s) available`;
        modelInfo.style.color = 'var(--success)';
    }
}



function openAIEditModal(source) {
    aiCurrentPromptSource = source;
    
    const promptText = document.getElementById('prompt').value.trim();
    
    if (!promptText) {
        showNotification('Please enter a prompt first', 'Empty Prompt', 'warning');
        return;
    }
    
    // Set current prompt
    document.getElementById('aiCurrentPrompt').value = promptText;
    document.getElementById('aiResult').value = '';
    document.getElementById('aiSuggestion').value = '';
    
    // Show modal
    document.getElementById('aiEditModal').style.display = 'flex';
}

function closeAIEditModal() {
    document.getElementById('aiEditModal').style.display = 'none';
    aiCurrentPromptSource = null;
}

async function aiOptimizePrompt() {
    const prompt = document.getElementById('aiCurrentPrompt').value.trim();
    const provider = document.getElementById('aiProvider').value;
    const model = document.getElementById('aiModel').value;
    
    if (!model) {
        showNotification('Please select a model', 'No Model Selected', 'warning');
        return;
    }
    
    if (!prompt) {
        showNotification('No prompt to optimize', 'Empty Prompt', 'warning');
        return;
    }
    
    // Show loading
    document.getElementById('aiLoadingIndicator').style.display = 'block';
    document.getElementById('aiOptimizeBtn').disabled = true;
    
    try {
        const response = await fetch('/api/ai/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model, provider })
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('aiResult').value = result.optimized_prompt;
            showNotification('Prompt optimized successfully!', 'Success', 'success', 3000);
        } else {
            showNotification('Error: ' + result.error, 'Optimization Failed', 'error');
        }
    } catch (error) {
        console.error('AI optimization error:', error);
        showNotification('Network error occurred', 'Error', 'error');
    } finally {
        document.getElementById('aiLoadingIndicator').style.display = 'none';
        document.getElementById('aiOptimizeBtn').disabled = false;
    }
}

async function aiApplySuggestion() {
    const prompt = document.getElementById('aiCurrentPrompt').value.trim();
    const suggestion = document.getElementById('aiSuggestion').value.trim();
    const provider = document.getElementById('aiProvider').value;
    const model = document.getElementById('aiModel').value;
    
    if (!model) {
        showNotification('Please select a model', 'No Model Selected', 'warning');
        return;
    }
    
    if (!prompt || !suggestion) {
        showNotification('Both prompt and suggestion are required', 'Missing Input', 'warning');
        return;
    }
    
    // Show loading
    document.getElementById('aiLoadingIndicator').style.display = 'block';
    document.getElementById('aiApplySuggestionBtn').disabled = true;
    
    try {
        const response = await fetch('/api/ai/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, suggestion, model, provider })
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('aiResult').value = result.edited_prompt || result.optimized_prompt;
            showNotification('Suggestion applied successfully!', 'Success', 'success', 3000);
        } else {
            showNotification('Error: ' + result.error, 'Suggestion Failed', 'error');
        }
    } catch (error) {
        console.error('AI suggestion error:', error);
        showNotification('Network error occurred', 'Error', 'error');
    } finally {
        document.getElementById('aiLoadingIndicator').style.display = 'none';
        document.getElementById('aiApplySuggestionBtn').disabled = false;
    }
}

function aiCopyCurrentPrompt() {
    const prompt = document.getElementById('aiCurrentPrompt').value;
    navigator.clipboard.writeText(prompt).then(() => {
        showNotification('Prompt copied to clipboard', 'Copied', 'success', 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
        showNotification('Failed to copy', 'Error', 'error');
    });
}

function aiUseResult() {
    const result = document.getElementById('aiResult').value.trim();
    
    if (!result) {
        showNotification('No result to use', 'Empty Result', 'warning');
        return;
    }
    
    // Update the prompt field
    document.getElementById('prompt').value = result;
    
    closeAIEditModal();
    showNotification('Prompt updated successfully', 'Updated', 'success', 3000);
}


