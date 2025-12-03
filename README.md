# ComfyUI Web Interface

Flask-based web UI for ComfyUI with AI-assisted prompting, queue management, and file organization. Optimized for Qwen Image model with 4-step lightning generation.

## Features

- 🎨 **Dark-themed interface** with tab navigation (Single/Batch/Browser)
- 📱 **Mobile-optimized** - Collapsible menus, touch-friendly controls, responsive design
- 🤖 **AI assistance** - Prompt optimization and CSV generation with Ollama or Gemini (with streaming)
- 📊 **Batch generation** - CSV-based parameter templates with AI generation support
- 🎛️ **LoRA controls** - Three toggle switches with keyword hints (MCNL, Snofs, OFace)
- ⌨️ **Keyboard shortcuts** - Ctrl+Enter to generate, fullscreen navigation
- 📋 **Persistent queue** - Shared across users, survives restarts, shows count badge
- 📁 **Folder management** - Create, browse, move, delete with breadcrumbs
- 🖼️ **Image viewer** - Fullscreen with zoom (100-500%), autoplay, keyboard nav, touch gestures
- 💾 **Metadata tracking** - All generation params saved automatically
- ⏱️ **Auto-unload with timer** - 5-minute countdown timer, frees RAM/VRAM/cache when idle
- 🔔 **Toast notifications** - Custom modals, no browser dialogs

See [AI_FEATURES.md](AI_FEATURES.md) for AI setup and usage.

## Desktop & Mobile Features

### Desktop
- **Collapsible Queue Sidebar** - Click chevron to collapse sidebar from 320px to 40px
- **Responsive Layout** - Main content expands smoothly when sidebar collapses (no empty space)
- **Generate Button** - Positioned next to prompt box for quick access
- **Keyboard Shortcuts** - Full keyboard navigation support

### Mobile
- **Responsive Design** - Optimized layouts for screens ≤768px (tablets) and ≤480px (phones)
- **Collapsible Menu** - Hamburger button (☰) in header toggles queue sidebar overlay
- **Collapsible Sections** - Parameters and LoRA settings collapse to save screen space
- **Touch-Friendly** - Minimum 44px touch targets, increased button spacing
- **Single-Column Layout** - Parameter grids and prompt controls stack vertically
- **Fullscreen Viewer** - Pinch-to-zoom, swipe navigation, optimized controls
- **Tab Navigation** - Compact tabs: "Single", "Browser"

## Keyboard Shortcuts

**Anywhere (except in modals):**
- `Ctrl+Enter` (or `Cmd+Enter`) - Generate image

**Fullscreen Viewer:**
- `←` / `→` or `A` / `D` - Navigate images
- `+` / `-` - Zoom in/out
- `0` - Reset zoom to 100%
- `Space` - Toggle autoplay
- `Esc` - Exit fullscreen

**Image Modal:**
- `←` / `→` - Previous/next image
- `Esc` - Close modal

## Requirements

- Python 3.7+ and Flask (`pip install flask`)
- ComfyUI server running on `http://127.0.0.1:8188` with Qwen Image model installed
  - Model: `qwen_image_fp8_e4m3fn.safetensors` (diffusion model)
  - CLIP: `qwen_2.5_vl_7b_fp8_scaled.safetensors`
  - VAE: `qwen_image_vae.safetensors`
  - LoRA: `Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors`
- Optional: Ollama or Gemini API key for AI features (see [AI_FEATURES.md](AI_FEATURES.md))

## Quick Start

```powershell
pip install flask
python app.py  # Starts on http://localhost:4879
```

ComfyUI must be running on `http://127.0.0.1:8188`

## Usage

### Tab Navigation

The interface has three tabs:
- **Single Generation**: Generate individual images with full parameter control
- **Batch Generation**: Create multiple variations using CSV templates with parameter placeholders
- **Image Browser**: Browse, organize, and manage your generated images

### Generate Images (Single Mode)

1. Navigate to the **Single Generation** tab (default)
2. Enter your prompt in the text area (or press `Ctrl+Enter` to generate quickly)
3. Adjust parameters:
   - **Width/Height**: Image dimensions (default: 1024×1024)
   - **Steps**: Sampling steps (default: 4)
   - **Seed**: Random seed (leave empty for random, ✕ button to clear)
   - **File Prefix**: Custom filename prefix (default: "comfyui")
   - **Subfolder**: Target folder for output (optional, set from browser)
4. Configure **LoRA Settings** (collapsible section):
   - **MCNL LoRA**: Manga/comic line art style with keywords
   - **Snofs LoRA**: Soft lighting and artistic effects with keywords
   - **OFace LoRA**: Facial expression enhancement with keywords
5. Click "Generate" button (next to prompt) or press `Ctrl+Enter` to add to queue
6. Watch progress in the left sidebar queue panel
7. Completed items show thumbnail images - click to jump to Image Browser

### Generate Batches (Batch Mode)

1. Navigate to the **Batch Generation** tab
2. Enter a **base prompt with parameter placeholders**:
   ```
   A [animal] wearing a [clothing] in a [location]
   ```
3. Choose input method for **Parameter Values**:
   - **Manual Entry**: Select parameters from dropdown, generate with AI, or type values
   - **Paste Data**: Paste CSV data directly (header row + data rows)
   - **Upload File**: Load a CSV file with parameter values
4. Click **Preview Batch** to see all generated prompts
5. Adjust batch parameters (width, height, steps, seed, prefix, folder, LoRAs)
6. Click **Queue [N] Images** to add all variations to the queue
7. Watch sequential generation in the queue sidebar

**AI Features for Batch Mode:**
- **✨ Edit with AI** - Optimize template while preserving `[parameters]`
- **✨ Generate CSV with AI** - Create parameter combinations automatically
- **✨ Edit Parameter Values** - AI-assisted editing of single or multiple parameters
- Parameters can be enabled/disabled individually for batch override

See [AI_FEATURES.md](AI_FEATURES.md) for detailed AI usage guide.

### View Images

- Navigate to the **Image Browser** tab to see your gallery
- **Browse subfolders** - Images in subfolders display correctly in modal and fullscreen
- Click any image to open detail view with metadata
- Use arrow buttons or keyboard (←/→/A/D) to navigate between images
- Click fullscreen button for immersive viewing with zoom and autoplay
- **Zoom:** 100-500% via mouse wheel, +/-/0 keys, touch pinch, or buttons - drag to pan when zoomed
- **Autoplay:** Press Space or click play button (0.5-60s intervals), auto-pauses on manual navigation
- Controls auto-hide after 2 seconds (always clickable even when hidden)
- Click "Import" to load image parameters back into Single Generation form
  - Automatically switches to Single Generation tab
  - Loads all parameters including seed
  - Scrolls to form for easy editing
- Click "Delete Image" to remove image (with custom confirmation dialog)

### Manage Folders

- **Browse**: Navigate folders using breadcrumb navigation or folder icons
- **Create**: Click "Create Folder" to make new subfolders
- **Select Mode**: Click "Select" to enable multi-select with checkboxes
  - Select multiple files/folders
  - Click "Move" to relocate selected items to another folder
  - Click "Delete" to remove selected items (empty folders only)
- **Set Output**: Click "Set Output Folder" to change current folder to generation target
- Files automatically increment (e.g., prefix0000.png, prefix0001.png)
- Duplicate names get (1), (2) suffixes on move operations

### Queue Management

- View all jobs in left sidebar (queued → active → completed)
- **Mobile:** Tap hamburger menu (☰) in header to open/close queue sidebar
- **Batch jobs** show as individual items with batch index in the queue
- **Queued items** appear at top (newest first) with status badge
- **Active item** shows in middle while generating (cannot be removed)
- **Completed items** display at bottom with thumbnail images (last 50 preserved)
- **Remove items** with the ✕ button on queued, completed, or failed jobs
- **Clear queue** with trash icon - removes only queued items, preserves completed history
- **Unload models** with cube icon to free RAM/VRAM/cache manually
- Click completed thumbnails to navigate to image in browser
- Queue processes oldest first (FIFO) but displays newest on top
- Real-time status updates every second with immediate UI feedback
- **Persistent queue** - Survives server restarts via `queue_state.json`
- **Shared across all users** - All browsers see same queue state
- Keeps last 50 completed jobs with images
- Batch generations appear as sequential individual jobs in queue
## Generation Parameters

- `positive_prompt`: Main prompt text (sent to Qwen CLIP encoder)
- `width`: Image width (64-2048, step 64, default 1024)
- `height`: Image height (64-2048, step 64, default 1024)  
- `steps`: Sampling steps (1-100, default 4 for Qwen Lightning)
- `seed`: Random seed (optional, auto-generated if empty)
- `cfg`: Fixed at 1.0 (required for Qwen Image model)
- `sampler`: Fixed at "euler" with "simple" scheduler
- `file_prefix`: Custom filename prefix (default: "comfyui")
- `subfolder`: Target subfolder path (optional)
- `mcnl_lora`: Enable MCNL LoRA (manga/comic style)
- `snofs_lora`: Enable Snofs LoRA (soft lighting effects)
- `oface_lora`: Enable OFace LoRA (facial expressions)

## Project Structure

```
├── app.py                 # Flask backend with queue processor & AI endpoints (SSE streaming)
├── comfyui_client.py      # Python stdlib ComfyUI API wrapper (urllib, json)
├── ai_assistant.py        # AI integration (Ollama + Gemini, immediate unload after use)
├── ai_instructions.py     # Preset instructions for AI operations (batch & single)
├── Imaginer.json          # ComfyUI workflow definition with node IDs
├── .env.example           # Example environment file for API keys
├── AI_FEATURES.md         # Complete AI features documentation
├── templates/
│   └── index.html         # Three-tab SPA (Single/Batch/Browser) with mobile optimization
├── static/
│   ├── style.css          # Dark theme, mobile responsive (≤768px, ≤480px)
│   ├── script.js          # Vanilla JS (batch, streaming, mobile handlers, AI, modals)
├── outputs/               # Generated images with subfolders (gitignored)
│   ├── subfolder1/       # User-created folders
│   │   └── *.png        # Images in subfolder
│   ├── *.png             # Root-level images
│   ├── metadata.json     # Generation metadata with folder tracking
│   └── queue_state.json  # Persistent queue state (shared across users)
├── requirements.txt       # Python dependencies (Flask only)
├── install.json          # Pinokio install script
├── start.json            # Pinokio start script
├── update.json           # Pinokio update script
└── reset.json            # Pinokio reset script
```

## API Endpoints

### Core Endpoints
- `GET /` - Main web interface with tabs
- `POST /api/queue` - Add single generation job to queue (adds to front)
- `GET /api/queue` - Get queue status (returns queued, active, completed)
- `DELETE /api/queue/<job_id>` - Remove queued or completed job (not active)
- `POST /api/queue/clear` - Clear queued items only (preserves completed history)
- `GET /api/browse` - Browse folder contents (files and subfolders with relative paths)
- `POST /api/folder` - Create new subfolder
- `POST /api/move` - Move files/folders (with conflict resolution)
- `POST /api/delete` - Delete files/empty folders
- `GET /api/images/<image_id>` - Get specific image metadata
- `GET /outputs/<path:filepath>` - Serve generated image from any subfolder

### AI Assistant Endpoints
- `GET /api/ai/models` - Get available AI models (Ollama and Gemini)
- `POST /api/ai/optimize` - Optimize a prompt (supports `is_batch` flag, streams with Ollama)
- `POST /api/ai/suggest` - Apply user suggestion to edit prompt (streaming)
- `POST /api/ai/generate-csv` - Generate CSV data for batch parameters (streaming)
- `POST /api/ai/generate-parameter-values` - Generate single/multi parameter values (streaming)
- `POST /api/ai/stop` - Stop AI generation and unload model immediately

### ComfyUI Memory Management Endpoints
- `POST /api/comfyui/unload` - Manually unload all models and clear memory
- `GET /api/comfyui/status` - Get memory status and auto-unload timer info

## Pinokio Integration

This project includes Pinokio integration files for easy package management:

## Configuration

### Change ComfyUI Server Address

Edit both files:

```python
# app.py (line ~37)
comfyui_client = ComfyUIClient(server_address="127.0.0.1:8188")

# comfyui_client.py (line ~18)
def __init__(self, server_address: str = "127.0.0.1:8188"):
```

### Change Web Server Port

```python
# app.py (last line)
app.run(host='0.0.0.0', port=4879, debug=False, threaded=True)
```

### Use Different ComfyUI Workflow

1. Export your workflow from ComfyUI as JSON
2. Replace `Imaginer.json` with your workflow file
3. Update `comfyui_client.py:modify_workflow()` with your node IDs:
   - Find prompt input node → update line with `["75:6"]["inputs"]["text"]`
   - Find dimension node → update lines with `["75:58"]["inputs"]["width/height"]`
   - Find sampler node → update lines with `["75:3"]["inputs"][...]`
4. Adjust default parameters if your workflow requires different settings
### Change Web Server Port

```python
# app.py (last line)
app.run(host='0.0.0.0', port=4879, debug=False, threaded=True)
```

## Development

- **No hot reload** - Restart Flask server after Python changes
- Frontend changes (HTML/CSS/JS) only need browser refresh
- Queue processing runs in daemon thread
- Uses only Python stdlib for ComfyUI client (no pip dependencies)
- Flask is the only external dependency
- **Model Management:**
  - ComfyUI models auto-unload after 5 minutes idle (300s countdown timer)
  - Ollama models unload immediately after generation (`keep_alive: 0`)
  - Both can be manually unloaded via UI buttons
  - Stop button cancels AI streaming and unloads model instantly

## Privacy

- `outputs/` directory is gitignored
- `robots.txt` blocks major AI crawlers (GPTBot, Claude-Web, etc.)
- All metadata stored locally in `outputs/metadata.json`

## License

This project is open source and available for use and modification.
