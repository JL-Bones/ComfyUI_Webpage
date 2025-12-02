# ComfyUI Web Interface - AI Agent Instructions

## Project Overview
Flask-based web UI for ComfyUI image generation with AI-assisted prompting, batch processing, queue management, and file organization. **Requires ComfyUI server at `http://127.0.0.1:8188`**. Only dependency: Flask.

## Architecture (Three-Layer System)

**1. ComfyUI Client** (`comfyui_client.py`)  
Python stdlib wrapper (urllib, json). Modifies workflow JSON with hardcoded node IDs from `Imaginer.json`:
- `75:6` - Positive prompt (CLIPTextEncode)  
- `75:58` - Dimensions (EmptySD3LatentImage)  
- `75:3` - Sampler (KSampler)  
- `75:89` - NSFW toggle (easy boolean)

**2. Flask Backend** (`app.py`)  
Queue processor (LIFO display, FIFO execution), metadata storage, AI integration. Serves on `0.0.0.0:4879`. Background daemon thread processes queue sequentially. Model auto-unload after 60s idle.

**3. Frontend** (`templates/index.html`, `static/`)  
Vanilla JS SPA with collapsible mobile UI, custom modals (no browser dialogs), toast notifications, 1s polling.

**Data Flow:**  
```
User → Queue (front insert) → Thread (end pop, oldest first) → ComfyUI → Image + Metadata
         ↓ 1s poll                                                           ↓ auto-refresh
    3-section UI (queued/active/completed)                          Folder browser + thumbnails
```

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

### Mobile Optimization
- Queue sidebar: Fixed overlay on mobile (≤768px), collapsed by default
- Hamburger menu toggles sidebar (`toggleMobileMenu()` with `stopPropagation()`)
- Collapsible sections: `.collapsible-header` + `.collapsible-content` with `.active` class
- Touch targets: Min 44px height, increased padding on mobile
- Tabs: "Single", "Batch", "Browser" (shortened for mobile)

### File Naming (Auto-Increment)
```python
def get_next_filename(prefix: str, subfolder: str = "") -> tuple:
    # Scans existing files, returns (relative_path, absolute_path)
    # Pattern: "{prefix}{index:04d}.png" (e.g., "comfyui0000.png")
```

### Metadata Storage
Flat JSON array in `outputs/metadata.json`: `id, filename, path, subfolder, timestamp, prompt, width, height, steps, seed, nsfw, file_prefix`. No negative prompt or CFG (CFG=1.0).

### AI Integration (`ai_assistant.py`)
Dual provider: Ollama (local, port 11434) and Gemini (API key from `.env`). Models kept loaded 60s after use. Context-aware batch generation receives `batch_params` and `varied_params` for intelligent suggestions.

### Custom Modals (No Browser Dialogs)
```javascript
// Toast notifications (preferred)
showNotification('Message', 'Title', 'success', 3000);

// Blocking modals for input
const value = await showPrompt('Enter name');
const ok = await showConfirm('Are you sure?');

// NEVER use: alert(), prompt(), confirm()
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
- `POST /api/queue/batch` - Add multiple jobs with template `[parameter]` replacement
- `GET /api/queue` - Returns `{queue: [], active: {}, completed: []}`
- `POST /api/queue/clear` - Clears queued items only (preserves completed)
- `GET /api/browse?path=<subfolder>` - Browse folder with metadata
- `POST /api/folder` - Create subfolder
- `POST /api/move` / `POST /api/delete` - Batch operations with conflict resolution
- `POST /api/ai/optimize` / `POST /api/ai/suggest` - AI prompt editing
- `POST /api/ai/generate-parameters` - Generate CSV batch data (context-aware)
- `POST /api/comfyui/unload` - Free RAM/VRAM/cache (manual)

**Auto-unload:** ComfyUI models unload after 60s idle. Ollama models unload after 60s via `keep_alive: '60s'`.

## Project-Specific Conventions

**Batch Generation:**  
Template syntax: `[parameter_name]`. Per-image parameters via checkboxes enable comma-separated values or CSV columns (width, height, steps, seed, file_prefix, subfolder, nsfw).

**Mobile Sidebar:**  
- Prevent click propagation: `event.stopPropagation()` on toggle
- Prevent sidebar clicks from closing: `sidebar.addEventListener('click', e => e.stopPropagation())`
- Main content closes sidebar only when open on mobile

**Fullscreen Controls:**  
Always clickable via `pointer-events: auto` and `z-index: 10` on close button, nav buttons, zoom/autoplay controls.

**Image Viewer:**  
Fullscreen zoom (100-500%), keyboard (←/→/A/D/+/-/0/Space), autoplay (0.5-60s), import params to form.

**Output Folder Fields:**  
Both `#subfolder` and `#batchSubfolder` must be editable (no readonly) and populated by `setOutputFolder()`.

## Common Modifications

**Add Parameter:**  
1. HTML input in `templates/index.html`  
2. Capture in `generateImage()` (script.js)  
3. Add to job dict in `add_to_queue()` (app.py)  
4. Pass to `comfyui_client.generate_image()`  
5. Store in `add_metadata_entry()` signature  
6. Display in `renderMetadata()` (script.js)

**Change Server Address:**  
Update TWO places: `app.py` line ~37, `comfyui_client.py` line ~18.

**Add Mobile Collapsible Section:**  
1. HTML: `<button class="collapsible-header" data-target="id">...</button>`  
2. HTML: `<div class="collapsible-content active" id="id">...</div>`  
3. JS: `initializeCollapsibleSections()` handles all automatically

## File Structure
```
├── app.py                 # Flask backend (queue, metadata, AI)
├── comfyui_client.py      # Stdlib ComfyUI wrapper
├── ai_assistant.py        # AI (Ollama + Gemini, 60s keep-alive)
├── ai_instructions.py     # AI preset prompts
├── Imaginer.json          # ComfyUI workflow (node IDs)
├── templates/index.html   # Mobile-optimized SPA
├── static/
│   ├── script.js          # Vanilla JS, mobile handlers
│   └── style.css          # Dark theme, mobile responsive
├── outputs/               # Gitignored - images, metadata, queue_state.json
└── *.json                 # Pinokio integration
```

## Mobile CSS Breakpoints

- `@media (max-width: 768px)` - Main mobile optimizations
- `@media (max-width: 480px)` - Extra small devices
- Queue sidebar: `position: fixed`, `transform: translateX(-100%)`
- Collapsible sections: `max-height` transitions with `.active` class

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
```

## Integration Notes

**Pinokio:** `install.json`, `start.json`, `update.json`, `reset.json` manage venv and Flask.

**ComfyUI Workflow:** Node structure in `Imaginer.json` must match IDs in `comfyui_client.py:modify_workflow()`.

**AI Models:** Ollama via `/api/tags`, Gemini hardcoded. Frontend polls `/api/ai/models` on load.
