# ComfyUI Web Interface - AI Agent Instructions

## Project Overview
Flask-based web UI for ComfyUI image generation with AI-assisted prompting, batch processing, queue management, and file organization. **Requires ComfyUI server at `http://127.0.0.1:8188`**. Zero pip dependencies except Flask.

## Architecture (Three-Layer System)

**1. ComfyUI Client** (`comfyui_client.py`)  
Python wrapper using only stdlib (urllib, json). Modifies workflow JSON with hardcoded node IDs from `Imaginer.json`:
- `75:6` - Positive prompt (CLIPTextEncode)  
- `75:58` - Dimensions (EmptySD3LatentImage)  
- `75:3` - Sampler (KSampler)  
- `75:89` - NSFW toggle (easy boolean)

**2. Flask Backend** (`app.py`)  
Queue processor (LIFO display, FIFO execution), metadata storage, AI integration. Serves on `0.0.0.0:4879`. Background daemon thread processes queue sequentially.

**3. Frontend** (`templates/index.html`, `static/`)  
Vanilla JS SPA with tabs (Single/Batch/Browser), custom modals (no browser dialogs), toast notifications, 1s polling for updates.

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
    
# Metadata saved BEFORE releasing lock (sequential batch processing)
with queue_lock:
    generation_queue.pop()
    completed_jobs.insert(0, job)  # Last 50 kept
    active_generation = None
```

**Persistent State:** `outputs/queue_state.json` survives restarts, shared across all browsers/users.

### File Naming (Auto-Increment)
```python
def get_next_filename(prefix: str, subfolder: str = "") -> tuple:
    # Scans existing files, returns (relative_path, absolute_path)
    # Pattern: "{prefix}{index:04d}.png" (e.g., "comfyui0000.png")
    
def get_unique_filename(target_path: Path) -> Path:
    # On conflict: "file (1).png", "file (2).png", etc.
```

### Metadata Storage
Flat JSON array in `outputs/metadata.json` with fields: `id, filename, path, subfolder, timestamp, prompt, width, height, steps, seed, nsfw, file_prefix`. Seed always captured (random if not provided). **No negative prompt or CFG stored** (CFG hardcoded to 1.0).

### AI Integration (`ai_assistant.py`)
Dual provider: Ollama (local, port 11434) and Gemini (API key from `.env`). Auto-discovers models, unloads Ollama immediately after use. Preset instructions in `ai_instructions.py` for optimization, editing, batch generation. **Context-aware batch generation:** Receives batch_params (width, height, steps, seed, nsfw, file_prefix, subfolder) and varied_params (which checkboxes enabled) to provide parameter-specific suggestions (dimension ranges, step counts, seed values, organized file prefixes/folders).

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
- `POST /api/ai/generate-parameters` - Generate CSV batch data with AI (accepts batch_params, varied_params for context)
- `POST /api/comfyui/unload` - Free RAM/VRAM/cache (manual trigger)

**Auto-unload:** Models unload automatically 10s after queue empties via ComfyUI `/free` endpoint.

## Project-Specific Conventions

**Batch Generation:**  
Template syntax: `[parameter_name]` replaced by CSV/JSON data. Three input modes: manual (comma-separated), paste (CSV/JSON text), upload (.csv/.json file). **Per-image parameters:** Checkboxes beside width/height/steps/seed/file_prefix/subfolder/nsfw enable per-image control via comma-separated values or CSV columns. AI-assisted parameter generation sends batch_params and varied_params for context-aware suggestions. All jobs queued with confirmation dialog showing editable file prefix and subfolder.

**Folder Operations:**  
Breadcrumb navigation, selection mode with checkboxes for multi-select. Set output folder for generation target. All operations update `metadata.json` atomically.

**Image Viewer:**  
Fullscreen with keyboard (←/→/A/D), touch swipe (50px threshold), auto-hiding controls (2s inactivity). **Zoom:** 100-500% via mouse wheel, +/-/0 keys, touch pinch, or buttons. Pan with click-drag when zoomed. **Autoplay:** Space key or button toggles, 0.5-60s configurable interval, pauses on manual nav. Import button loads params back to Single Generation tab. Delete shows custom confirm.

**Tab System:**  
JavaScript `switchTab()` toggles `.active` class. State in `data-tab` attributes. No routing - pure CSS visibility toggle.

**Queue Counter:**  
Blue badge shows pending count (`#queueCounter`), hidden when empty, updates on every poll.

## Common Modifications

**Add Parameter:**  
1. HTML input in `templates/index.html`  
2. Capture in `generateImage()` (script.js)  
3. Add to job dict in `add_to_queue()` (app.py)  
4. Pass to `comfyui_client.generate_image()`  
5. Store in `add_metadata_entry()` signature  
6. Display in `renderMetadata()` (script.js)  
7. Include in `importImageData()`

**Change Server Address:**  
Update in TWO places: `app.py` line ~37 (`ComfyUIClient(server_address=...)`), `comfyui_client.py` line ~18 (default param).

**Add Folder Operation:**  
Backend: New endpoint in `app.py` with metadata sync (`update_metadata_path`, `delete_metadata_entry`). Frontend: Button in toolbar, event in `initializeEventListeners()`, call `browseFolder(currentPath)` to refresh.

## File Structure
```
├── app.py                 # Flask backend (queue, metadata, AI endpoints)
├── comfyui_client.py      # Stdlib ComfyUI wrapper (urllib, json)
├── ai_assistant.py        # AI integration (Ollama + Gemini)
├── ai_instructions.py     # Preset AI prompts
├── Imaginer.json          # ComfyUI workflow (hardcoded node IDs)
├── templates/index.html   # SPA with tabs, modals, AI UI
├── static/
│   ├── script.js          # Vanilla JS (no frameworks)
│   └── style.css          # Dark theme
├── outputs/               # Gitignored - images, metadata, queue state
├── BATCH_PARAMETERS.md    # Per-image parameter documentation
├── FULLSCREEN_FEATURES.md # Zoom/autoplay documentation
├── AI_FEATURES.md         # AI setup and usage guide
└── *.json                 # Pinokio integration (install/start/reset)
```

## State Variables (script.js)

```javascript
let currentImageIndex = 0;        // Gallery navigation
let images = [];                  // All images in view
let currentPath = '';             // Browser folder path
let selectedItems = new Set();    // Multi-select paths
let selectionMode = false;        // Browse vs select toggle
let currentInputMethod = 'manual';// Batch: manual/textarea/file
let parsedBatchData = [];         // Parsed CSV/JSON for batch
let zoomLevel = 1;                // Fullscreen zoom (1-5x)
let zoomPanX = 0, zoomPanY = 0;   // Pan offset when zoomed
let isDragging = false;           // Mouse drag state
let autoplayTimer = null;         // Autoplay setTimeout ID
let isAutoplayActive = false;     // Autoplay on/off state
```

## Integration Notes

**Pinokio:** Scripts in root (`install.json`, `start.json`, `update.json`, `reset.json`) manage venv and Flask. `pinokio.js` generates dynamic menu.

**ComfyUI Workflow:** Node structure in `Imaginer.json` must match IDs in `comfyui_client.py:modify_workflow()`. Changes require updating both files.

**AI Models:** Ollama models discovered via `/api/tags`. Gemini models hardcoded (`gemini-2.5-flash`, `gemini-2.5-pro`). Frontend polls `/api/ai/models` on load.
