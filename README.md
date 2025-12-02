# ComfyUI Web Interface

Flask-based web UI for ComfyUI with AI-assisted prompting, batch generation, queue management, and file organization.

## Features

- 🎨 **Dark-themed interface** with tab navigation (Single/Batch/Browser)
- 🤖 **AI assistance** - Prompt optimization with Ollama or Gemini
- 📋 **Persistent queue** - Shared across users, survives restarts, shows count badge
- 📦 **Batch generation** - Template syntax `[parameter]` with CSV/JSON import
- 📁 **Folder management** - Create, browse, move, delete with breadcrumbs
- 🖼️ **Image viewer** - Fullscreen, keyboard nav (←/→/A/D), touch swipe
- 💾 **Metadata tracking** - All generation params saved automatically
- 🧠 **Auto-unload models** - Frees RAM/VRAM 10s after queue empties
- 🔔 **Toast notifications** - Custom modals, no browser dialogs

See [AI_FEATURES.md](AI_FEATURES.md) for AI setup and usage.

## Requirements

- Python 3.7+ and Flask (`pip install flask`)
- ComfyUI server running on `http://127.0.0.1:8188`
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
- **Batch Generation**: Generate multiple images with template-based parameter replacement
- **Image Browser**: Browse, organize, and manage your generated images

### Generate Images (Single Mode)

1. Navigate to the **Single Generation** tab (default)
2. Enter your prompt in the text area
3. Adjust parameters:
   - **Width/Height**: Image dimensions (default: 1024×1024)
   - **Steps**: Sampling steps (default: 4)
   - **Seed**: Random seed (leave empty for random, ✕ button to clear)
   - **NSFW**: Toggle NSFW mode (button turns red when active)
   - **File Prefix**: Custom filename prefix (default: "comfyui")
   - **Subfolder**: Target folder for output (optional, set from browser)
4. Click "Generate" to add to queue
5. Watch progress in the left sidebar queue panel
6. Completed items show thumbnail images - click to jump to Image Browser

### Batch Generation

Generate multiple images with parameter variations using templates:

**1. Create a Template Prompt**
- Use `[parameter_name]` syntax for values to be replaced
- Example: `"A girl in a [dress_color] dress with [accessory]"`

**2. Choose Input Method**

Three ways to provide parameter values:

**Manual Entry:**
1. Click "Parse Template Parameters" button
2. Input fields appear for each detected parameter
3. Enter comma-separated values (one per image)
4. Example: For 3 images with `[dress_color]` parameter:
   - Enter: `red, blue, green`

**Paste Data:**
- Paste CSV or JSON directly into text area
- CSV format:
  ```csv
  dress_color,accessory
  red,hat
  blue,scarf
  green,sunglasses
  ```
- JSON format:
  ```json
  [
    {"dress_color": "red", "accessory": "hat"},
    {"dress_color": "blue", "accessory": "scarf"}
  ]
  ```

**Upload File:**
- Upload `.csv` or `.json` file
- Must have column headers matching your parameter names
- See `example_batch.csv` and `example_batch.json` for format

**3. Configure Shared Parameters**
- Width, Height, Steps apply to all images (default: 1024×1024, 4 steps)
- Seed (optional) - Same seed for all images or leave empty for random per image
- File Prefix (default: "batch")
- NSFW mode toggle
- Output folder (optional)

**4. Per-Image Parameter Control (Advanced)**
- Check the checkbox beside any parameter (Width, Height, Steps, Seed, File Prefix, Output Folder, NSFW) to enable per-image control
- When checked, an additional input field appears
- Enter comma-separated values for manual entry (e.g., `512, 768, 1024`)
- Or reference CSV column names (e.g., `[width_col]`)
- **Examples:**
  - Different dimensions per image: Check Width, enter `512, 768, 1024`
  - Varying steps: Check Steps, enter `4, 8, 12`
  - Per-image seeds: Check Seed, enter `12345, 67890, 11111`
  - Custom prefixes: Check File Prefix, enter `cat, dog, bird`
  - Different folders: Check Output Folder, enter `folder1, folder2, folder3`
  - Mixed NSFW: Check NSFW, enter `false, true, false`
- When using CSV/JSON files, add columns with parameter names: `width`, `height`, `steps`, `seed`, `file_prefix`, `subfolder`, `nsfw`
- See `example_batch_parameterized.csv` for a complete example
- Unchecked parameters use the default value for all images

**5. Preview and Generate**
- Click "Preview Batch" to see all generated prompts before running
- Shows each prompt with parameters replaced
- Preview now displays per-image parameters (dimensions, steps, seed, etc.)
- Click "Generate Batch" to open confirmation dialog
- **Confirmation dialog allows you to:**
  - Review total image count
  - Modify file prefix before generation (if not parameterized per-image)
  - Change output folder before generation (if not parameterized per-image)
  - Values auto-filled from batch form
- All images process through the queue system

### View Images

- Navigate to the **Image Browser** tab to see your gallery
- Click any image to open detail view with metadata
- Use arrow buttons or keyboard (←/→/A/D) to navigate between images
- Click fullscreen button for immersive viewing
- Controls auto-hide after 2 seconds in fullscreen (move mouse/cursor to show, cursor visible)
- **Zoom Controls in Fullscreen:**
  - Zoom in/out with `+`/`-` keys or mouse wheel
  - Click zoom buttons in bottom center controls
  - Pinch-to-zoom on touch devices
  - Drag to pan when zoomed in (mouse or touch)
  - Press `0` to reset zoom to 100%
  - Zoom level displayed in controls (100%-500%)
- **Autoplay in Fullscreen:**
  - Click play button (bottom right) or press `Space` to start/stop
  - Set interval in seconds (0.5-60s, default: 3s)
  - Automatically advances to next image at set interval
  - Pauses when you manually navigate
  - Resumes from current position when re-enabled
- Click "Import" to load image parameters back into Single Generation form
  - Automatically switches to Single Generation tab
  - Loads all parameters including seed and NSFW state
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
- **Queued items** appear at top (newest first) with status badge
- **Active item** shows in middle while generating
- **Completed items** display at bottom with thumbnail images
- Cancel queued jobs with the ✕ button
- Clear entire queue with trash icon in queue header
- **Unload models** with cube icon to free RAM/VRAM/cache manually
- Click completed thumbnails to navigate to image in browser
- Queue processes oldest first (FIFO) but displays newest on top
- Real-time status updates every second
- **Persistent queue** - Survives server restarts
- **Shared across all users** - All browsers see same queue
- Keeps last 50 completed jobs with images
- **Auto-unload models** - Automatically unloads ComfyUI models 10 seconds after queue empties

## Parameters

- `positive_prompt`: Main prompt text
- `width`: Image width (64-2048, step 64)
- `height`: Image height (64-2048, step 64)  
- `steps`: Sampling steps (1-100, default 4)
- `seed`: Random seed (optional, auto-generated if empty)
- `nsfw`: Enable NSFW mode (boolean)
- `file_prefix`: Custom filename prefix (default: "comfyui")
- `subfolder`: Target subfolder path (optional)

## Project Structure

```
├── app.py                 # Flask backend with queue processor & AI endpoints
├── comfyui_client.py      # Python ComfyUI API wrapper
├── ai_assistant.py        # AI integration (Ollama + Gemini)
├── ai_instructions.py     # Preset instructions for AI operations
├── Imaginer.json          # ComfyUI workflow definition
├── .env.example           # Example environment file for API keys
├── AI_FEATURES.md         # Complete AI features documentation
├── templates/
│   └── index.html         # Single-page web interface with AI modals
├── static/
│   ├── style.css          # Dark theme styling with AI components
│   ├── script.js          # Frontend JavaScript (AI, modals, folder browser)
├── outputs/               # Generated images with subfolders (gitignored)
│   ├── subfolder1/       # User-created folders
│   │   └── *.png        # Images in subfolder
│   ├── *.png             # Root-level images
│   ├── metadata.json     # Generation metadata with folder tracking
│   └── queue_state.json  # Persistent queue state
└── requirements.txt       # Python dependencies (Flask only)
```

## API Endpoints

### Core Endpoints
- `GET /` - Main web interface with tabs
- `POST /api/queue` - Add single generation job to queue (adds to front)
- `POST /api/queue/batch` - Add multiple jobs from template and parameter data
- `GET /api/queue` - Get queue status (returns queued, active, completed)
- `DELETE /api/queue/<job_id>` - Cancel specific queued job
- `POST /api/queue/clear` - Clear all queued and completed items (preserves active)
- `GET /api/browse` - Browse folder contents (files and subfolders)
- `POST /api/folder` - Create new subfolder
- `POST /api/move` - Move files/folders (with conflict resolution)
- `POST /api/delete` - Delete files/empty folders
- `GET /api/images/<image_id>` - Get specific image metadata
- `GET /outputs/<path:filepath>` - Serve generated image from any subfolder

### AI Assistant Endpoints
- `GET /api/ai/models` - Get available AI models (Ollama and Gemini)
- `POST /api/ai/optimize` - Optimize a prompt using AI
- `POST /api/ai/suggest` - Apply user suggestion to edit prompt
- `POST /api/ai/generate-parameters` - Generate batch parameters with AI

### ComfyUI Memory Management Endpoints
- `POST /api/comfyui/unload` - Manually unload all models and clear memory
- `GET /api/comfyui/status` - Get memory status and auto-unload timer info

## Pinokio Integration

This project includes Pinokio integration files for easy package management:

- `install.json` - Installs Python environment and Flask
- `start.json` - Starts the web server
- `update.json` - Updates Flask to latest version
- `reset.json` - Removes virtual environment and outputs
- `open.json` - Opens web interface in browser

## Configuration

### Change ComfyUI Server Address

Edit both files:

```python
# app.py (line ~30)
comfyui_client = ComfyUIClient(server_address="127.0.0.1:8188")

# comfyui_client.py (line ~18)
def __init__(self, server_address: str = "127.0.0.1:8188"):
```

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

## Privacy

- `outputs/` directory is gitignored
- `robots.txt` blocks major AI crawlers (GPTBot, Claude-Web, etc.)
- All metadata stored locally in `outputs/metadata.json`

## License

This project is open source and available for use and modification.
