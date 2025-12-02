// ComfyUI Web Interface JavaScript

// State
let queueUpdateInterval;
let currentImageIndex = 0;
let images = [];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    loadGallery();
    startQueueUpdates();
});

// Event Listeners
function initializeEventListeners() {
    // Queue toggle
    document.getElementById('toggleQueue').addEventListener('click', toggleQueue);
    
    // Generate button
    document.getElementById('generateBtn').addEventListener('click', generateImage);
    
    // Image modal
    document.getElementById('closeImageBtn').addEventListener('click', closeImageModal);
    document.getElementById('imageOverlay').addEventListener('click', closeImageModal);
    document.getElementById('imagePrev').addEventListener('click', prevImage);
    document.getElementById('imageNext').addEventListener('click', nextImage);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
}

// Queue Management
function toggleQueue() {
    const sidebar = document.getElementById('queueSidebar');
    sidebar.classList.toggle('collapsed');
}

function startQueueUpdates() {
    updateQueue();
    queueUpdateInterval = setInterval(updateQueue, 1000);
}

async function updateQueue() {
    try {
        const response = await fetch('/api/queue');
        const data = await response.json();
        
        renderQueue(data.queue, data.active);
    } catch (error) {
        console.error('Error updating queue:', error);
    }
}

function renderQueue(queue, active) {
    const queueList = document.getElementById('queueList');
    const activeJob = document.getElementById('activeJob');
    const queueEmpty = document.getElementById('queueEmpty');
    
    // Render active job
    if (active) {
        activeJob.innerHTML = renderQueueItem(active, true);
        activeJob.style.display = 'block';
        
        // Filter out the active job from the queue to avoid duplicates
        queue = queue.filter(job => job.id !== active.id);
    } else {
        activeJob.style.display = 'none';
    }
    
    // Render queued jobs
    if (queue.length > 0) {
        queueList.innerHTML = queue.map(job => renderQueueItem(job, false)).join('');
        queueEmpty.style.display = 'none';
    } else if (!active) {
        queueList.innerHTML = '';
        queueEmpty.style.display = 'block';
    } else {
        queueList.innerHTML = '';
        queueEmpty.style.display = 'none';
    }
}

function renderQueueItem(job, isActive) {
    const statusClass = `status-${job.status}`;
    return `
        <div class="queue-item ${isActive ? 'active' : ''}">
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

// Image Generation
async function generateImage() {
    const prompt = document.getElementById('prompt').value.trim();
    
    if (!prompt) {
        alert('Please enter a prompt');
        return;
    }
    
    const data = {
        prompt: prompt,
        negative_prompt: document.getElementById('negativePrompt').value.trim(),
        width: parseInt(document.getElementById('width').value),
        height: parseInt(document.getElementById('height').value),
        steps: parseInt(document.getElementById('steps').value),
        seed: document.getElementById('seed').value ? parseInt(document.getElementById('seed').value) : null
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
            
            // Clear seed for next generation
            document.getElementById('seed').value = '';
            
            // Update queue immediately
            updateQueue();
            
            // Reload gallery after a delay to show new image
            setTimeout(loadGallery, 3000);
        }
    } catch (error) {
        console.error('Error queueing job:', error);
        alert('Error queueing job. Make sure ComfyUI is running.');
    }
}

// Gallery
async function loadGallery() {
    try {
        const response = await fetch('/api/images');
        images = await response.json();
        
        renderGallery(images);
    } catch (error) {
        console.error('Error loading gallery:', error);
    }
}

function renderGallery(imageList) {
    const galleryGrid = document.getElementById('galleryGrid');
    const galleryEmpty = document.getElementById('galleryEmpty');
    
    if (imageList.length > 0) {
        galleryGrid.innerHTML = imageList.map(img => `
            <div class="gallery-item" onclick="openImageModal('${img.id}')">
                <img src="/outputs/${img.filename}" alt="Generated Image" class="gallery-item-image">
                <div class="gallery-item-info">
                    <div class="gallery-item-prompt">${escapeHtml(img.prompt)}</div>
                    <div class="gallery-item-meta">
                        <span class="param-badge">${img.width}x${img.height}</span>
                        <span class="param-badge">${img.steps} steps</span>
                    </div>
                </div>
            </div>
        `).join('');
        galleryGrid.style.display = 'grid';
        galleryEmpty.style.display = 'none';
    } else {
        galleryGrid.style.display = 'none';
        galleryEmpty.style.display = 'block';
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
            ${image.negative_prompt ? `
                <div class="metadata-item metadata-prompt">
                    <div class="metadata-label">Negative Prompt</div>
                    <div class="metadata-value">${escapeHtml(image.negative_prompt)}</div>
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
                <div class="metadata-label">Seed</div>
                <div class="metadata-value">${image.seed}</div>
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

// Keyboard Shortcuts
function handleKeyboard(e) {
    const imageModal = document.getElementById('imageModal');
    
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
