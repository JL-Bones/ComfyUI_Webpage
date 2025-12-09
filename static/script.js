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

// Batch generation state
let batchPreviewData = [];
let detectedBatchParameters = [];

// AI streaming state
let activeStream = null;
let currentStreamModel = null;
let currentStreamProvider = null;

// Hardware monitoring state
let hardwareUpdateInterval;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeTabs();
    initializeMobileOverlay();
    browseFolder('');
    startQueueUpdates();
    startHardwareMonitoring();
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
    
    // Image upload handlers
    document.getElementById('imageUpload').addEventListener('change', handleImagePreview);
    document.getElementById('clearImageBtn').addEventListener('click', clearUploadedImage);
    document.getElementById('useImageSize').addEventListener('change', toggleDimensionFields);
    
    // Batch image upload handlers
    document.getElementById('batchImageUpload').addEventListener('change', handleBatchImagePreview);
    document.getElementById('clearBatchImageBtn').addEventListener('click', clearBatchUploadedImage);
    document.getElementById('batchUseImageSize').addEventListener('change', toggleBatchDimensionFields);
    
    // Image browser buttons
    const browseImageBtn = document.getElementById('browseImageBtn');
    const browseBatchImageBtn = document.getElementById('browseBatchImageBtn');
    const closeBrowserBtn = document.getElementById('closeBrowserBtn');
    
    if (browseImageBtn) {
        browseImageBtn.addEventListener('click', () => openImageBrowser('single'));
    }
    if (browseBatchImageBtn) {
        browseBatchImageBtn.addEventListener('click', () => openImageBrowser('batch'));
    }
    if (closeBrowserBtn) {
        closeBrowserBtn.addEventListener('click', closeImageBrowser);
    }
    
    // Image browser tabs
    document.querySelectorAll('.image-browser-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const folder = e.target.dataset.folder;
            loadImageBrowserFolder(folder, '');
        });
    });

    // Use This Folder (Image Batch)
    const useFolderBtn = document.getElementById('useThisFolderBtn');
    if (useFolderBtn) {
        useFolderBtn.addEventListener('click', () => {
            if (currentBrowserFolder === 'input') {
                if (!selectedImageBatchFolder) {
                    selectedImageBatchFolder = currentBrowserSubpath || '';
                }
                const display = document.getElementById('imageBatchFolderDisplay');
                display.textContent = selectedImageBatchFolder ? selectedImageBatchFolder : 'Root';
                closeImageBrowser();
            }
        });
    }
    
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
    
    // Batch generation
    initializeBatchGeneration();
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
        'batch': 'batchTab',
        'image-batch': 'imageBatchTab',
        'browser': 'browserTab',
        'reveal': 'revealTab'
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

// Global state for uploaded images
let uploadedImageFilename = null;
let batchUploadedImageFilename = null;

// Image Generation
async function generateImage() {
    const prompt = document.getElementById('prompt').value.trim();
    
    if (!prompt) {
        showNotification('Please enter a prompt', 'Missing Prompt', 'warning');
        return;
    }
    
    // Check if image needs to be uploaded first
    const imageUpload = document.getElementById('imageUpload');
    if (imageUpload.files.length > 0 && !uploadedImageFilename) {
        showNotification('Uploading image...', 'Please wait', 'info');
        const uploadSuccess = await handleImageUpload();
        if (!uploadSuccess) {
            return;
        }
    }
    
    const data = {
        prompt: prompt,
        width: parseInt(document.getElementById('width').value),
        height: parseInt(document.getElementById('height').value),
        steps: parseInt(document.getElementById('steps').value),
        cfg: parseFloat(document.getElementById('cfg').value),
        shift: parseFloat(document.getElementById('shift').value),
        seed: document.getElementById('seed').value ? parseInt(document.getElementById('seed').value) : null,
        use_image: uploadedImageFilename ? true : false,
        use_image_size: document.getElementById('useImageSize').checked,
        image_filename: uploadedImageFilename,
        file_prefix: document.getElementById('filePrefix').value.trim() || 'comfyui',
        subfolder: document.getElementById('subfolder').value.trim(),
        mcnl_lora: document.getElementById('mcnlLora').checked,
        snofs_lora: document.getElementById('snofsLora').checked,
        male_lora: document.getElementById('maleLora').checked
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

// Handle image upload
async function handleImageUpload() {
    const imageUpload = document.getElementById('imageUpload');
    const file = imageUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            uploadedImageFilename = result.filename;
            showNotification('Image uploaded successfully', 'Success', 'success', 2000);
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        showNotification('Error uploading image', 'Error', 'error');
        return false;
    }
}

// Handle image upload preview
function handleImagePreview() {
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const imagePreviewImg = document.getElementById('imagePreviewImg');
    const clearImageBtn = document.getElementById('clearImageBtn');
    const useImageSizeGroup = document.getElementById('useImageSizeGroup');
    
    const file = imageUpload.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreviewImg.src = e.target.result;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
        };
        reader.readAsDataURL(file);
        
        // Reset uploaded filename so it uploads again
        uploadedImageFilename = null;
    } else {
        imagePreview.style.display = 'none';
        clearImageBtn.style.display = 'none';
        useImageSizeGroup.style.display = 'none';
        uploadedImageFilename = null;
    }
}

// Clear uploaded image
function clearUploadedImage() {
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const clearImageBtn = document.getElementById('clearImageBtn');
    const useImageSizeGroup = document.getElementById('useImageSizeGroup');
    const useImageSize = document.getElementById('useImageSize');
    
    imageUpload.value = '';
    imagePreview.style.display = 'none';
    clearImageBtn.style.display = 'none';
    useImageSizeGroup.style.display = 'none';
    useImageSize.checked = false;
    uploadedImageFilename = null;
    
    // Show width/height again
    toggleDimensionFields();
}

// Toggle width/height visibility based on useImageSize checkbox
function toggleDimensionFields() {
    const useImageSize = document.getElementById('useImageSize');
    const widthGroup = document.getElementById('widthGroup');
    const heightGroup = document.getElementById('heightGroup');
    
    if (useImageSize.checked) {
        widthGroup.style.display = 'none';
        heightGroup.style.display = 'none';
    } else {
        widthGroup.style.display = 'block';
        heightGroup.style.display = 'block';
    }
}

// Batch image upload handlers
function handleBatchImagePreview() {
    const imageUpload = document.getElementById('batchImageUpload');
    const imagePreview = document.getElementById('batchImagePreview');
    const imagePreviewImg = document.getElementById('batchImagePreviewImg');
    const clearImageBtn = document.getElementById('clearBatchImageBtn');
    const useImageSizeGroup = document.getElementById('batchUseImageSizeGroup');
    
    const file = imageUpload.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreviewImg.src = e.target.result;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
        };
        reader.readAsDataURL(file);
        
        // Reset uploaded filename so it uploads again
        batchUploadedImageFilename = null;
    } else {
        imagePreview.style.display = 'none';
        clearImageBtn.style.display = 'none';
        useImageSizeGroup.style.display = 'none';
        batchUploadedImageFilename = null;
    }
}

function clearBatchUploadedImage() {
    const imageUpload = document.getElementById('batchImageUpload');
    const imagePreview = document.getElementById('batchImagePreview');
    const clearImageBtn = document.getElementById('clearBatchImageBtn');
    const useImageSizeGroup = document.getElementById('batchUseImageSizeGroup');
    const useImageSize = document.getElementById('batchUseImageSize');
    
    imageUpload.value = '';
    imagePreview.style.display = 'none';
    clearImageBtn.style.display = 'none';
    useImageSizeGroup.style.display = 'none';
    useImageSize.checked = false;
    batchUploadedImageFilename = null;
    
    // Re-enable width/height CSV checkboxes if they were disabled
    toggleBatchDimensionFields();
}

function toggleBatchDimensionFields() {
    const useImageSize = document.getElementById('batchUseImageSize');
    const widthVariable = document.getElementById('batchWidthVariable');
    const heightVariable = document.getElementById('batchHeightVariable');
    
    if (useImageSize.checked) {
        // Disable and uncheck width/height CSV options
        widthVariable.checked = false;
        widthVariable.disabled = true;
        heightVariable.checked = false;
        heightVariable.disabled = true;
    } else {
        // Re-enable width/height CSV options
        widthVariable.disabled = false;
        heightVariable.disabled = false;
    }
}

async function handleBatchImageUpload() {
    const imageUpload = document.getElementById('batchImageUpload');
    const file = imageUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            batchUploadedImageFilename = result.filename;
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading batch image:', error);
        showNotification('Error uploading image', 'Error', 'error');
        return false;
    }
}

// Image Browser Functions
let imageBrowserMode = 'single'; // 'single' | 'batch' | 'image-batch'
let currentBrowserFolder = 'input'; // 'input' or 'output'
let currentBrowserSubpath = ''; // Current subfolder path
let selectedImageBatchFolder = '';

function openImageBrowser(mode) {
    imageBrowserMode = mode;
    currentBrowserSubpath = ''; // Reset to root
    const modal = document.getElementById('imageBrowserModal');
    modal.style.display = 'flex';
    
    // Load input folder by default
    loadImageBrowserFolder('input', '');
}

function closeImageBrowser() {
    const modal = document.getElementById('imageBrowserModal');
    modal.style.display = 'none';
    const useBtn = document.getElementById('useThisFolderBtn');
    if (useBtn) useBtn.style.display = 'none';
}

async function loadImageBrowserFolder(folder, subpath) {
    currentBrowserFolder = folder;
    currentBrowserSubpath = subpath || '';
    
    // Update tab active state
    document.querySelectorAll('.image-browser-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.folder === folder) {
            tab.classList.add('active');
        }
    });
    
    // Update path display with breadcrumb
    renderImageBrowserPath(folder, subpath);
    
    try {
        // Fetch images from appropriate folder
        const endpoint = folder === 'input' 
            ? `/api/browse_images?folder=input&path=${encodeURIComponent(subpath)}`
            : `/api/browse?path=${encodeURIComponent(subpath)}`;
        
        const response = await fetch(endpoint);
        const data = await response.json();
        
        // Render folders and images
        const grid = document.getElementById('imageBrowserGrid');
        grid.innerHTML = '';
        
        const folders = data.folders || [];
        const files = folder === 'input' ? (data.images || []) : (data.files || []);
        
        if (folders.length === 0 && files.length === 0) {
            grid.innerHTML = '<p style="color: #888; grid-column: 1/-1; text-align: center;">No images or folders found</p>';
            return;
        }
        
        // Add back button if not at root
        if (subpath) {
            const parentPath = subpath.split(/[/\\]/).slice(0, -1).join('/');
            const backDiv = document.createElement('div');
            backDiv.className = 'browser-folder-item';
            backDiv.innerHTML = `
                <div class="browser-folder-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </div>
                <div class="browser-folder-name">..</div>
            `;
            backDiv.addEventListener('click', () => {
                loadImageBrowserFolder(folder, parentPath);
            });
            grid.appendChild(backDiv);
        }
        
        // Render folders
        folders.forEach(folderItem => {
            const div = document.createElement('div');
            div.className = 'browser-folder-item';
            div.innerHTML = `
                <div class="browser-folder-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="browser-folder-name">${escapeHtml(folderItem.name)}</div>
            `;
            div.addEventListener('click', () => {
                if (imageBrowserMode === 'image-batch' && folder === 'input') {
                    selectedImageBatchFolder = folderItem.path;
                    const useBtn = document.getElementById('useThisFolderBtn');
                    if (useBtn) {
                        useBtn.style.display = 'inline-flex';
                    }
                    renderImageBrowserPath(folder, folderItem.path);
                } else {
                    loadImageBrowserFolder(folder, folderItem.path);
                }
            });
            grid.appendChild(div);
        });
        
        // Render images
        files.forEach(file => {
            // Handle both object format (with path) and simple string format
            const filename = typeof file === 'string' ? file : (file.filename || file);
            const filePath = typeof file === 'string' ? file : (file.path || file.filename);
            const relativePath = typeof file === 'string' ? null : (file.relative_path || file.filename);
            
            const imagePath = folder === 'input' 
                ? `/api/image/input/${encodeURIComponent(filePath)}`
                : `/outputs/${relativePath || filename}`;
            
            // For output folder, use relativePath for copying; for input, use filePath
            const filePathForSelection = folder === 'output' ? (relativePath || filename) : filePath;
            
            const div = document.createElement('div');
            div.className = 'browser-image-item';
            
            const img = document.createElement('img');
            img.src = imagePath;
            img.alt = filename;
            img.loading = 'lazy';
            img.onerror = function() {
                console.error(`Failed to load image: ${imagePath}`);
                this.style.opacity = '0.3';
                this.alt = 'Failed to load';
            };
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'browser-image-name';
            nameDiv.textContent = filename;
            
            div.appendChild(img);
            div.appendChild(nameDiv);
            
            div.addEventListener('click', () => {
                selectBrowsedImage(filePathForSelection, folder, imagePath);
            });
            
            grid.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading browser folder:', error);
        showNotification('Error loading images', 'Error', 'error');
    }
}

function renderImageBrowserPath(folder, subpath) {
    const pathDisplay = document.getElementById('imageBrowserPathText');
    const folderName = folder === 'input' ? 'Input' : 'Output';
    
    if (!subpath) {
        pathDisplay.innerHTML = folderName;
        return;
    }
    
    // Build clickable breadcrumb path
    const parts = subpath.split(/[/\\]/).filter(p => p);
    let html = `<span class="browser-path-part" style="cursor: pointer;" onclick="loadImageBrowserFolder('${folder}', '')">${folderName}</span>`;
    
    let currentPath = '';
    parts.forEach((part, index) => {
        currentPath += (currentPath ? '/' : '') + part;
        const pathCopy = currentPath;
        html += ' / ';
        html += `<span class="browser-path-part" style="cursor: pointer;" onclick="loadImageBrowserFolder('${folder}', '${pathCopy}')">${escapeHtml(part)}</span>`;
    });
    
    pathDisplay.innerHTML = html;

    // Toggle "Use This Folder" button visibility based on mode/folder
    const useBtn = document.getElementById('useThisFolderBtn');
    if (useBtn) {
        if (imageBrowserMode === 'image-batch' && folder === 'input') {
            useBtn.style.display = 'inline-flex';
        } else {
            useBtn.style.display = 'none';
        }
    }
}

async function selectBrowsedImage(filename, folder, imagePath) {
    try {
        // If from output folder, copy to input folder
        let finalFilename = filename;
        if (folder === 'output') {
            const response = await fetch('/api/copy_to_input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to copy image');
            }
            finalFilename = data.filename;
        }
        
        // Set the appropriate uploaded filename and preview
        if (imageBrowserMode === 'single') {
            uploadedImageFilename = finalFilename;
            
            // Update preview
            const imagePreviewImg = document.getElementById('imagePreviewImg');
            const imagePreview = document.getElementById('imagePreview');
            const clearImageBtn = document.getElementById('clearImageBtn');
            const useImageSizeGroup = document.getElementById('useImageSizeGroup');
            
            imagePreviewImg.src = imagePath;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
            
            // Clear file input
            document.getElementById('imageUpload').value = '';
        } else {
            batchUploadedImageFilename = finalFilename;
            
            // Update batch preview
            const imagePreviewImg = document.getElementById('batchImagePreviewImg');
            const imagePreview = document.getElementById('batchImagePreview');
            const clearImageBtn = document.getElementById('clearBatchImageBtn');
            const useImageSizeGroup = document.getElementById('batchUseImageSizeGroup');
            
            imagePreviewImg.src = imagePath;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
            
            // Clear file input
            document.getElementById('batchImageUpload').value = '';
        }
        
        closeImageBrowser();
        showNotification('Image selected', 'Success', 'success');
    } catch (error) {
        console.error('Error selecting image:', error);
        showNotification('Error selecting image', 'Error', 'error');
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
    if (image.mcnl_lora) loraStatus.push('MCNL (F)');
    if (image.snofs_lora) loraStatus.push('Snofs (F)');
    if (image.male_lora) loraStatus.push('Male');
    const loraText = loraStatus.length > 0 ? loraStatus.join(', ') : 'None';
    
    const modeText = image.use_image ? 'Image-to-Image' : 'Text-to-Image';
    const imageSizeText = image.use_image_size ? 'Yes' : 'No';
    
    return `
        <div class="metadata-grid">
            <div class="metadata-item metadata-prompt">
                <div class="metadata-label">Prompt</div>
                <div class="metadata-value">${escapeHtml(image.prompt)}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Mode</div>
                <div class="metadata-value">${modeText}</div>
            </div>
            ${image.use_image ? `
            <div class="metadata-item">
                <div class="metadata-label">Source Image</div>
                <div class="metadata-value">${escapeHtml(image.image_filename || 'N/A')}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Use Image Size</div>
                <div class="metadata-value">${imageSizeText}</div>
            </div>
            ` : ''}
            <div class="metadata-item">
                <div class="metadata-label">Dimensions</div>
                <div class="metadata-value">${image.width} × ${image.height}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Steps</div>
                <div class="metadata-value">${image.steps}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">CFG Scale</div>
                <div class="metadata-value">${image.cfg || 1.0}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-label">Shift</div>
                <div class="metadata-value">${image.shift || 3.0}</div>
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
    document.getElementById('cfg').value = currentImageData.cfg || 1.0;
    document.getElementById('shift').value = currentImageData.shift || 3.0;
    document.getElementById('seed').value = currentImageData.seed || '';
    document.getElementById('filePrefix').value = currentImageData.file_prefix || 'comfyui';
    document.getElementById('subfolder').value = currentImageData.subfolder || '';
    document.getElementById('mcnlLora').checked = currentImageData.mcnl_lora || false;
    document.getElementById('snofsLora').checked = currentImageData.snofs_lora || false;
    document.getElementById('maleLora').checked = currentImageData.male_lora || false;
    
    // Note: We don't import image-related fields (use_image, use_image_size, image_filename)
    // as those are specific to the source image upload workflow
    
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
    revealFullscreenActive = false;
    revealBaseFit = null;
    revealBaseFitIndex = -1;
    
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
    // Hide reveal toggle in fullscreen when closing
    const fsToggleBtn = document.getElementById('fullscreenRevealToggle');
    if (fsToggleBtn) fsToggleBtn.style.display = 'none';
    
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
    if (revealFullscreenActive && Array.isArray(revealLinkedItems) && revealLinkedItems.length > 0) {
        const total = revealLinkedItems.length;
        if (total === 0) return;
        let attempts = 0;
        let nextIndex = (currentRevealIndex + 1 + total) % total;
        // Find next index with available image for current view
        while (attempts < total) {
            const it = revealLinkedItems[nextIndex];
            const src = revealShowOutput
                ? (it.output ? `/outputs/${it.output.relative_path}` : null)
                : `/api/image/input/${encodeURIComponent(it.input.path)}`;
            if (src) {
                currentRevealIndex = nextIndex;
                revealBaseFit = null;
                revealBaseFitIndex = currentRevealIndex;
                openImageInFullscreen(src, true);
                updateRevealFullscreenCounter();
                return;
            }
            attempts++;
            nextIndex = (nextIndex + 1) % total;
        }
        showNotification('No images available in this view', 'Empty View', 'warning');
    } else {
        showFullscreenImage(currentImageIndex + 1);
    }
}

function fullscreenPrevImage() {
    if (revealFullscreenActive && Array.isArray(revealLinkedItems) && revealLinkedItems.length > 0) {
        const total = revealLinkedItems.length;
        if (total === 0) return;
        let attempts = 0;
        let prevIndex = (currentRevealIndex - 1 + total) % total;
        // Find previous index with available image for current view
        while (attempts < total) {
            const it = revealLinkedItems[prevIndex];
            const src = revealShowOutput
                ? (it.output ? `/outputs/${it.output.relative_path}` : null)
                : `/api/image/input/${encodeURIComponent(it.input.path)}`;
            if (src) {
                currentRevealIndex = prevIndex;
                revealBaseFit = null;
                revealBaseFitIndex = currentRevealIndex;
                openImageInFullscreen(src, true);
                updateRevealFullscreenCounter();
                return;
            }
            attempts++;
            prevIndex = (prevIndex - 1 + total) % total;
        }
        showNotification('No images available in this view', 'Empty View', 'warning');
    } else {
        showFullscreenImage(currentImageIndex - 1);
    }
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

    // Reveal Browser keyboard navigation when not in fullscreen
    const revealTab = document.getElementById('revealTab');
    const isRevealActive = revealTab && revealTab.classList.contains('active');
    if (isRevealActive && !fullscreenViewer.classList.contains('active')) {
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            e.preventDefault();
            if (currentRevealIndex < 0) {
                currentRevealIndex = 0;
            } else if (revealLinkedItems && currentRevealIndex < revealLinkedItems.length - 1) {
                currentRevealIndex += 1;
            }
            openRevealAtIndex(currentRevealIndex);
            return;
        }
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            e.preventDefault();
            if (currentRevealIndex < 0) {
                currentRevealIndex = 0;
            } else if (revealLinkedItems && currentRevealIndex > 0) {
                currentRevealIndex -= 1;
            }
            openRevealAtIndex(currentRevealIndex);
            return;
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

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    initializeAIFeatures();
    initializeBatchAIFeatures();
    initializeImageBatch();
    initializeRevealBrowser();
});

// ============================================================================
// BATCH GENERATION FEATURES
// ============================================================================

function initializeBatchGeneration() {
    // Batch prompt and CSV inputs
    const batchBasePrompt = document.getElementById('batchBasePrompt');
    const batchCSV = document.getElementById('batchCSV');
    
    if (batchBasePrompt) {
        batchBasePrompt.addEventListener('input', updateBatchPreview);
    }
    
    if (batchCSV) {
        batchCSV.addEventListener('input', updateBatchPreview);
    }
    
    // Batch buttons
    const queueBatchBtn = document.getElementById('queueBatchBtn');
    const loadCSVFileBtn = document.getElementById('loadCSVFile');
    const csvFileInput = document.getElementById('csvFileInput');
    const editBatchPromptWithAI = document.getElementById('editBatchPromptWithAI');
    const generateCSVWithAI = document.getElementById('generateCSVWithAI');
    const editParameterValuesBtn = document.getElementById('editParameterValuesBtn');
    
    if (queueBatchBtn) {
        queueBatchBtn.addEventListener('click', queueBatchGeneration);
    }
    
    if (loadCSVFileBtn && csvFileInput) {
        loadCSVFileBtn.addEventListener('click', () => csvFileInput.click());
        csvFileInput.addEventListener('change', handleCSVFileUpload);
    }
    
    if (editBatchPromptWithAI) {
        editBatchPromptWithAI.addEventListener('click', () => openAIEditModal('batch'));
    }
    
    if (generateCSVWithAI) {
        generateCSVWithAI.addEventListener('click', openAIParameterModal);
    }
    
    if (editParameterValuesBtn) {
        editParameterValuesBtn.addEventListener('click', openParameterEditModal);
    }
    
    // Add event listeners to variable parameter checkboxes
    const variableCheckboxes = document.querySelectorAll('.batch-param-variable');
    variableCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateBatchPreview);
    });
}

// ============================================================================
// IMAGE BATCH FEATURES
// ============================================================================

function initializeImageBatch() {
    const chooseBtn = document.getElementById('chooseImageBatchFolderBtn');
    const queueBtn = document.getElementById('queueImageBatchBtn');
    if (chooseBtn) {
        chooseBtn.addEventListener('click', () => {
            imageBrowserMode = 'image-batch';
            selectedImageBatchFolder = '';
            loadImageBrowserFolder('input', '');
            const modal = document.getElementById('imageBrowserModal');
            modal.style.display = 'flex';
        });
    }
    if (queueBtn) {
        queueBtn.addEventListener('click', queueImageBatchGeneration);
    }
}

async function queueImageBatchGeneration() {
    const prompt = document.getElementById('imageBatchPrompt').value.trim();
    if (!prompt) {
        showNotification('Please enter a prompt', 'Missing Prompt', 'warning');
        return;
    }
    const folderPath = selectedImageBatchFolder || currentBrowserSubpath || '';
    const steps = parseInt(document.getElementById('imageBatchSteps').value);
    const cfg = parseFloat(document.getElementById('imageBatchCfg').value);
    const shift = parseFloat(document.getElementById('imageBatchShift').value);
    const seedVal = document.getElementById('imageBatchSeed').value.trim();
    const seed = seedVal ? parseInt(seedVal) : null;
    const file_prefix = document.getElementById('imageBatchFilePrefix').value.trim() || 'image_batch';
    const subfolder = document.getElementById('imageBatchSubfolder').value.trim();
    const mcnl_lora = document.getElementById('imageBatchMcnlLora').checked;
    const snofs_lora = document.getElementById('imageBatchSnofsLora').checked;
    const male_lora = document.getElementById('imageBatchMaleLora').checked;

    try {
        const response = await fetch('/api/queue/image-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                folder: folderPath,
                steps,
                cfg,
                shift,
                seed,
                file_prefix,
                subfolder,
                mcnl_lora,
                snofs_lora,
                male_lora
            })
        });
        const result = await response.json();
        if (result.success) {
            showNotification(`Queued ${result.queued_count} image(s) from folder`, 'Image Batch Queued', 'success', 3000);
            updateQueue();
        } else {
            showNotification('Error: ' + (result.error || 'Failed to queue image batch'), 'Error', 'error');
        }
    } catch (error) {
        console.error('Error queueing image batch:', error);
        showNotification('Error queueing image batch', 'Error', 'error');
    }
}

// ============================================================================
// REVEAL BROWSER
// ============================================================================
let revealShowOutput = false; // false = show input images, true = show output images
let revealCurrentPath = '';
let revealLinkedItems = [];
let currentRevealIndex = -1;
let revealFullscreenActive = false;
let revealBaseFit = null; // {width, height} to keep same displayed size when toggling
let revealBaseFitIndex = -1;

function initializeRevealBrowser() {
    const refreshBtn = document.getElementById('revealRefreshBtn');
    const toggleBtn = document.getElementById('revealToggleViewBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadReveal(''));
    if (toggleBtn) toggleBtn.addEventListener('click', toggleRevealView);
    const fsToggleBtn = document.getElementById('fullscreenRevealToggle');
    if (fsToggleBtn) fsToggleBtn.addEventListener('click', toggleRevealView);
    // Auto-load when switching to tab
    const revealTabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.dataset.tab === 'reveal');
    if (revealTabBtn) {
        revealTabBtn.addEventListener('click', () => {
            loadReveal(revealCurrentPath || '');
        });
    }
}

async function toggleRevealView() {
    revealShowOutput = !revealShowOutput;
    const toggleBtn = document.getElementById('revealToggleViewBtn');
    toggleBtn.querySelector('span').textContent = revealShowOutput ? 'Show Input' : 'Show Output';
    const fsToggleBtn = document.getElementById('fullscreenRevealToggle');
    if (fsToggleBtn) {
        fsToggleBtn.title = revealShowOutput ? 'Show Input' : 'Show Output';
    }
    // Reload data to ensure grids reflect new state
    await loadReveal(revealCurrentPath || '');
    // If fullscreen is active, show the first image of the selected view
    if (isFullscreenActive) {
        if (revealLinkedItems.length > 0 && currentRevealIndex >= 0) {
            const it = revealLinkedItems[currentRevealIndex];
            const src = revealShowOutput
                ? (it.output ? `/outputs/${it.output.relative_path}` : null)
                : `/api/image/input/${encodeURIComponent(it.input.path)}`;
            if (src) {
                openImageInFullscreen(src, true);
                updateRevealFullscreenCounter();
            } else {
                // Fallback: pick first available in target view
                const items = revealShowOutput ? (lastRevealData?.output_images || []) : (lastRevealData?.input_images || []);
                if (items.length > 0) {
                    const alt = revealShowOutput ? `/outputs/${items[0].relative_path}` : `/api/image/input/${encodeURIComponent(items[0].path)}`;
                    openImageInFullscreen(alt, true);
                    // Reset index to 0 since we switched to first item
                    currentRevealIndex = 0;
                    revealBaseFit = null;
                    revealBaseFitIndex = currentRevealIndex;
                    updateRevealFullscreenCounter();
                }
            }
        } else {
            const items = revealShowOutput ? (lastRevealData?.output_images || []) : (lastRevealData?.input_images || []);
            if (items.length > 0) {
                const src = revealShowOutput ? `/outputs/${items[0].relative_path}` : `/api/image/input/${encodeURIComponent(items[0].path)}`;
                openImageInFullscreen(src, true);
                currentRevealIndex = 0;
                revealBaseFit = null;
                revealBaseFitIndex = currentRevealIndex;
                updateRevealFullscreenCounter();
            }
        }
    }
}

let lastRevealData = null;

async function loadReveal(path) {
    try {
        const response = await fetch(`/api/reveal?path=${encodeURIComponent(path || '')}`);
        const data = await response.json();
        if (!data.success) {
            showNotification(data.error || 'Failed to load reveal browser', 'Error', 'error');
            return;
        }
        lastRevealData = data;
        revealCurrentPath = data.current_path || '';
        revealLinkedItems = Array.isArray(data.pairs) ? data.pairs : [];
        renderRevealBreadcrumb(revealCurrentPath);
        if (revealLinkedItems.length > 0) {
            renderRevealGridPairs();
        } else {
            renderRevealGrid(data);
        }
    } catch (error) {
        console.error('Error loading reveal data:', error);
        showNotification('Error loading reveal browser', 'Error', 'error');
    }
}

function renderRevealBreadcrumb(path) {
    const breadcrumb = document.getElementById('revealBreadcrumb');
    const parts = path ? path.split(/[/\\]/).filter(p => p) : [];
    let html = '<span class="breadcrumb-item" onclick="loadReveal(\'\')">📁 Processed</span>';
    let cur = '';
    parts.forEach(part => {
        cur += (cur ? '/' : '') + part;
        const pcopy = cur;
        html += ' / ' + `<span class="breadcrumb-item" onclick="loadReveal('${pcopy}')">${escapeHtml(part)}</span>`;
    });
    breadcrumb.innerHTML = html;
}

function renderRevealGrid(data) {
    const grid = document.getElementById('revealGrid');
    const empty = document.getElementById('revealEmpty');
    if (!grid || !empty) return;

    // If no path selected, show folder list
    if (!data.current_path) {
        if (!data.folders || data.folders.length === 0) {
            grid.style.display = 'none';
            empty.style.display = 'block';
            return;
        }
        let html = '';
        data.folders.forEach(folder => {
            html += `
            <div class="gallery-item folder-item" onclick="loadReveal('${escapeHtml(folder.path)}')">
                <div class="folder-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">${escapeHtml(folder.name)}</div>
                </div>
            </div>`;
        });
        grid.innerHTML = html;
        grid.style.display = 'grid';
        empty.style.display = 'none';
        return;
    }

    // Show images: input or output
    const items = revealShowOutput ? (data.output_images || []) : (data.input_images || []);
    if (!items || items.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        empty.querySelector('p').textContent = revealShowOutput ? 'No output images' : 'No input images';
        return;
    }
    let html = '';
    items.forEach(item => {
        const src = revealShowOutput ? `/outputs/${item.relative_path}` : `/api/image/input/${encodeURIComponent(item.path)}`;
        const click = revealShowOutput ? `openRevealOutput('${item.relative_path}')` : `openRevealInput('${item.path}')`;
        html += `
        <div class="gallery-item" onclick="${click}">
            <img src="${src}" alt="Image" class="gallery-item-image">
            <div class="gallery-item-info">
                <div class="gallery-item-prompt">${escapeHtml(item.filename)}</div>
            </div>
        </div>`;
    });
    grid.innerHTML = html;
    grid.style.display = 'grid';
    empty.style.display = 'none';
}

function renderRevealGridPairs() {
    const grid = document.getElementById('revealGrid');
    const empty = document.getElementById('revealEmpty');
    if (!grid || !empty) return;

    if (!revealLinkedItems || revealLinkedItems.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    let html = '';
    revealLinkedItems.forEach((item, index) => {
        const hasOutput = !!item.output;
        const src = revealShowOutput
            ? (hasOutput ? `/outputs/${item.output.relative_path}` : '')
            : `/api/image/input/${encodeURIComponent(item.input.path)}`;
        const label = revealShowOutput
            ? (hasOutput ? item.output.filename : '(no output)')
            : item.input.filename;
        const onclick = `openRevealAtIndex(${index})`;
        html += `
        <div class="gallery-item ${!src ? 'disabled' : ''}" onclick="${onclick}">
            ${src ? `<img src="${src}" alt="Image" class="gallery-item-image">` : `<div class="gallery-item-image" style="height:160px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);background:var(--bg-secondary)">No Output</div>`}
            <div class="gallery-item-info">
                <div class="gallery-item-prompt">${escapeHtml(label)}</div>
            </div>
        </div>`;
    });
    grid.innerHTML = html;
    grid.style.display = 'grid';
    empty.style.display = 'none';
}

function openRevealAtIndex(index) {
    if (!revealLinkedItems || index < 0 || index >= revealLinkedItems.length) return;
    currentRevealIndex = index;
    revealBaseFit = null;
    revealBaseFitIndex = index;
    const item = revealLinkedItems[index];
    const src = revealShowOutput
        ? (item.output ? `/outputs/${item.output.relative_path}` : null)
        : `/api/image/input/${encodeURIComponent(item.input.path)}`;
    if (!src) {
        showNotification('No output image for this item', 'Missing Output', 'warning');
        return;
    }
    revealFullscreenActive = true;
    updateFullscreenRevealToggleVisibility();
    openImageInFullscreen(src, true);
}

function openRevealInput(path) {
    // Show input image in fullscreen viewer with toggle support
    const viewer = document.getElementById('fullscreenViewer');
    switchTab('reveal');
    revealFullscreenActive = true;
    currentRevealIndex = Math.max(0, (revealLinkedItems || []).findIndex(p => p.input && p.input.path === path));
    revealBaseFit = null;
    revealBaseFitIndex = currentRevealIndex;
    updateFullscreenRevealToggleVisibility();
    openImageInFullscreen(`/api/image/input/${encodeURIComponent(path)}`, true);
}

function openRevealOutput(relpath) {
    const viewer = document.getElementById('fullscreenViewer');
    switchTab('reveal');
    revealFullscreenActive = true;
    currentRevealIndex = Math.max(0, (revealLinkedItems || []).findIndex(p => p.output && p.output.relative_path === relpath));
    revealBaseFit = null;
    revealBaseFitIndex = currentRevealIndex;
    updateFullscreenRevealToggleVisibility();
    openImageInFullscreen(`/outputs/${relpath}`, true);
}

function openImageInFullscreen(src, fromReveal = false) {
    const viewer = document.getElementById('fullscreenViewer');
    // Activate viewer and show single image
    viewer.classList.add('active');
    isFullscreenActive = true;
    const img = document.getElementById('fullscreenImage');
    if (!fromReveal) {
        img.style.width = '';
        img.style.height = '';
        img.style.maxWidth = '';
        img.style.maxHeight = '';
    }
    img.src = src;
    if (fromReveal && Array.isArray(revealLinkedItems) && revealLinkedItems.length > 0 && currentRevealIndex >= 0) {
        document.getElementById('fullscreenCounter').textContent = `${currentRevealIndex + 1} / ${revealLinkedItems.length}`;
    } else {
        document.getElementById('fullscreenCounter').textContent = `1 / 1`;
    }
    resetZoom();
    setupMouseActivityTracking();
    setupZoomControls();
    if (fromReveal) {
        const container = document.getElementById('fullscreenImageContainer');
        const applyBaseFit = () => {
            if (!container || !img.naturalWidth || !img.naturalHeight) return;
            const rect = container.getBoundingClientRect();
            if (revealBaseFit == null || revealBaseFitIndex !== currentRevealIndex) {
                const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
                revealBaseFit = {
                    width: Math.floor(img.naturalWidth * scale),
                    height: Math.floor(img.naturalHeight * scale)
                };
                revealBaseFitIndex = currentRevealIndex;
            }
            img.style.maxWidth = 'none';
            img.style.maxHeight = 'none';
            img.style.width = `${revealBaseFit.width}px`;
            img.style.height = `${revealBaseFit.height}px`;
        };
        if (img.complete) {
            applyBaseFit();
        } else {
            img.onload = () => applyBaseFit();
        }
    }
    // Show/hide reveal toggle button in fullscreen based on context
    const fsToggleBtn = document.getElementById('fullscreenRevealToggle');
    if (fsToggleBtn) {
        if (fromReveal) {
            fsToggleBtn.style.display = 'inline-flex';
            fsToggleBtn.title = revealShowOutput ? 'Show Input' : 'Show Output';
        } else {
            fsToggleBtn.style.display = 'none';
        }
    }
}

function updateFullscreenRevealToggleVisibility() {
    const fsToggleBtn = document.getElementById('fullscreenRevealToggle');
    if (!fsToggleBtn) return;
    fsToggleBtn.style.display = revealFullscreenActive ? 'inline-flex' : 'none';
    fsToggleBtn.title = revealShowOutput ? 'Show Input' : 'Show Output';
}

function updateRevealFullscreenCounter() {
    const counter = document.getElementById('fullscreenCounter');
    if (!counter) return;
    if (revealFullscreenActive && Array.isArray(revealLinkedItems) && revealLinkedItems.length > 0 && currentRevealIndex >= 0) {
        counter.textContent = `${currentRevealIndex + 1} / ${revealLinkedItems.length}`;
    }
}

function extractParameters(basePrompt) {
    // Extract [parameter] placeholders
    const regex = /\[([^\]]+)\]/g;
    const parameters = [];
    let match;
    
    while ((match = regex.exec(basePrompt)) !== null) {
        if (!parameters.includes(match[1])) {
            parameters.push(match[1]);
        }
    }
    
    return parameters;
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return null;
    
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            rows.push(row);
        }
    }
    
    return { headers, rows };
}

function replaceParameters(basePrompt, paramValues) {
    let result = basePrompt;
    for (const [param, value] of Object.entries(paramValues)) {
        result = result.replace(new RegExp(`\\[${param}\\]`, 'g'), value);
    }
    return result;
}

function getVariableParameters() {
    // Returns list of parameter names that should come from CSV
    const variableParams = [];
    
    if (document.getElementById('batchWidthVariable').checked) variableParams.push('width');
    if (document.getElementById('batchHeightVariable').checked) variableParams.push('height');
    if (document.getElementById('batchStepsVariable').checked) variableParams.push('steps');
    if (document.getElementById('batchCfgVariable').checked) variableParams.push('cfg');
    if (document.getElementById('batchShiftVariable').checked) variableParams.push('shift');
    if (document.getElementById('batchSeedVariable').checked) variableParams.push('seed');
    if (document.getElementById('batchFilePrefixVariable').checked) variableParams.push('file_prefix');
    if (document.getElementById('batchSubfolderVariable').checked) variableParams.push('subfolder');
    if (document.getElementById('batchMcnlLoraVariable').checked) variableParams.push('mcnl_lora');
    if (document.getElementById('batchSnofsLoraVariable').checked) variableParams.push('snofs_lora');
    if (document.getElementById('batchMaleLoraVariable').checked) variableParams.push('male_lora');
    
    return variableParams;
}

function updateBatchPreview() {
    const basePrompt = document.getElementById('batchBasePrompt').value.trim();
    const csvText = document.getElementById('batchCSV').value.trim();
    const detectedParams = document.getElementById('detectedParameters');
    const batchPreview = document.getElementById('batchPreview');
    const queueBatchBtn = document.getElementById('queueBatchBtn');
    const batchCount = document.getElementById('batchCount');
    
    // Extract parameters from base prompt
    detectedBatchParameters = extractParameters(basePrompt);
    const variableParams = getVariableParameters();
    const allRequiredParams = [...detectedBatchParameters, ...variableParams];
    
    if (detectedParams) {
        const displayParts = [];
        if (detectedBatchParameters.length > 0) {
            displayParts.push(detectedBatchParameters.join(', '));
        }
        if (variableParams.length > 0) {
            displayParts.push(`+ ${variableParams.length} variable param(s)`);
        }
        
        if (displayParts.length > 0) {
            detectedParams.textContent = displayParts.join(' ');
            detectedParams.style.color = 'var(--primary)';
        } else {
            detectedParams.textContent = 'None';
            detectedParams.style.color = 'var(--text-muted)';
        }
    }
    
    // Parse CSV
    if (!basePrompt || !csvText) {
        batchPreview.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Enter a base prompt with parameters and CSV data to preview the batch</div>';
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }
    
    const csvData = parseCSV(csvText);
    if (!csvData) {
        batchPreview.innerHTML = '<div style="text-align: center; color: var(--warning); padding: 2rem;">Invalid CSV format. First row should be parameter names, followed by value rows.</div>';
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }
    
    // Check if CSV headers match parameters (both prompt and variable params)
    const missingParams = allRequiredParams.filter(p => !csvData.headers.includes(p));
    const extraHeaders = csvData.headers.filter(h => !allRequiredParams.includes(h));
    
    if (missingParams.length > 0) {
        batchPreview.innerHTML = `<div style="text-align: center; color: var(--warning); padding: 2rem;">Missing CSV columns: ${missingParams.join(', ')}</div>`;
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }
    
    // Generate preview
    batchPreviewData = csvData.rows.map(row => {
        const prompt = replaceParameters(basePrompt, row);
        return { prompt, params: row };
    });
    
    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    batchPreviewData.forEach((item, index) => {
        // Build parameter info display
        const paramInfo = [];
        variableParams.forEach(param => {
            if (item.params[param] !== undefined) {
                paramInfo.push(`${param}: ${item.params[param]}`);
            }
        });
        const paramDisplay = paramInfo.length > 0 ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">${escapeHtml(paramInfo.join(', '))}</div>` : '';
        
        html += `
            <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 4px; border-left: 3px solid var(--primary);">
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">Image ${index + 1}</div>
                <div style="font-size: 0.95rem; color: var(--text);">${escapeHtml(item.prompt)}</div>
                ${paramDisplay}
            </div>
        `;
    });
    html += '</div>';
    
    if (extraHeaders.length > 0) {
        html = `<div style="color: var(--warning); font-size: 0.9rem; margin-bottom: 0.75rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px;">
            ⚠️ Extra CSV columns (will be ignored): ${extraHeaders.join(', ')}
        </div>` + html;
    }
    
    batchPreview.innerHTML = html;
    queueBatchBtn.disabled = false;
    batchCount.textContent = batchPreviewData.length.toString();
}

async function queueBatchGeneration() {
    if (batchPreviewData.length === 0) {
        showNotification('No valid batch data to queue', 'Empty Batch', 'warning');
        return;
    }
    
    // Check if batch image needs to be uploaded first
    const batchImageUpload = document.getElementById('batchImageUpload');
    if (batchImageUpload.files.length > 0 && !batchUploadedImageFilename) {
        showNotification('Uploading image...', 'Please wait', 'info');
        const uploadSuccess = await handleBatchImageUpload();
        if (!uploadSuccess) {
            return;
        }
    }
    
    // Get default parameters
    const useImageSize = document.getElementById('batchUseImageSize').checked;
    const defaults = {
        width: parseInt(document.getElementById('batchWidth').value),
        height: parseInt(document.getElementById('batchHeight').value),
        steps: parseInt(document.getElementById('batchSteps').value),
        cfg: parseFloat(document.getElementById('batchCfg').value),
        shift: parseFloat(document.getElementById('batchShift').value),
        seed: document.getElementById('batchSeed').value ? parseInt(document.getElementById('batchSeed').value) : null,
        file_prefix: document.getElementById('batchFilePrefix').value.trim() || 'batch',
        subfolder: document.getElementById('batchSubfolder').value.trim(),
        mcnl_lora: document.getElementById('batchMcnlLora').checked,
        snofs_lora: document.getElementById('batchSnofsLora').checked,
        male_lora: document.getElementById('batchMaleLora').checked,
        use_image: batchUploadedImageFilename ? true : false,
        use_image_size: useImageSize,
        image_filename: batchUploadedImageFilename
    };
    
    const variableParams = getVariableParameters();
    
    // Prepare batch jobs
    const jobs = batchPreviewData.map(item => {
        const job = {
            prompt: item.prompt,
            width: defaults.width,
            height: defaults.height,
            steps: defaults.steps,
            cfg: defaults.cfg,
            shift: defaults.shift,
            seed: defaults.seed,
            file_prefix: defaults.file_prefix,
            subfolder: defaults.subfolder,
            mcnl_lora: defaults.mcnl_lora,
            snofs_lora: defaults.snofs_lora,
            male_lora: defaults.male_lora,
            use_image: defaults.use_image,
            use_image_size: defaults.use_image_size,
            image_filename: defaults.image_filename
        };
        
        // Override with CSV values for variable parameters
        // Skip width/height from CSV if use_image_size is enabled
        variableParams.forEach(param => {
            // Skip width/height if using image size
            if (defaults.use_image_size && (param === 'width' || param === 'height')) {
                return;
            }
            
            if (item.params[param] !== undefined) {
                const value = item.params[param];
                
                // Convert types appropriately
                if (param === 'width' || param === 'height' || param === 'steps' || param === 'seed') {
                    job[param] = value ? parseInt(value) : (param === 'seed' ? null : job[param]);
                } else if (param === 'cfg' || param === 'shift') {
                    job[param] = value ? parseFloat(value) : job[param];
                } else if (param === 'mcnl_lora' || param === 'snofs_lora' || param === 'male_lora') {
                    // Convert to boolean (true/false, yes/no, 1/0)
                    const lowerValue = String(value).toLowerCase().trim();
                    job[param] = lowerValue === 'true' || lowerValue === 'yes' || lowerValue === '1';
                } else {
                    job[param] = value;
                }
            }
        });
        
        return job;
    });
    
    try {
        const response = await fetch('/api/queue/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobs: jobs })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Queued ${result.queued_count} images successfully`, 'Batch Queued', 'success', 3000);
            updateQueue();
        } else {
            showNotification('Error: ' + result.error, 'Queue Failed', 'error');
        }
    } catch (error) {
        console.error('Error queueing batch:', error);
        showNotification('Error queueing batch', 'Error', 'error');
    }
}

async function handleCSVFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        document.getElementById('batchCSV').value = text;
        updateBatchPreview();
        showNotification('CSV file loaded successfully', 'Loaded', 'success', 2000);
    } catch (error) {
        console.error('Error reading CSV file:', error);
        showNotification('Error reading CSV file', 'Error', 'error');
    }
    
    // Reset file input
    event.target.value = '';
}

// ============================================================================
// BATCH AI FEATURES
// ============================================================================

function initializeBatchAIFeatures() {
    // AI Parameter Modal events
    const aiParamProvider = document.getElementById('aiParamProvider');
    const aiParamModalCancelBtn = document.getElementById('aiParamModalCancelBtn');
    const aiParamModalUseBtn = document.getElementById('aiParamModalUseBtn');
    const aiGenerateParamsBtn = document.getElementById('aiGenerateParamsBtn');
    
    if (aiParamProvider) {
        aiParamProvider.addEventListener('change', updateAIParamModelList);
    }
    
    if (aiParamModalCancelBtn) {
        aiParamModalCancelBtn.addEventListener('click', closeAIParameterModal);
    }
    
    if (aiParamModalUseBtn) {
        aiParamModalUseBtn.addEventListener('click', useAIGeneratedCSV);
    }
    
    if (aiGenerateParamsBtn) {
        aiGenerateParamsBtn.addEventListener('click', generateCSVWithAI);
    }
    
    const aiParamStopBtn = document.getElementById('aiParamStopBtn');
    if (aiParamStopBtn) {
        aiParamStopBtn.addEventListener('click', stopAIGeneration);
    }
}

function openAIParameterModal() {
    const basePrompt = document.getElementById('batchBasePrompt').value.trim();
    
    if (!basePrompt) {
        showNotification('Please enter a base prompt first', 'Empty Prompt', 'warning');
        return;
    }
    
    if (detectedBatchParameters.length === 0) {
        showNotification('No parameters detected in base prompt. Use [parameter] syntax.', 'No Parameters', 'warning');
        return;
    }
    
    // Reset form
    document.getElementById('aiParamCount').value = '5';
    document.getElementById('aiParamContext').value = '';
    document.getElementById('aiParamResult').value = '';
    document.getElementById('aiParamIncludeBasePrompt').checked = true;
    document.getElementById('aiParamIncludeInstructions').checked = true;
    document.getElementById('aiParamIncludeCustom').checked = false;
    
    // Show modal
    document.getElementById('aiParameterModal').style.display = 'flex';
}

function closeAIParameterModal() {
    document.getElementById('aiParameterModal').style.display = 'none';
}

async function generateCSVWithAI() {
    const basePrompt = document.getElementById('batchBasePrompt').value.trim();
    const count = parseInt(document.getElementById('aiParamCount').value);
    const provider = document.getElementById('aiParamProvider').value;
    const model = document.getElementById('aiParamModel').value;
    const customContext = document.getElementById('aiParamContext').value.trim();
    
    const includeBasePrompt = document.getElementById('aiParamIncludeBasePrompt').checked;
    const includeInstructions = document.getElementById('aiParamIncludeInstructions').checked;
    const includeCustom = document.getElementById('aiParamIncludeCustom').checked;
    
    if (!model) {
        showNotification('Please select a model', 'No Model Selected', 'warning');
        return;
    }
    
    if (!includeBasePrompt && !includeInstructions && !customContext) {
        showNotification('Please provide at least one context option', 'No Context', 'warning');
        return;
    }
    
    // Store for stop button
    currentStreamModel = model;
    currentStreamProvider = provider;
    
    // Show loading and stop button for Ollama
    document.getElementById('aiParamLoadingIndicator').style.display = 'block';
    document.getElementById('aiGenerateParamsBtn').disabled = true;
    if (provider === 'ollama') {
        document.getElementById('aiParamStopBtn').style.display = 'block';
    }
    
    document.getElementById('aiParamResult').value = '';
    
    // Get all required parameters (prompt + variable)
    const variableParams = getVariableParameters();
    const allParameters = [...detectedBatchParameters, ...variableParams];
    
    try {
        if (provider === 'ollama') {
            // Use streaming for Ollama
            await streamAIResponse('/api/ai/generate-csv', {
                base_prompt: includeBasePrompt ? basePrompt : null,
                parameters: allParameters,
                variable_parameters: variableParams,
                count: count,
                model: model,
                provider: provider,
                custom_context: includeCustom ? customContext : null,
                use_instructions: includeInstructions,
                stream: true
            }, 'aiParamResult');
            showNotification('CSV generated successfully!', 'Success', 'success', 3000);
        } else {
            // Non-streaming for Gemini
            const response = await fetch('/api/ai/generate-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base_prompt: includeBasePrompt ? basePrompt : null,
                    parameters: allParameters,
                    variable_parameters: variableParams,
                    count: count,
                    model: model,
                    provider: provider,
                    custom_context: includeCustom ? customContext : null,
                    use_instructions: includeInstructions
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('aiParamResult').value = result.csv_data;
                showNotification('CSV generated successfully!', 'Success', 'success', 3000);
            } else {
                showNotification('Error: ' + result.error, 'Generation Failed', 'error');
            }
        }
    } catch (error) {
        if (error.message !== 'Stream aborted') {
            console.error('AI CSV generation error:', error);
            showNotification('Network error occurred', 'Error', 'error');
        }
    } finally {
        document.getElementById('aiParamLoadingIndicator').style.display = 'none';
        document.getElementById('aiGenerateParamsBtn').disabled = false;
        document.getElementById('aiParamStopBtn').style.display = 'none';
        activeStream = null;
        currentStreamModel = null;
        currentStreamProvider = null;
    }
}

function useAIGeneratedCSV() {
    const csvData = document.getElementById('aiParamResult').value.trim();
    
    if (!csvData) {
        showNotification('No CSV data to use', 'Empty Result', 'warning');
        return;
    }
    
    // Set CSV in batch tab
    document.getElementById('batchCSV').value = csvData;
    updateBatchPreview();
    
    closeAIParameterModal();
    showNotification('CSV data applied to batch', 'Applied', 'success', 3000);
}

function updateAIParamModelList() {
    const provider = document.getElementById('aiParamProvider').value;
    const modelSelect = document.getElementById('aiParamModel');
    
    const models = aiModels[provider] || [];
    
    if (models.length === 0) {
        modelSelect.innerHTML = '<option value="">No models available</option>';
    } else {
        modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
    }
}

// ============================================================================
// PER-PARAMETER VALUE EDITING
// ============================================================================

function openParameterEditModal() {
    const basePrompt = document.getElementById('batchBasePrompt').value.trim();
    const csvText = document.getElementById('batchCSV').value.trim();
    
    // Get all available parameters (prompt + variable)
    const promptParams = basePrompt ? extractParameters(basePrompt) : [];
    const variableParams = getVariableParameters();
    const allParams = [...promptParams, ...variableParams];
    
    if (allParams.length === 0) {
        showNotification('No parameters available. Add [parameters] to prompt or check "Use from CSV" options.', 'No Parameters', 'warning');
        return;
    }
    
    // Populate parameter dropdown (now multi-select)
    const paramSelect = document.getElementById('editParamSelect');
    paramSelect.innerHTML = allParams.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    
    // Count existing rows if CSV exists
    if (csvText) {
        const parsed = parseCSV(csvText);
        if (parsed) {
            document.getElementById('editParamCount').value = parsed.rows.length;
        }
    }
    
    // Reset form
    document.getElementById('editParamInstructions').value = '';
    document.getElementById('editParamResult').value = '';
    
    // Setup event listeners
    setupParameterEditModalListeners();
    
    // Show modal
    document.getElementById('parameterEditModal').style.display = 'flex';
}

function setupParameterEditModalListeners() {
    // Provider change
    const editParamProvider = document.getElementById('editParamProvider');
    if (editParamProvider) {
        editParamProvider.removeEventListener('change', updateEditParamModelList);
        editParamProvider.addEventListener('change', updateEditParamModelList);
    }
    
    // Generate button
    const editParamGenerateBtn = document.getElementById('editParamGenerateBtn');
    if (editParamGenerateBtn) {
        editParamGenerateBtn.removeEventListener('click', generateParameterValues);
        editParamGenerateBtn.addEventListener('click', generateParameterValues);
    }
    
    // Cancel button
    const editParamModalCancelBtn = document.getElementById('editParamModalCancelBtn');
    if (editParamModalCancelBtn) {
        editParamModalCancelBtn.removeEventListener('click', closeParameterEditModal);
        editParamModalCancelBtn.addEventListener('click', closeParameterEditModal);
    }
    
    // Apply button
    const editParamModalApplyBtn = document.getElementById('editParamModalApplyBtn');
    if (editParamModalApplyBtn) {
        editParamModalApplyBtn.removeEventListener('click', applyParameterValues);
        editParamModalApplyBtn.addEventListener('click', applyParameterValues);
    }
    
    // Stop button
    const editParamStopBtn = document.getElementById('editParamStopBtn');
    if (editParamStopBtn) {
        editParamStopBtn.removeEventListener('click', stopAIGeneration);
        editParamStopBtn.addEventListener('click', stopAIGeneration);
    }
    
    // Update model list
    updateEditParamModelList();
}

function closeParameterEditModal() {
    document.getElementById('parameterEditModal').style.display = 'none';
}

function updateEditParamModelList() {
    const provider = document.getElementById('editParamProvider').value;
    const modelSelect = document.getElementById('editParamModel');
    
    const models = aiModels[provider] || [];
    
    if (models.length === 0) {
        modelSelect.innerHTML = '<option value="">No models available</option>';
    } else {
        modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
    }
}

async function generateParameterValues() {
    const paramSelect = document.getElementById('editParamSelect');
    const selectedParams = Array.from(paramSelect.selectedOptions).map(opt => opt.value);
    const count = parseInt(document.getElementById('editParamCount').value);
    const provider = document.getElementById('editParamProvider').value;
    const model = document.getElementById('editParamModel').value;
    const instructions = document.getElementById('editParamInstructions').value.trim();
    
    if (selectedParams.length === 0) {
        showNotification('Please select at least one parameter', 'No Parameters', 'warning');
        return;
    }
    
    if (!model) {
        showNotification('Please select a model', 'No Model', 'warning');
        return;
    }
    
    // Store for stop button
    currentStreamModel = model;
    currentStreamProvider = provider;
    
    // Show loading and stop button for Ollama
    document.getElementById('editParamLoadingIndicator').style.display = 'block';
    document.getElementById('editParamGenerateBtn').disabled = true;
    if (provider === 'ollama') {
        document.getElementById('editParamStopBtn').style.display = 'block';
    }
    
    document.getElementById('editParamResult').value = '';
    
    try {
        if (selectedParams.length === 1) {
            // Single parameter - generate as list
            const parameter = selectedParams[0];
            
            if (provider === 'ollama') {
                // Use streaming for Ollama
                await streamAIResponse('/api/ai/generate-parameter-values', {
                    parameter: parameter,
                    count: count,
                    model: model,
                    provider: provider,
                    instructions: instructions,
                    stream: true
                }, 'editParamResult');
                const valueCount = document.getElementById('editParamResult').value.split('\n').filter(v => v.trim()).length;
                showNotification(`Generated ${valueCount} values for ${parameter}`, 'Success', 'success', 3000);
            } else {
                // Non-streaming for Gemini
                const response = await fetch('/api/ai/generate-parameter-values', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parameter: parameter,
                        count: count,
                        model: model,
                        provider: provider,
                        instructions: instructions
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    document.getElementById('editParamResult').value = result.values.join('\n');
                    showNotification(`Generated ${result.values.length} values for ${parameter}`, 'Success', 'success', 3000);
                } else {
                    showNotification('Error: ' + result.error, 'Generation Failed', 'error');
                }
            }
        } else {
            // Multiple parameters - generate as CSV
            if (provider === 'ollama') {
                // Use streaming CSV generation
                await streamAIResponse('/api/ai/generate-csv', {
                    base_prompt: null,
                    parameters: selectedParams,
                    variable_parameters: [],
                    count: count,
                    model: model,
                    provider: provider,
                    custom_context: instructions || null,
                    use_instructions: true,
                    stream: true
                }, 'editParamResult');
                showNotification(`Generated ${count} rows for ${selectedParams.length} parameters`, 'Success', 'success', 3000);
            } else {
                // Non-streaming CSV generation for Gemini
                const response = await fetch('/api/ai/generate-csv', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        base_prompt: null,
                        parameters: selectedParams,
                        variable_parameters: [],
                        count: count,
                        model: model,
                        provider: provider,
                        custom_context: instructions || null,
                        use_instructions: true
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    document.getElementById('editParamResult').value = result.csv_data;
                    showNotification(`Generated ${count} rows for ${selectedParams.length} parameters`, 'Success', 'success', 3000);
                } else {
                    showNotification('Error: ' + result.error, 'Generation Failed', 'error');
                }
            }
        }
    } catch (error) {
        if (error.message !== 'Stream aborted') {
            console.error('Parameter value generation error:', error);
            showNotification('Network error occurred', 'Error', 'error');
        }
    } finally {
        document.getElementById('editParamLoadingIndicator').style.display = 'none';
        document.getElementById('editParamGenerateBtn').disabled = false;
        document.getElementById('editParamStopBtn').style.display = 'none';
        activeStream = null;
        currentStreamModel = null;
        currentStreamProvider = null;
    }
}

function applyParameterValues() {
    const paramSelect = document.getElementById('editParamSelect');
    const selectedParams = Array.from(paramSelect.selectedOptions).map(opt => opt.value);
    const valuesText = document.getElementById('editParamResult').value.trim();
    
    if (selectedParams.length === 0) {
        showNotification('Please select at least one parameter', 'No Parameters', 'warning');
        return;
    }
    
    if (!valuesText) {
        showNotification('No values to apply', 'Empty Values', 'warning');
        return;
    }
    
    // Get current CSV
    const csvText = document.getElementById('batchCSV').value.trim();
    let csvData;
    
    if (csvText) {
        csvData = parseCSV(csvText);
        if (!csvData) {
            showNotification('Current CSV is invalid', 'Invalid CSV', 'error');
            return;
        }
    } else {
        // Create new CSV
        csvData = { headers: [], rows: [] };
    }
    
    if (selectedParams.length === 1) {
        // Single parameter - values are one per line
        const parameter = selectedParams[0];
        const values = valuesText.split('\n').map(v => v.trim()).filter(v => v);
        
        if (values.length === 0) {
            showNotification('No valid values found', 'Empty Values', 'warning');
            return;
        }
        
        // Check if parameter exists in headers
        if (!csvData.headers.includes(parameter)) {
            csvData.headers.push(parameter);
        }
        
        // Update or create rows
        for (let i = 0; i < values.length; i++) {
            if (i < csvData.rows.length) {
                // Update existing row
                csvData.rows[i][parameter] = values[i];
            } else {
                // Create new row
                const newRow = {};
                csvData.headers.forEach(h => newRow[h] = '');
                newRow[parameter] = values[i];
                csvData.rows.push(newRow);
            }
        }
        
        showNotification(`Applied ${values.length} values to "${parameter}" column`, 'Applied', 'success', 3000);
    } else {
        // Multiple parameters - values are in CSV format
        const newData = parseCSV(valuesText);
        
        if (!newData || newData.rows.length === 0) {
            showNotification('Generated data is not valid CSV', 'Invalid Data', 'error');
            return;
        }
        
        // Add any new headers from generated data
        newData.headers.forEach(header => {
            if (!csvData.headers.includes(header)) {
                csvData.headers.push(header);
            }
        });
        
        // Merge or replace rows
        for (let i = 0; i < newData.rows.length; i++) {
            if (i < csvData.rows.length) {
                // Update existing row with new parameter values
                selectedParams.forEach(param => {
                    if (newData.rows[i][param] !== undefined) {
                        csvData.rows[i][param] = newData.rows[i][param];
                    }
                });
            } else {
                // Create new row
                const newRow = {};
                csvData.headers.forEach(h => newRow[h] = '');
                selectedParams.forEach(param => {
                    if (newData.rows[i][param] !== undefined) {
                        newRow[param] = newData.rows[i][param];
                    }
                });
                csvData.rows.push(newRow);
            }
        }
        
        showNotification(`Applied ${newData.rows.length} rows for ${selectedParams.length} parameters`, 'Applied', 'success', 3000);
    }
    
    // Convert back to CSV text
    const newCSVLines = [csvData.headers.join(',')];
    csvData.rows.forEach(row => {
        const line = csvData.headers.map(h => row[h] || '').join(',');
        newCSVLines.push(line);
    });
    
    const newCSVText = newCSVLines.join('\n');
    
    // Apply to batch tab
    document.getElementById('batchCSV').value = newCSVText;
    updateBatchPreview();
    
    closeParameterEditModal();
    showNotification(`Applied ${values.length} values to "${parameter}" column`, 'Applied', 'success', 3000);
}

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
    document.getElementById('aiCopyOptimizeInstructionsBtn').addEventListener('click', aiCopyOptimizeInstructions);
    document.getElementById('aiStopBtn').addEventListener('click', stopAIGeneration);
    document.getElementById('aiModalCancelBtn').addEventListener('click', closeAIEditModal);
    document.getElementById('aiModalUseBtn').addEventListener('click', aiUseResult);
}

// Streaming helper function
async function streamAIResponse(endpoint, payload, targetElementId) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    activeStream = reader;
    
    try {
        while (true) {
            const { value, done } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    if (data.done) {
                        return;
                    }
                    if (data.text) {
                        document.getElementById(targetElementId).value += data.text;
                    }
                }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Stream aborted');
        }
        throw error;
    } finally {
        activeStream = null;
    }
}

// Stop AI generation
async function stopAIGeneration() {
    if (activeStream) {
        try {
            await activeStream.cancel();
        } catch (e) {
            console.error('Error canceling stream:', e);
        }
        activeStream = null;
    }
    
    if (currentStreamModel && currentStreamProvider === 'ollama') {
        try {
            await fetch('/api/ai/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: currentStreamModel,
                    provider: currentStreamProvider
                })
            });
            showNotification('Generation stopped and model unloaded', 'Stopped', 'success', 2000);
        } catch (error) {
            console.error('Error stopping AI:', error);
        }
    }
    
    // Hide all stop buttons and re-enable generate buttons
    document.getElementById('aiStopBtn').style.display = 'none';
    document.getElementById('aiOptimizeBtn').disabled = false;
    document.getElementById('aiApplySuggestionBtn').disabled = false;
    document.getElementById('aiLoadingIndicator').style.display = 'none';
    
    document.getElementById('aiParamStopBtn').style.display = 'none';
    document.getElementById('aiGenerateParamsBtn').disabled = false;
    document.getElementById('aiParamLoadingIndicator').style.display = 'none';
    
    document.getElementById('editParamStopBtn').style.display = 'none';
    document.getElementById('editParamGenerateBtn').disabled = false;
    document.getElementById('editParamLoadingIndicator').style.display = 'none';
    
    currentStreamModel = null;
    currentStreamProvider = null;
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
    
    let promptText = '';
    if (source === 'single') {
        promptText = document.getElementById('prompt').value.trim();
    } else if (source === 'batch') {
        promptText = document.getElementById('batchBasePrompt').value.trim();
    }
    
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
    const useInstructions = document.getElementById('aiUseOptimizeInstructions').checked;
    const isBatchPrompt = aiCurrentPromptSource === 'batch';
    
    if (!model) {
        showNotification('Please select a model', 'No Model Selected', 'warning');
        return;
    }
    
    if (!prompt) {
        showNotification('No prompt to optimize', 'Empty Prompt', 'warning');
        return;
    }
    
    // Store for stop button
    currentStreamModel = model;
    currentStreamProvider = provider;
    
    // Show loading and stop button for Ollama
    document.getElementById('aiLoadingIndicator').style.display = 'block';
    document.getElementById('aiOptimizeBtn').disabled = true;
    if (provider === 'ollama') {
        document.getElementById('aiStopBtn').style.display = 'block';
    }
    
    document.getElementById('aiResult').value = '';
    
    try {
        if (provider === 'ollama') {
            // Use streaming for Ollama
            await streamAIResponse('/api/ai/optimize', {
                prompt, model, provider, use_instructions: useInstructions, is_batch: isBatchPrompt, stream: true
            }, 'aiResult');
            showNotification('Prompt optimized successfully!', 'Success', 'success', 3000);
        } else {
            // Non-streaming for Gemini
            const response = await fetch('/api/ai/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, model, provider, use_instructions: useInstructions, is_batch: isBatchPrompt })
            });
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('aiResult').value = result.optimized_prompt;
                showNotification('Prompt optimized successfully!', 'Success', 'success', 3000);
            } else {
                showNotification('Error: ' + result.error, 'Optimization Failed', 'error');
            }
        }
    } catch (error) {
        if (error.message !== 'Stream aborted') {
            console.error('AI optimization error:', error);
            showNotification('Network error occurred', 'Error', 'error');
        }
    } finally {
        document.getElementById('aiLoadingIndicator').style.display = 'none';
        document.getElementById('aiOptimizeBtn').disabled = false;
        document.getElementById('aiStopBtn').style.display = 'none';
        activeStream = null;
        currentStreamModel = null;
        currentStreamProvider = null;
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
    
    // Store for stop button
    currentStreamModel = model;
    currentStreamProvider = provider;
    
    // Show loading and stop button for Ollama
    document.getElementById('aiLoadingIndicator').style.display = 'block';
    document.getElementById('aiApplySuggestionBtn').disabled = true;
    if (provider === 'ollama') {
        document.getElementById('aiStopBtn').style.display = 'block';
    }
    
    document.getElementById('aiResult').value = '';
    
    try {
        if (provider === 'ollama') {
            // Use streaming for Ollama
            await streamAIResponse('/api/ai/suggest', {
                prompt, suggestion, model, provider, stream: true
            }, 'aiResult');
            showNotification('Suggestion applied successfully!', 'Success', 'success', 3000);
        } else {
            // Non-streaming for Gemini
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
        }
    } catch (error) {
        if (error.message !== 'Stream aborted') {
            console.error('AI suggestion error:', error);
            showNotification('Network error occurred', 'Error', 'error');
        }
    } finally {
        document.getElementById('aiLoadingIndicator').style.display = 'none';
        document.getElementById('aiApplySuggestionBtn').disabled = false;
        document.getElementById('aiStopBtn').style.display = 'none';
        activeStream = null;
        currentStreamModel = null;
        currentStreamProvider = null;
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

function aiCopyOptimizeInstructions() {
    // This will copy the optimize instructions that the backend uses
    fetch('/api/ai/optimize-instructions')
        .then(response => response.json())
        .then(result => {
            if (result.success && result.instructions) {
                navigator.clipboard.writeText(result.instructions).then(() => {
                    showNotification('Optimize instructions copied to clipboard', 'Copied', 'success', 2000);
                }).catch(err => {
                    console.error('Copy failed:', err);
                    showNotification('Failed to copy', 'Error', 'error');
                });
            } else {
                showNotification('Failed to get instructions', 'Error', 'error');
            }
        })
        .catch(error => {
            console.error('Error fetching instructions:', error);
            showNotification('Failed to get instructions', 'Error', 'error');
        });
}

function aiUseResult() {
    const result = document.getElementById('aiResult').value.trim();
    
    if (!result) {
        showNotification('No result to use', 'Empty Result', 'warning');
        return;
    }
    
    // Update the appropriate prompt field based on source
    if (aiCurrentPromptSource === 'single') {
        document.getElementById('prompt').value = result;
    } else if (aiCurrentPromptSource === 'batch') {
        document.getElementById('batchBasePrompt').value = result;
        updateBatchPreview(); // Update preview with new prompt
    }
    
    closeAIEditModal();
    showNotification('Prompt updated successfully', 'Updated', 'success', 3000);
}

// ============================================================================
// HARDWARE MONITORING
// ============================================================================

function startHardwareMonitoring() {
    // Initial update
    updateHardwareStats();
    
    // Update every 2 seconds
    hardwareUpdateInterval = setInterval(updateHardwareStats, 2000);
}

async function updateHardwareStats() {
    try {
        const response = await fetch('/api/hardware/stats');
        const data = await response.json();
        
        if (data.success) {
            // Update CPU
            updateHardwareBar('cpu', data.cpu.percent, data.cpu.label);
            
            // Update RAM
            updateHardwareBar('ram', data.ram.percent, data.ram.label);
            
            // Update GPU
            updateHardwareBar('gpu', data.gpu.percent, data.gpu.label);
            
            // Update VRAM
            updateHardwareBar('vram', data.vram.percent, data.vram.label);
        }
    } catch (error) {
        console.error('Error fetching hardware stats:', error);
    }
}

function updateHardwareBar(type, percent, label) {
    const bar = document.getElementById(`${type}Bar`);
    const value = document.getElementById(`${type}Value`);
    
    if (!bar || !value) return;
    
    // Update bar width
    bar.style.width = `${Math.min(percent, 100)}%`;
    
    // Update color based on usage
    bar.classList.remove('high', 'critical');
    if (percent >= 90) {
        bar.classList.add('critical');
    } else if (percent >= 75) {
        bar.classList.add('high');
    }
    
    // Update value text
    value.textContent = label;
}


