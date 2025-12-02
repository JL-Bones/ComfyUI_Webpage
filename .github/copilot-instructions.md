# ComfyUI Web Interface - AI Agent Instructions

## Project Overview
Flask-based web UI for ComfyUI image generation with queue management, real-time updates, and metadata tracking. **Requires ComfyUI server running on `http://127.0.0.1:8188`**.

## Architecture

### Three-Layer System
1. **ComfyUI Client** (`comfyui_client.py`): Python wrapper around ComfyUI REST API using only stdlib
2. **Flask Backend** (`app.py`): Queue processor, metadata storage, serves web UI on `0.0.0.0:4879`
3. **Frontend** (`templates/index.html`, `static/`): Dark-themed SPA with collapsible queue sidebar

### Data Flow
```
User Input → Flask Queue → Background Thread → ComfyUI API → Image + Metadata Storage
                ↓                                                        ↓
         Real-time Queue Updates (1s polling)              Auto-refresh Gallery (5s)
```

## Critical Workflow Nodes (Imaginer.json)

The workflow uses **hardcoded node IDs** that must match exactly:
- `75:6` - Positive prompt (CLIPTextEncode)
- `75:7` - Negative prompt (CLIPTextEncode)
- `75:58` - Dimensions (EmptySD3LatentImage)
- `75:3` - Sampler settings (KSampler)

When modifying workflow parameters in `comfyui_client.py`, use these exact node IDs. **Do not change node structure without updating client code.**

## Key Conventions

### Metadata Storage
- All generation params stored in `outputs/metadata.json` as flat array
- **Seed is always captured** - random seeds are generated and logged during processing
- CFG scale removed from UI but hardcoded to `1.0` in backend
- Filename pattern: `comfyui_YYYYMMDD_HHMMSS_{job_id[:8]}.png`

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
- Images list: Array of metadata objects (newest first via `[::-1]`)
- Queue status: `{'queue': [...], 'active': {...}}`

## Running & Testing

### Start Server
```powershell
python app.py  # Starts on 0.0.0.0:4879
```

### Dependencies
**Zero pip dependencies** - uses only Python stdlib (`urllib`, `json`, `threading`, `flask`). Flask must be installed separately: `pip install flask`

### File Organization
```
outputs/              # Generated images (gitignored)
├── *.png            # Image files
└── metadata.json    # Flat array of generation records

static/
├── robots.txt       # Blocks AI crawlers from /outputs/
├── style.css        # Dark theme (CSS vars for consistency)
└── script.js        # Vanilla JS, no frameworks

templates/
└── index.html       # Single-page app
```

## AI Crawler Protection
- `.gitignore` blocks `outputs/` from version control
- `robots.txt` served at `/robots.txt` blocks major AI crawlers (GPTBot, Claude-Web, etc.)
- All bots blocked from `/outputs/*` paths

## UI State Management

### Real-time Updates
- Queue polls every 1s via `setInterval` → `/api/queue`
- Gallery refreshes every 5s → `/api/images`
- No WebSocket - simple HTTP polling pattern

### Image Navigation
- Click gallery item → opens modal with prev/next arrows
- Keyboard: `←`/`→` navigate, `Esc` closes
- Counter shows position: "3 / 10"
- Navigation wraps around (first ← goes to last)

## Common Modifications

### Changing ComfyUI Server Address
Update in **two places**:
```python
# app.py line 30
comfyui_client = ComfyUIClient(server_address="127.0.0.1:8188")

# comfyui_client.py line 18 (default)
def __init__(self, server_address: str = "127.0.0.1:8188"):
```

### Adding New Parameters
1. Add input field to `templates/index.html` parameters grid
2. Capture in `generateImage()` function (`script.js`)
3. Add to Flask job dict in `add_to_queue()` (`app.py`)
4. Pass to `comfyui_client.generate_image()` in `process_queue()`
5. Store in `add_metadata_entry()` signature
6. Display in `renderMetadata()` function

### Modifying Workflow Nodes
Edit `comfyui_client.py` → `modify_workflow()` method. Node IDs are **not** sequential - they match exported ComfyUI workflow. Use exact IDs from `Imaginer.json`.

## Development Notes

- **No hot reload** - restart Flask server after backend changes
- Frontend changes (HTML/CSS/JS) need browser refresh only
- Queue processing runs in daemon thread - stops when Flask exits
- Modal overlays use `.active` class toggle pattern
- All HTML rendered server-side via Jinja2 templates
