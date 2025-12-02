# ComfyUI Web Interface

A modern Flask-based web UI for ComfyUI with queue management, slideshow, and metadata logging.

## Features

- **Dark Modern Theme**: Beautiful, responsive UI with dark color scheme
- **Collapsible Queue Sidebar**: Real-time queue status and management
- **Image Generation**: Queue multiple prompts with custom parameters
- **Parameter Controls**: Adjust width, height, steps, CFG scale, and seed
- **Metadata Logging**: Store all generation parameters with images
- **Image Gallery**: View all generated images with metadata
- **Slideshow Mode**: Browse images with auto-play functionality
- **Real-time Updates**: Queue and gallery auto-refresh

## Setup

### Prerequisites

1. ComfyUI must be running on `http://127.0.0.1:8188`
2. Python 3.7+ installed
3. Flask installed: `pip install flask`

### Installation

1. Ensure all files are in place:
   ```
   ComfyUI_Webpage/
   ├── app.py
   ├── comfyui_client.py
   ├── Imaginer.json
   ├── templates/
   │   └── index.html
   └── static/
       ├── style.css
       └── script.js
   ```

2. Install Flask if not already installed:
   ```powershell
   pip install flask
   ```

### Running the Web UI

1. Start ComfyUI server (if not already running)
2. Run the Flask app:
   ```powershell
   python app.py
   ```

3. Open your browser to `http://localhost:4879`

The server will be accessible at:
- Local: `http://localhost:4879`
- Network: `http://0.0.0.0:4879`

## Usage

### Generating Images

1. Enter your prompt in the text area
2. (Optional) Add a negative prompt
3. Adjust parameters:
   - **Width/Height**: Image dimensions (64-2048px)
   - **Steps**: Number of sampling steps
   - **CFG Scale**: Classifier-free guidance scale
   - **Seed**: Random seed (leave empty for random)
4. Click "Generate" to add to queue

### Queue Management

- View active and queued jobs in the left sidebar
- Cancel queued jobs by clicking the × button
- Toggle sidebar visibility with the arrow button
- Queue updates automatically every second

### Viewing Images

- **Gallery**: All generated images appear in the gallery
- **Click Image**: View full details and metadata
- **Slideshow**: Click "Slideshow" button to browse images
  - Use arrow buttons or keyboard arrows to navigate
  - Press spacebar to play/pause auto-advance
  - Press Escape to exit slideshow

### Image Metadata

Each generated image stores:
- Prompt and negative prompt
- Dimensions (width × height)
- Steps and CFG scale
- Seed value
- Generation timestamp
- Filename

## File Structure

- `app.py`: Flask server with API endpoints
- `comfyui_client.py`: ComfyUI API client library
- `Imaginer.json`: ComfyUI workflow definition
- `templates/index.html`: Main HTML template
- `static/style.css`: Dark theme styling
- `static/script.js`: Frontend JavaScript
- `outputs/`: Generated images directory (auto-created)
- `outputs/metadata.json`: Image metadata log (auto-created)

## API Endpoints

- `GET /`: Main web interface
- `POST /api/queue`: Add job to queue
- `GET /api/queue`: Get queue status
- `DELETE /api/queue/<job_id>`: Cancel job
- `GET /api/images`: Get all images with metadata
- `GET /api/images/<image_id>`: Get specific image metadata
- `GET /outputs/<filename>`: Serve generated images

## Keyboard Shortcuts

In slideshow mode:
- `←` Previous image
- `→` Next image
- `Space` Play/pause
- `Esc` Exit slideshow

## Troubleshooting

### Connection Errors
- Ensure ComfyUI is running on `http://127.0.0.1:8188`
- Check that the workflow file `Imaginer.json` exists

### Images Not Generating
- Verify ComfyUI has all required models installed
- Check the queue sidebar for error messages
- Look at the terminal output for error details

### Port Already in Use
- Change the port in `app.py` (line 236): `app.run(host='0.0.0.0', port=4879)`

## Configuration

Edit `app.py` to change:
- Server address: `app.run(host='0.0.0.0', port=4879)`
- ComfyUI address: `ComfyUIClient(server_address="127.0.0.1:8188")`
- Output directory: `OUTPUT_DIR = Path("outputs")`

## Credits

Built for ComfyUI workflow automation with a modern web interface.
