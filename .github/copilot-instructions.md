# ComfyUI Web Interface - AI Agent Instructions

## Project Overview
Flask-based web UI for ComfyUI image generation with hierarchical folder management, custom modals, queue system, and real-time updates. **Requires ComfyUI server running on `http://127.0.0.1:8188`**.

## Architecture

### Three-Layer System
1. **ComfyUI Client** (`comfyui_client.py`): Python wrapper around ComfyUI REST API using only stdlib
2. **Flask Backend** (`app.py`): Queue processor, folder management, metadata storage, serves web UI on `0.0.0.0:4879`
3. **Frontend** (`templates/index.html`, `static/`): Dark-themed SPA with folder browser, custom modals, and fullscreen image viewer

### Data Flow
```
User Input → Flask Queue → Background Thread → ComfyUI API → Image + Metadata Storage
                ↓                                                        ↓
         Real-time Queue Updates (1s polling)              Folder Browser with Auto-refresh
```

## Critical Workflow Nodes (Imaginer.json)

The workflow uses **hardcoded node IDs** that must match exactly:
- `75:6` - Positive prompt (CLIPTextEncode)
- `75:58` - Dimensions (EmptySD3LatentImage)
- `75:3` - Sampler settings (KSampler)
- `75:89` - NSFW toggle (easy boolean)

When modifying workflow parameters in `comfyui_client.py`, use these exact node IDs. **Do not change node structure without updating client code.**

## Key Conventions

### Metadata Storage
- All generation params stored in `outputs/metadata.json` as flat array
- **Seed is always captured** - random seeds are generated and logged during processing
- **Negative prompt removed** - not stored or displayed
- CFG scale removed from UI but hardcoded to `1.0` in backend
- Filename pattern: `{file_prefix}{index:04d}.png` (e.g., `comfyui0000.png`, `myprefix0001.png`)
- Each entry includes `subfolder` field for hierarchical organization

### File Management Pattern
```python
# Auto-incrementing filenames with prefix
def get_next_filename(prefix: str, subfolder: str = "", extension: str = "png") -> tuple:
    # Returns (relative_path, absolute_path)
    # Scans folder for existing files with same prefix
    # Increments index until unique filename found

# Conflict resolution on move/copy
def get_unique_filename(target_path: Path) -> Path:
    # Appends (1), (2), etc. if file exists at target
    # Pattern: "filename (1).png", "filename (2).png"
```

### Queue Management Pattern
```python
# Thread-safe queue with lock
with queue_lock:
    if generation_queue and not active_generation:
        job = generation_queue[0]
        active_generation = job  # Mark as active FIRST
        job['status'] = 'generating'
```
**Critical**: Frontend filters active job from queue display to prevent duplicates (see `renderQueue()` in `script.js`)

### API Response Structure
All Flask endpoints return JSON with consistent patterns:
- Queue operations: `{'success': bool, 'job_id': str}` or error message
- Browse folder: `{'current_path': str, 'folders': [...], 'files': [...]}`
- Queue status: `{'queue': [...], 'active': {...}}`
- Batch operations: `{'success': bool, 'moved': [...], 'errors': [...]}` or `{'deleted': [...], 'errors': [...]}`

### Custom Modal Pattern (No Browser Popups)
```javascript
// All user dialogs use Promise-based custom modals
await showAlert('Message', 'Title');           // Info/error messages
const value = await showPrompt('Enter name');  // Text input
const ok = await showConfirm('Are you sure?'); // Yes/No confirmation

// Never use: alert(), prompt(), confirm()
// Modal HTML in templates/index.html with IDs: customAlert, customDialog
// Dark-themed to match UI with .custom-modal styles
```

## Running & Testing

### Start Server
```powershell
python app.py  # Starts on 0.0.0.0:4879
```

### Dependencies
**Zero pip dependencies** - uses only Python stdlib (`urllib`, `json`, `threading`). Flask must be installed separately: `pip install flask`

### File Organization
```
outputs/              # Generated images with subfolders (gitignored)
├── subfolder1/      # User-created folders
│   ├── *.png       # Images in subfolder
├── *.png            # Root-level images
└── metadata.json    # Flat array with 'subfolder' and 'path' fields

static/
├── style.css        # Dark theme with custom modal styles
└── script.js        # Vanilla JS: folder browser, selection mode, custom dialogs

templates/
└── index.html       # SPA with folder toolbar and custom modal HTML

Imaginer.json         # ComfyUI workflow with hardcoded node IDs
pinokio.js, *.json   # Pinokio integration files
```

## UI Features

### Folder Browser System
- Breadcrumb navigation with clickable path segments
- **Selection Mode Toggle**: Click "Select" → enables multi-select with checkboxes
  - Move/Delete buttons only visible in selection mode
  - `selectedItems` Set tracks paths, `selectionMode` boolean controls UI state
- Parent folder (`..`) shown when not at root
- Folders sorted alphabetically, files by timestamp (newest first)
- Auto-refresh after generation completes or file operations

### Real-time Updates
- Queue polls every 1s via `setInterval` → `/api/queue`
- Folder browser refreshes on demand via `browseFolder(path)`
- No WebSocket - simple HTTP polling pattern

### Image Navigation
- Click gallery item → opens modal with prev/next arrows
- Click fullscreen button → browser fullscreen with auto-hiding controls
- Keyboard: `←`/`→`/`A`/`D` navigate, `Esc` closes
- Touch: Swipe left/right to navigate (50px threshold)
- Counter shows position in top-right corner
- Controls auto-hide after 2 seconds of mouse inactivity (fullscreen only)
- Navigation wraps around (first ← goes to last)

### Import & Delete Features
- **Import**: Click "Import" in image detail view
  - Loads all parameters (prompt, dimensions, steps, seed, NSFW, file prefix)
  - Updates NSFW toggle button state via `updateNSFWButton()`
  - Automatically scrolls to form
  - Seed persists until manually cleared with ✕ button
- **Delete**: Click "Delete Image" in viewer
  - Shows custom confirm dialog (not browser confirm)
  - Removes file via `/api/delete` endpoint
  - Updates metadata and refreshes folder view

## Common Modifications

### Changing ComfyUI Server Address
Update in **two places**:
```python
# app.py line ~30
comfyui_client = ComfyUIClient(server_address="127.0.0.1:8188")

# comfyui_client.py line ~18 (default)
def __init__(self, server_address: str = "127.0.0.1:8188"):
```

### Adding New Parameters
1. Add input field to `templates/index.html` parameters grid
2. Capture in `generateImage()` function (`script.js`)
3. Add to Flask job dict in `add_to_queue()` (`app.py`)
4. Pass to `comfyui_client.generate_image()` in `process_queue()`
5. Store in `add_metadata_entry()` signature and update metadata schema
6. Display in `renderMetadata()` function (image detail modal)
7. Update `importImageData()` to include new parameter

### Adding Folder Operations
- Backend: Create endpoint in `app.py` following `/api/browse`, `/api/folder`, `/api/move`, `/api/delete` pattern
- Use `get_unique_filename()` for conflict resolution, `update_metadata_path()` or `delete_metadata_entry()` to sync metadata
- Frontend: Add button to toolbar in `templates/index.html`, wire event in `initializeEventListeners()`
- Use `showPrompt()` for input dialogs, `showConfirm()` for confirmations, `showAlert()` for errors
- Call `browseFolder(currentPath)` after operation to refresh view

### Modifying Workflow Nodes
Edit `comfyui_client.py` → `modify_workflow()` method. Node IDs are **not** sequential - they match exported ComfyUI workflow. Use exact IDs from `Imaginer.json`.

## Development Notes

- **No hot reload** - restart Flask server after backend changes
- Frontend changes (HTML/CSS/JS) need browser refresh only
- Queue processing runs in daemon thread - stops when Flask exits
- Modal overlays use `.active` class toggle pattern
- Fullscreen uses browser Fullscreen API (not just CSS fullscreen)
- Mouse activity tracking only active during fullscreen mode
- All HTML rendered server-side via Jinja2 templates

## Key State Variables (script.js)

```javascript
let currentImageIndex = 0;        // Current image in gallery
let images = [];                  // Array of all images (for navigation)
let currentImageData = null;      // Currently viewed image metadata
let currentPath = '';             // Current folder path in browser
let selectedItems = new Set();    // Set of selected file/folder paths
let allItems = [];                // All items in current folder (for selection)
let selectionMode = false;        // Toggle between browse/select modes
let touchStartX = 0;              // Touch start position
let touchEndX = 0;                // Touch end position
let mouseActivityTimer = null;    // Timer for auto-hiding controls
let isFullscreenActive = false;   // Fullscreen state flag
```

## Pinokio Integration

Includes complete Pinokio package management:
- `install.json` - Creates venv and installs Flask
- `start.json` - Launches web server on port 4879
- `update.json` - Updates Flask to latest version
- `reset.json` - Removes venv and outputs directory
- `open.json` - Opens web interface in browser
- `pinokio.js` - Dynamic menu generation
