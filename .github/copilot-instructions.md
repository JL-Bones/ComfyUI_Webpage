# ComfyUI Web Interface - AI Agent Instructions

## Project Overview
Flask-based web UI for ComfyUI image generation with AI-assisted prompting, batch generation, queue management, and file organization. **Requires ComfyUI server at `http://127.0.0.1:8188`**. Only dependency: Flask. Uses Qwen_Full.json workflow with image-to-image support (4-step lightning generation).

**Recent Updates:**
- **NEW: Qwen_Full.json workflow** - Supports both text-to-image and image-to-image generation
- **NEW: Image upload** - Upload source images for img2img mode with automatic dimension detection
- **NEW: Advanced parameters** - CFG scale (1.0), Shift (3.0), collapsible sections
- **NEW: Male LoRA** - Added third LoRA option alongside MCNL and Snofs
- Batch mode with [parameter] templates and CSV import/generation
- AI streaming for real-time response display (Ollama only)
- Multi-parameter AI editing with single/multiple selection
- Stop buttons for canceling AI generation mid-stream
- CSV buttons and AI buttons now use white text for consistency
- Mobile-optimized CSV button layout (full-width stacking)

## Architecture (Three-Layer System)

**1. ComfyUI Client** (`comfyui_client.py`)  
Python stdlib wrapper (urllib, json). Modifies workflow JSON with hardcoded node IDs from `Qwen_Full.json`:
- `45` - Positive prompt (PrimitiveStringMultiline)
- `32` - Width (easy int)
- `31` - Height (easy int)
- `36` - Steps (easy int)
- `39` - CFG (easy float)
- `40` - Shift (easy float)
- `35` - Seed (PrimitiveInt)
- `38` - Use Image boolean (easy boolean)
- `34` - Use Image Size boolean (easy boolean)
- `43` - Image filename (LoadImage)
- `41` - MCNL LoRA boolean (easy boolean)
- `42` - Snofs LoRA boolean (easy boolean)
- `33` - Male LoRA boolean (easy boolean)

**2. Flask Backend** (`app.py`)  
Queue processor (LIFO display, FIFO execution), metadata storage, AI integration. Serves on `0.0.0.0:4879`. Background daemon thread processes queue sequentially. 5-minute auto-unload with countdown timer. **Automatically unloads models when switching between text-to-image and image-to-image modes** to prevent memory issues.

**3. Frontend** (`templates/index.html`, `static/`)  
Vanilla JS SPA with three tabs (Single, Batch, Browser), collapsible mobile UI, custom modals (no browser dialogs), toast notifications, 1s polling, countdown timer, SSE streaming for AI responses.

**Data Flow:**  
```
Single Mode: User → Queue (front insert) → Thread (end pop, oldest first) → ComfyUI → Image + Metadata
Batch Mode:  User → [parameter] template + CSV → Multiple jobs → Queue → Sequential processing
AI Features: User → SSE stream (Ollama) or fetch (Gemini) → Real-time text display → Apply result
                    ↓ 1s poll                                                           ↓ auto-refresh
               3-section UI (queued/active/completed)                          Folder browser + thumbnails
```

**LoRA System:**  
Three boolean controls (MCNL, Snofs, Male) map to workflow nodes `41`, `42`, `33`. MCNL and Snofs have keyword hints for user guidance. Values stored in metadata and passed through entire generation pipeline.

**Image Upload System:**
Image upload automatically sets `use_image=True`. When image is uploaded, `use_image_size` checkbox appears. If enabled, width/height fields are hidden and image dimensions are used. Uploaded images saved to ComfyUI input directory with timestamp-based filenames.

**Image Browser System:**
Browse button next to upload allows selecting existing images from input or output folders. Modal with tabs for Input/Output folders, displays images in grid. Output images copied to input folder when selected. Available in both Single and Batch modes.

## Critical Patterns

### Queue System (Thread-Safe LIFO/FIFO)
```python
# Add to FRONT for display (newest on top)
with queue_lock:
    generation_queue.insert(0, job)
    
# Process from END (oldest first, FIFO execution)
with queue_lock:
    job = generation_queue[-1]  # Take oldest
    active_generation = job
```

**Persistent State:** `outputs/queue_state.json` survives restarts, shared across all browsers/users.

**Queue Management Rules:**
- Clear queue removes only queued items (preserves 50 most recent completed)
- Individual removal via X button works on queued/completed/failed (NOT active)
- Event delegation with `data-job-id` attributes (no inline onclick)
- SVG inside buttons: `pointer-events: none` to prevent click blocking
- Always await `updateQueue()` for immediate UI feedback
- Track seen completions with `lastSeenCompletedIds` Set to trigger folder refresh once per new completion

### Desktop Sidebar Collapse
Queue sidebar collapses from 320px to 40px (not translateX). Main content expands smoothly via CSS transitions. Hidden elements use `opacity: 0` + `pointer-events: none`. Only toggle button remains visible when collapsed.

```css
.queue-sidebar { width: 320px; transition: width 0.3s ease; }
.queue-sidebar.collapsed { width: 40px; }
.main-content { flex: 1; transition: margin-left 0.3s ease; }
```

### Mobile Optimization
- Queue sidebar: Fixed overlay on mobile (≤768px), uses `transform: translateX(-100%)`
- Hamburger menu toggles sidebar (`toggleMobileMenu()` with `stopPropagation()`)
- Collapsible sections: `.collapsible-header` + `.collapsible-content` with `.active` class
- Touch targets: Min 44px height, increased padding on mobile
- Tabs: "Single", "Batch", "Browser"
- Prompt container stacks vertically, generate button becomes full-width horizontal
- CSV buttons: `.csv-buttons-wrapper` stacks full-width on mobile with white text

### File Naming (Auto-Increment)
```python
def get_next_filename(prefix: str, subfolder: str = "") -> tuple:
    # Scans existing files, returns (relative_path, absolute_path)
    # Pattern: "{prefix}{index:04d}.png" (e.g., "comfyui0000.png")
```

### Metadata Storage
Flat JSON array in `outputs/metadata.json`: `id, filename, path, subfolder, timestamp, prompt, width, height, steps, seed, file_prefix, mcnl_lora, snofs_lora, oface_lora`. No negative prompt. CFG fixed at 1.0 for Qwen Image model compatibility.

### AI Integration (`ai_assistant.py`)
Dual provider: Ollama (local, port 11434) and Gemini (API key from `.env`). Models unload immediately after use (`keep_alive: 0` for Ollama). Features:
- **Prompt optimization** - Single and batch mode with `is_batch` parameter (preserves `[parameters]`)
- **Custom suggestions** - Apply user-directed edits to prompts
- **Parameter generation** - Single or multi-parameter CSV generation for batch mode
- **Streaming** - Ollama uses SSE (Server-Sent Events) for real-time text display
- **Stop functionality** - Cancel mid-generation and immediately unload model

### AI Streaming (SSE Pattern)
Ollama responses stream in real-time via Server-Sent Events:
```javascript
// Frontend: ReadableStream with line-by-line SSE parsing
async function streamAIResponse(endpoint, payload, targetElementId) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, stream: true })
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');  // Fixed: was '\\n'
        buffer = lines.pop();
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6));
                targetElement.value += data.text;
            }
        }
    }
}

// Backend: Generator function with Response(stream_with_context)
@app.route('/api/ai/optimize', methods=['POST'])
def optimize_prompt():
    if stream and provider == 'ollama':
        def generate():
            for chunk in ai_assistant.optimize_prompt_stream(...):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
```

**Stop Functionality:**
- Stop buttons visible only during Ollama streaming
- `stopAIGeneration()` cancels ReadableStream, calls `/api/ai/stop`, hides buttons, re-enables UI
- Backend `_unload_ollama_model()` immediately unloads via `keep_alive: 0`

### Custom Modals (No Browser Dialogs)
```javascript
// Toast notifications (preferred)
showNotification('Message', 'Title', 'success', 3000);

// Blocking modals for input
const value = await showPrompt('Enter name');
const ok = await showConfirm('Are you sure?');

// NEVER use: alert(), prompt(), confirm()
```

### Event Delegation Pattern
All dynamically created buttons use event delegation with data attributes:
```javascript
// In renderQueueItem()
<button class="queue-item-cancel" data-job-id="${escapeHtml(job.id)}">

// Event handler (capture phase)
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.queue-item-cancel');
    if (btn) {
        e.preventDefault();
        e.stopPropagation();
        cancelJob(btn.getAttribute('data-job-id'));
    }
}, true);  // Capture phase = true
```

### Batch Mode Pattern
Template with `[parameter]` placeholders → CSV data → Multiple queue jobs:
```javascript
// Template: "A [animal] wearing a [clothing]"
// CSV: animal,clothing\ncat,hat\ndog,scarf
// Result: Two prompts queued: "A cat wearing a hat", "A dog wearing a scarf"

function parseBatchCSV(basePrompt, csvData) {
    const lines = csvData.trim().split('\n').filter(l => !l.startsWith('#'));
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => line.split(',').map(v => v.trim()));
    
    return rows.map(values => {
        let prompt = basePrompt;
        headers.forEach((param, i) => {
            prompt = prompt.replace(new RegExp(`\\[${param}\\]`, 'g'), values[i]);
        });
        return prompt;
    });
}
```

**Batch AI Features:**
- `is_batch: true` flag uses `OPTIMIZE_BATCH_PROMPT_INSTRUCTION` (preserves `[parameters]`)
- Multi-parameter generation: Single param → line-separated values, Multiple → CSV format
- `generateParameterValues()` handles 1-N selected parameters from dropdown
- `applyParameterValues()` merges generated data into CSV textarea

### Image Path Handling
Always use `relative_path` (includes subfolder) over `filename`:
```javascript
const imagePath = image.relative_path || image.filename;
document.getElementById('detailImage').src = `/outputs/${imagePath}`;
```

## Development Commands

```powershell
python app.py                    # Start server on port 4879
python -m py_compile <file>      # Check syntax
# No hot reload - restart after Python changes
# Frontend (HTML/CSS/JS) - just refresh browser
```

## Key API Endpoints

- `POST /api/queue` - Add job (single generation)
- `GET /api/queue` - Returns `{queue: [], active: {}, completed: []}`
- `DELETE /api/queue/<job_id>` - Remove queued or completed job (not active)
- `POST /api/queue/clear` - Clears queued items only (preserves completed history)
- `GET /api/browse?path=<subfolder>` - Browse folder with metadata (relative_path includes subfolder)
- `GET /api/browse_images?folder=input` - List images from ComfyUI input directory
- `GET /api/image/input/<filename>` - Serve image from ComfyUI input directory
- `POST /api/upload` - Upload image to ComfyUI input directory (returns filename)
- `POST /api/copy_to_input` - Copy image from output to input folder
- `POST /api/folder` - Create subfolder
- `POST /api/move` / `POST /api/delete` - Batch operations with conflict resolution
- `POST /api/ai/optimize` - AI prompt optimization (accepts `is_batch` flag, streams with Ollama)
- `POST /api/ai/suggest` - Apply custom suggestions to prompts (streaming)
- `POST /api/ai/generate-csv` - Generate CSV data for batch parameters (streaming)
- `POST /api/ai/generate-parameter-values` - Generate single/multi parameter values (streaming)
- `POST /api/ai/stop` - Stop AI generation and unload model immediately
- `GET /api/ai/models` - Get available models (Ollama + Gemini)
- `POST /api/comfyui/unload` - Free RAM/VRAM/cache (manual, resets auto-unload timer)
- `GET /api/comfyui/status` - Get timer status (timer_active, unload_in_seconds)

**Auto-unload:** ComfyUI models unload after 5 minutes (300s) idle with countdown timer in UI. Ollama models unload immediately (`keep_alive: 0`). Manual unload resets timer. **Models also automatically unload when switching between text-to-image and image-to-image modes** to prevent VRAM conflicts.

**Response Format:** All write endpoints return JSON with `{success: bool, ...}`. Always check `result.success` in frontend. ComfyUI `/free` endpoint returns empty response - handle gracefully.

## Project-Specific Conventions

**Auto-Unload Timer:**
- 5-minute countdown starts when queue becomes empty
- Visual timer displayed in queue sidebar (`#autoUnloadTimer`)
- Updates every second via `/api/comfyui/status`
- Formatted as `MM:SS` (e.g., "5:00", "4:59")
- Hides when timer stops or queue has jobs
- Manual unload sets `last_queue_empty_time = None` to stop timer
- Backend uses `UNLOAD_DELAY_SECONDS = 300`

**Mobile Sidebar:**  
- Prevent click propagation: `event.stopPropagation()` on toggle
- Prevent sidebar clicks from closing: `sidebar.addEventListener('click', e => e.stopPropagation())`
- Main content closes sidebar only when open on mobile

**Fullscreen Controls:**  
Always clickable via `pointer-events: auto` and `z-index: 10` on close button, nav buttons, zoom/autoplay controls.

**Image Viewer:**  
Fullscreen zoom (100-500%), keyboard (←/→/A/D/+/-/0/Space), autoplay (0.5-60s), import params to form.

**Output Folder Fields:**  
`#subfolder` must be editable (no readonly) and populated by `setOutputFolder()`.

## Keyboard Shortcuts

**Anywhere (except in modals):**
- `Ctrl+Enter` (or `Cmd+Enter`) - Trigger generation

**Fullscreen Viewer:**
- `←` / `→` or `A` / `D` - Navigate images
- `+` / `-` - Zoom in/out
- `0` - Reset zoom to 100%
- `Space` - Toggle autoplay
- `Esc` - Exit fullscreen

**Image Modal:**
- `←` / `→` - Previous/next image
- `Esc` - Close modal

## Common Modifications

**Add Generation Parameter:**  
1. HTML input in `templates/index.html` (single form only)
2. Capture in `generateImage()` (script.js)  
3. Add to job dict in `add_to_queue()` (app.py)  
4. Add to `modify_workflow()` and `generate_image()` signatures (comfyui_client.py)
5. Update workflow node in `modify_workflow()` using appropriate node ID from `Qwen_Full.json`
6. Store in `add_metadata_entry()` signature (app.py)
7. Display in `renderMetadata()` (script.js)
8. Update `importImageData()` (script.js) to import the value

**Change Server Address:**  
Update TWO places: `app.py` line ~37, `comfyui_client.py` line ~18.

**Change ComfyUI Workflow:**  
1. Export workflow from ComfyUI as JSON → save as `Qwen_Full.json`
2. Find node IDs for: prompt input, dimensions, sampler settings
3. Update node IDs in `comfyui_client.py:modify_workflow()` method
4. Test with single generation

**Add Mobile Collapsible Section:**  
1. HTML: `<button class="collapsible-header" data-target="id">...</button>`  
2. HTML: `<div class="collapsible-content active" id="id">...</div>`  
3. JS: `initializeCollapsibleSections()` handles all automatically

**Error Handling for ComfyUI:**  
ComfyUI's `/free` endpoint may return empty responses. Always handle gracefully:
```python
response_text = response.read().decode('utf-8').strip()
if response_text:
    try:
        result = json.loads(response_text)
    except json.JSONDecodeError:
        pass  # Empty or non-JSON response is OK
```

## File Structure
```
├── app.py                 # Flask backend (queue, metadata, AI)
├── comfyui_client.py      # Stdlib ComfyUI wrapper
├── ai_assistant.py        # AI (Ollama + Gemini, 60s keep-alive)
├── ai_instructions.py     # AI preset prompts
├── templates/index.html   # Mobile-optimized SPA
├── static/
│   ├── script.js          # Vanilla JS, mobile handlers
│   └── style.css          # Dark theme, mobile responsive
├── outputs/               # Gitignored - images, metadata, queue_state.json
├── workflows/
│   ├── Qwen_Full.json     # Current ComfyUI workflow (node IDs)
│   └── Imaginer.json      # Legacy workflow
└── *.json                 # Pinokio integration
```

## Mobile CSS Breakpoints

- `@media (max-width: 768px)` - Main mobile optimizations
- `@media (max-width: 480px)` - Extra small devices
- Queue sidebar: `position: fixed`, `transform: translateX(-100%)`
- Collapsible sections: `max-height` transitions with `.active` class
- Tabs: "Single", "Batch", "Browser"

## State Variables (script.js)

```javascript
let currentImageIndex = 0;        // Gallery navigation
let images = [];                  // All images in view
let currentPath = '';             // Browser folder path
let selectedItems = new Set();    // Multi-select paths
let selectionMode = false;        // Browse vs select toggle
let zoomLevel = 1;                // Fullscreen zoom (1-5x)
let autoplayTimer = null;         // Autoplay setTimeout ID
let isAutoplayActive = false;     // Autoplay on/off state
let lastSeenCompletedIds = new Set(); // Track seen completions for folder refresh
let aiCurrentPromptSource = 'single';  // 'single' or 'batch' for AI context
let uploadedImageFilename = null; // Tracks uploaded image for generation
let imageBrowserMode = 'single';  // 'single' or 'batch' for browse context
let currentBrowserFolder = 'input'; // 'input' or 'output' for browser
```

## Integration Notes

**Pinokio:** `install.json`, `start.json`, `update.json`, `reset.json` manage venv and Flask.

**ComfyUI Workflow:** Node structure in `Qwen_Full.json` must match IDs in `comfyui_client.py:modify_workflow()`.

**AI Models:** Ollama via `/api/tags`, Gemini hardcoded. Frontend polls `/api/ai/models` on load.
