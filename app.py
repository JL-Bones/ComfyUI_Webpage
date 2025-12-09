"""
Flask Web UI for ComfyUI Workflow
"""

from flask import Flask, render_template, request, jsonify, send_file, send_from_directory, Response, stream_with_context
from comfyui_client import ComfyUIClient
from ai_assistant import AIAssistant
import os
import json
import time
import threading
from datetime import datetime
from pathlib import Path
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'comfyui-webui-secret-key'

# Configuration
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)
METADATA_FILE = OUTPUT_DIR / "metadata.json"
QUEUE_FILE = OUTPUT_DIR / "queue_state.json"

# Global queue and status
generation_queue = []
completed_jobs = []  # Keep last 50 completed jobs
MAX_COMPLETED_HISTORY = 50
queue_lock = threading.Lock()
active_generation = None
last_queue_empty_time = None  # Track when queue became empty
timer_stopped = False  # Flag to prevent timer restart after unload
UNLOAD_DELAY_SECONDS = 300  # Wait 300 seconds (5 minutes) after queue empty before unloading
previous_use_image_mode = None  # Track previous job's use_image state to detect mode changes

# Initialize ComfyUI client and AI assistant
comfyui_client = ComfyUIClient(server_address="127.0.0.1:8188")
ai_assistant = AIAssistant(ollama_url="http://127.0.0.1:11434")


def get_next_filename(prefix: str, subfolder: str = "", extension: str = "png") -> tuple:
    """Generate next available filename with incremental index"""
    target_dir = OUTPUT_DIR / subfolder if subfolder else OUTPUT_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    
    index = 0
    while True:
        filename = f"{prefix}{index:04d}.{extension}"
        filepath = target_dir / filename
        if not filepath.exists():
            relative_path = filepath.relative_to(OUTPUT_DIR)
            return str(relative_path), filepath
        index += 1


def load_metadata():
    """Load image metadata from file"""
    if METADATA_FILE.exists():
        with open(METADATA_FILE, 'r') as f:
            return json.load(f)
    return []


def save_metadata(metadata):
    """Save image metadata to file"""
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=2)


def get_unique_filename(target_path: Path) -> Path:
    """Get unique filename by appending (1), (2), etc. if file exists"""
    if not target_path.exists():
        return target_path
    
    stem = target_path.stem
    suffix = target_path.suffix
    parent = target_path.parent
    index = 1
    
    while True:
        new_name = f"{stem} ({index}){suffix}"
        new_path = parent / new_name
        if not new_path.exists():
            return new_path
        index += 1


def update_metadata_path(old_path: str, new_path: str):
    """Update metadata when a file is moved"""
    metadata = load_metadata()
    for entry in metadata:
        if entry.get('path') == old_path:
            entry['path'] = new_path
            entry['filename'] = os.path.basename(new_path)
            break
    save_metadata(metadata)


def delete_metadata_entry(file_path: str):
    """Remove metadata entry when file is deleted"""
    metadata = load_metadata()
    metadata = [entry for entry in metadata if entry.get('path') != file_path]
    save_metadata(metadata)


def load_queue_state():
    """Load queue state from file"""
    if QUEUE_FILE.exists():
        try:
            with open(QUEUE_FILE, 'r') as f:
                data = json.load(f)
                return data.get('queue', []), data.get('completed', []), data.get('active')
        except Exception as e:
            print(f"Error loading queue state: {e}")
    return [], [], None


def save_queue_state():
    """Save queue state to file"""
    try:
        with queue_lock:
            data = {
                'queue': generation_queue.copy(),
                'active': active_generation.copy() if active_generation else None,
                'completed': completed_jobs.copy()
            }
        with open(QUEUE_FILE, 'w') as f:
            json.dump(data, f, indent=2)
            f.flush()  # Ensure immediate write to disk
    except Exception as e:
        print(f"Error saving queue state: {e}")


def add_metadata_entry(image_path, prompt, width, height, steps, seed, file_prefix, subfolder, cfg=1.0, shift=3.0, use_image=False, use_image_size=False, image_filename=None, mcnl_lora=False, snofs_lora=False, male_lora=False):
    """Add a new metadata entry"""
    metadata = load_metadata()
    entry = {
        "id": str(uuid.uuid4()),
        "filename": os.path.basename(image_path),
        "path": str(image_path),
        "subfolder": subfolder,
        "timestamp": datetime.now().isoformat(),
        "prompt": prompt,
        "width": width,
        "height": height,
        "steps": steps,
        "cfg": cfg,
        "shift": shift,
        "seed": seed,
        "use_image": use_image,
        "use_image_size": use_image_size,
        "image_filename": image_filename,
        "file_prefix": file_prefix,
        "mcnl_lora": mcnl_lora,
        "snofs_lora": snofs_lora,
        "male_lora": male_lora
    }
    metadata.append(entry)
    save_metadata(metadata)
    return entry


def process_queue():
    """Background thread to process the generation queue"""
    global active_generation, generation_queue, completed_jobs, last_queue_empty_time, timer_stopped
    
    while True:
        job = None
        
        with queue_lock:
            if generation_queue and not active_generation:
                job = generation_queue[-1]  # Take from end (oldest item)
                active_generation = job
                job['status'] = 'generating'
                last_queue_empty_time = None  # Reset empty timer when processing
                timer_stopped = False  # Allow timer to start again when queue becomes empty
        
        if job:
            try:
                # Check if we're switching between text-to-image and image-to-image
                global previous_use_image_mode
                current_use_image = job.get('use_image', False)
                
                if previous_use_image_mode is not None and previous_use_image_mode != current_use_image:
                    mode_change = "image-to-image to text-to-image" if previous_use_image_mode else "text-to-image to image-to-image"
                    print(f"Mode change detected ({mode_change}). Unloading models...")
                    try:
                        comfyui_client.unload_models()
                        comfyui_client.clear_cache()
                        print("✓ Models unloaded and memory cleared before mode switch")
                    except Exception as e:
                        print(f"Warning: Error unloading models during mode switch: {e}")
                
                # Update previous mode for next comparison
                previous_use_image_mode = current_use_image
                
                # Generate image with auto-incrementing filename
                file_prefix = job.get('file_prefix', 'comfyui')
                subfolder = job.get('subfolder', '')
                relative_path, output_path = get_next_filename(file_prefix, subfolder)
                
                # Get the seed (generate if not provided)
                seed = job.get('seed')
                if seed is None:
                    import random
                    seed = random.randint(0, 2**32 - 1)
                
                comfyui_client.generate_image(
                    positive_prompt=job['prompt'],
                    width=job['width'],
                    height=job['height'],
                    steps=job['steps'],
                    cfg=job.get('cfg', 1.0),
                    seed=seed,
                    shift=job.get('shift', 3.0),
                    use_image=job.get('use_image', False),
                    use_image_size=job.get('use_image_size', False),
                    image_filename=job.get('image_filename'),
                    mcnl_lora=job.get('mcnl_lora', False),
                    snofs_lora=job.get('snofs_lora', False),
                    male_lora=job.get('male_lora', False),
                    output_path=str(output_path),
                    wait=True
                )
                
                # Add metadata with actual seed used - process sequentially before next job
                metadata_entry = add_metadata_entry(
                    str(output_path),
                    job['prompt'],
                    job['width'],
                    job['height'],
                    job['steps'],
                    seed,
                    file_prefix,
                    subfolder,
                    job.get('cfg', 1.0),
                    job.get('shift', 3.0),
                    job.get('use_image', False),
                    job.get('use_image_size', False),
                    job.get('image_filename'),
                    job.get('mcnl_lora', False),
                    job.get('snofs_lora', False),
                    job.get('male_lora', False)
                )
                
                job['status'] = 'completed'
                job['output_path'] = str(output_path)
                job['relative_path'] = str(relative_path)
                job['metadata_id'] = metadata_entry['id']
                job['completed_at'] = datetime.now().isoformat()
                job['refresh_folder'] = True
                
            except Exception as e:
                job['status'] = 'failed'
                job['error'] = str(e)
                job['failed_at'] = datetime.now().isoformat()
            
            # Always process completion inside a critical section to ensure sequential batch processing
            with queue_lock:
                if generation_queue and generation_queue[-1]['id'] == job['id']:
                    generation_queue.pop()  # Remove from end
                
                # Add to completed jobs history
                completed_jobs.insert(0, job)
                if len(completed_jobs) > MAX_COMPLETED_HISTORY:
                    completed_jobs.pop()
                
                active_generation = None
                # Don't reset timer here - let it continue if queue is empty
            
            # Save queue state after job completes
            save_queue_state()
        else:
            # Queue is empty - check if we should unload models
            with queue_lock:
                is_queue_empty = len(generation_queue) == 0 and active_generation is None
            
            if is_queue_empty:
                current_time = time.time()
                
                if last_queue_empty_time is None and not timer_stopped:
                    last_queue_empty_time = current_time
                    print(f"Queue empty. Will unload models in {UNLOAD_DELAY_SECONDS} seconds if queue stays empty.")
                elif last_queue_empty_time is not None and current_time - last_queue_empty_time >= UNLOAD_DELAY_SECONDS:
                    # Queue has been empty for the delay period - unload models
                    print("Queue empty for delay period. Unloading models and clearing memory...")
                    try:
                        comfyui_client.unload_models()
                        comfyui_client.clear_cache()
                        print("✓ Models unloaded, RAM/VRAM/cache cleared")
                    except Exception as e:
                        print(f"Error unloading models: {e}")
                    
                    # Stop the timer permanently until new job is queued
                    last_queue_empty_time = None
                    timer_stopped = True
            
            time.sleep(0.5)


# Load persisted queue state before starting queue processor
print("Loading queue state...")
loaded_queue, loaded_completed, loaded_active = load_queue_state()
generation_queue = loaded_queue
completed_jobs = loaded_completed
# Don't restore active generation on startup - it should start fresh
print(f"Loaded {len(generation_queue)} queued jobs and {len(completed_jobs)} completed jobs")

# Start queue processor thread
queue_thread = threading.Thread(target=process_queue, daemon=True)
queue_thread.start()


@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')


@app.route('/api/queue', methods=['POST'])
def add_to_queue():
    global timer_stopped
    """Add a new generation job to the queue"""
    data = request.json
    
    job = {
        'id': str(uuid.uuid4()),
        'prompt': data.get('prompt', ''),
        'width': int(data.get('width', 1024)),
        'height': int(data.get('height', 1024)),
        'steps': int(data.get('steps', 4)),
        'cfg': float(data.get('cfg', 1.0)),
        'shift': float(data.get('shift', 3.0)),
        'seed': data.get('seed'),
        'use_image': data.get('use_image', False),
        'use_image_size': data.get('use_image_size', False),
        'image_filename': data.get('image_filename'),
        'file_prefix': data.get('file_prefix', 'comfyui'),
        'subfolder': data.get('subfolder', ''),
        'mcnl_lora': data.get('mcnl_lora', False),
        'snofs_lora': data.get('snofs_lora', False),
        'male_lora': data.get('male_lora', False),
        'status': 'queued',
        'added_at': datetime.now().isoformat()
    }
    
    with queue_lock:
        generation_queue.insert(0, job)  # Add to front of queue
        timer_stopped = False  # Allow timer to start when this job completes
    
    save_queue_state()
    return jsonify({'success': True, 'job_id': job['id']})


@app.route('/api/queue/batch', methods=['POST'])
def add_batch_to_queue():
    global timer_stopped
    """Add multiple generation jobs to the queue"""
    data = request.json
    jobs_data = data.get('jobs', [])
    
    if not jobs_data:
        return jsonify({'success': False, 'error': 'No jobs provided'}), 400
    
    queued_ids = []
    
    with queue_lock:
        for job_data in jobs_data:
            job = {
                'id': str(uuid.uuid4()),
                'prompt': job_data.get('prompt', ''),
                'width': int(job_data.get('width', 1024)),
                'height': int(job_data.get('height', 1024)),
                'steps': int(job_data.get('steps', 4)),
                'cfg': float(job_data.get('cfg', 1.0)),
                'shift': float(job_data.get('shift', 3.0)),
                'seed': job_data.get('seed'),
                'use_image': job_data.get('use_image', False),
                'use_image_size': job_data.get('use_image_size', False),
                'image_filename': job_data.get('image_filename'),
                'file_prefix': job_data.get('file_prefix', 'batch'),
                'subfolder': job_data.get('subfolder', ''),
                'mcnl_lora': job_data.get('mcnl_lora', False),
                'snofs_lora': job_data.get('snofs_lora', False),
                'male_lora': job_data.get('male_lora', False),
                'status': 'queued',
                'added_at': datetime.now().isoformat()
            }
            generation_queue.insert(0, job)  # Add to front of queue
            queued_ids.append(job['id'])
        
        timer_stopped = False  # Allow timer to start when jobs complete
    
    save_queue_state()
    return jsonify({
        'success': True,
        'queued_count': len(queued_ids),
        'job_ids': queued_ids
    })


@app.route('/api/queue/image-batch', methods=['POST'])
def add_image_batch_to_queue():
    """Queue all images from a selected input folder using same prompt/settings.
    Uses image-to-image with use_image_size=True for each image file."""
    global timer_stopped
    data = request.json
    prompt = (data.get('prompt') or '').strip()
    folder = data.get('folder', '').strip()  # relative path under ComfyUI input
    steps = int(data.get('steps', 4))
    cfg = float(data.get('cfg', 1.0))
    shift = float(data.get('shift', 3.0))
    seed = data.get('seed')
    file_prefix = data.get('file_prefix', 'image_batch')
    subfolder = data.get('subfolder', '')
    mcnl_lora = bool(data.get('mcnl_lora', False))
    snofs_lora = bool(data.get('snofs_lora', False))
    male_lora = bool(data.get('male_lora', False))

    if not prompt:
        return jsonify({'success': False, 'error': 'Prompt required'}), 400

    try:
        # Resolve ComfyUI input directory
        comfyui_input_dir = Path('..') / 'comfy.git' / 'app' / 'input'
        if not comfyui_input_dir.exists():
            return jsonify({'success': False, 'error': 'ComfyUI input directory not found'}), 500

        # Navigate to selected subfolder (or root if empty)
        current_dir = comfyui_input_dir / folder if folder else comfyui_input_dir
        if not current_dir.exists() or not current_dir.is_dir():
            return jsonify({'success': False, 'error': 'Invalid input folder'}), 400

        # Collect image files directly in this folder
        allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
        image_files = [f for f in current_dir.iterdir() if f.is_file() and f.suffix.lower() in allowed_extensions]

        if not image_files:
            return jsonify({'success': False, 'error': 'No images found in selected folder'}), 400

        queued_ids = []
        # If subfolder not provided, mirror input folder path under outputs
        if not subfolder:
            # Use the folder path relative to input root; normalize to posix style
            subfolder = folder.replace('\\', '/').strip('/')

        with queue_lock:
            for file in image_files:
                # Build relative path from input root for image_filename
                rel_path = str(file.relative_to(comfyui_input_dir))
                job = {
                    'id': str(uuid.uuid4()),
                    'prompt': prompt,
                    # Width/height will be ignored when use_image_size=True
                    'width': 1024,
                    'height': 1024,
                    'steps': steps,
                    'cfg': cfg,
                    'shift': shift,
                    'seed': seed,
                    'use_image': True,
                    'use_image_size': True,
                    'image_filename': rel_path,
                    'file_prefix': file_prefix,
                    'subfolder': subfolder,
                    'mcnl_lora': mcnl_lora,
                    'snofs_lora': snofs_lora,
                    'male_lora': male_lora,
                    'status': 'queued',
                    'added_at': datetime.now().isoformat()
                }
                generation_queue.insert(0, job)
                queued_ids.append(job['id'])

            timer_stopped = False

        save_queue_state()
        return jsonify({'success': True, 'queued_count': len(queued_ids), 'job_ids': queued_ids})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/reveal', methods=['GET'])
def reveal_browser():
    """List input folders that have corresponding output folders with images, and show images within a selected folder."""
    try:
        comfyui_input_dir = Path('..') / 'comfy.git' / 'app' / 'input'
        if not comfyui_input_dir.exists():
            return jsonify({'success': False, 'error': 'ComfyUI input directory not found'}), 500

        path = (request.args.get('path') or '').strip()
        # Gather processed folders: any input subfolder (recursive) that has output images
        processed = []

        def has_image_files(directory: Path) -> bool:
            allowed = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
            try:
                for f in directory.iterdir():
                    if f.is_file() and f.suffix.lower() in allowed:
                        return True
            except Exception:
                pass
            return False

        # Walk input tree recursively
        for root, dirs, files in os.walk(str(comfyui_input_dir)):
            root_path = Path(root)
            if root_path == comfyui_input_dir:
                # Skip root itself; we list subfolders only
                pass
            else:
                rel = str(root_path.relative_to(comfyui_input_dir)).replace('\\', '/')
                out_dir = OUTPUT_DIR / rel
                if out_dir.exists() and has_image_files(out_dir):
                    processed.append({'name': root_path.name, 'path': rel})

        # If a specific folder requested, list input and output images
        input_images = []
        output_images = []
        pairs = []
        if path:
            in_dir = comfyui_input_dir / path
            out_dir = OUTPUT_DIR / path
            allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
            if in_dir.exists():
                for f in in_dir.iterdir():
                    if f.is_file() and f.suffix.lower() in allowed_extensions:
                        input_images.append({
                            'filename': f.name,
                            'path': str(f.relative_to(comfyui_input_dir)).replace('\\', '/'),
                            'mtime': f.stat().st_mtime
                        })
            if out_dir.exists():
                for f in out_dir.iterdir():
                    if f.is_file() and f.suffix.lower() in allowed_extensions:
                        output_images.append({
                            'relative_path': str(f.relative_to(OUTPUT_DIR)).replace('\\', '/'),
                            'filename': f.name,
                            'mtime': f.stat().st_mtime
                        })

            input_images.sort(key=lambda x: x['mtime'], reverse=True)
            output_images.sort(key=lambda x: x['mtime'], reverse=True)

            # Build input->output linkage via metadata (image_filename -> output path)
            try:
                metadata = load_metadata()
            except Exception:
                metadata = []

            # Map image_filename (relative to input root) to list of output rel paths under this subfolder
            filename_to_outputs = {}
            for entry in metadata:
                try:
                    # Only consider entries generated into this subfolder
                    if entry.get('subfolder', '') != path:
                        continue
                    rel_out = str(Path(entry.get('path', '')).relative_to(OUTPUT_DIR)).replace('\\', '/')
                    img_rel = (entry.get('image_filename') or '').replace('\\', '/')
                    if not img_rel:
                        continue
                    filename_to_outputs.setdefault(img_rel, []).append({
                        'relative_path': rel_out,
                        'filename': entry.get('filename', '')
                    })
                except Exception:
                    continue

            # Create ordered pairs based on input_images order
            for inp in input_images:
                outputs = filename_to_outputs.get(inp['path'], [])
                # Pick the most recent output if multiple
                out_item = outputs[0] if outputs else None
                pairs.append({
                    'input': {
                        'path': inp['path'],
                        'filename': inp['filename']
                    },
                    'output': out_item  # may be None
                })

        processed.sort(key=lambda x: x['name'])

        return jsonify({
            'success': True,
            'folders': processed,
            'current_path': path,
            'input_images': input_images,
            'output_images': output_images,
            'pairs': pairs
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/queue', methods=['GET'])
def get_queue():
    """Get current queue status"""
    with queue_lock:
        queue_copy = [job.copy() for job in generation_queue]
        active = active_generation.copy() if active_generation else None
        completed_copy = [job.copy() for job in completed_jobs]
    
    return jsonify({
        'queue': queue_copy,
        'active': active,
        'completed': completed_copy
    })


@app.route('/api/queue/<job_id>', methods=['DELETE'])
def cancel_job(job_id):
    """Cancel a queued job or remove a completed job"""
    removed = False
    removed_type = None
    
    with queue_lock:
        # Check if it's the active job (don't allow removal)
        if active_generation and active_generation.get('id') == job_id:
            return jsonify({'success': False, 'error': 'Cannot remove active job'}), 400
        
        # Try to remove from queued jobs
        for i in range(len(generation_queue)):
            if generation_queue[i]['id'] == job_id:
                if generation_queue[i].get('status') == 'queued':
                    generation_queue.pop(i)
                    removed = True
                    removed_type = 'queued'
                    print(f"Removed queued job: {job_id}")
                    break
        
        # If not found in queue, try completed jobs
        if not removed:
            for i in range(len(completed_jobs)):
                if completed_jobs[i]['id'] == job_id:
                    completed_jobs.pop(i)
                    removed = True
                    removed_type = 'completed'
                    print(f"Removed completed job: {job_id}")
                    break
    
    if removed:
        save_queue_state()
        return jsonify({'success': True, 'message': f'{removed_type} job removed'})
    
    return jsonify({'success': False, 'error': 'Job not found'}), 404


@app.route('/api/queue/clear', methods=['POST'])
def clear_queue():
    """Clear only queued jobs (preserve completed history)"""
    cleared_queued = 0
    
    with queue_lock:
        cleared_queued = len(generation_queue)
        generation_queue.clear()
        # Keep completed_jobs intact to preserve history
    
    save_queue_state()
    print(f"Cleared {cleared_queued} queued jobs (preserved completed history)")
    return jsonify({
        'success': True,
        'cleared_queued': cleared_queued
    })


@app.route('/api/browse')
def browse_folder():
    """Browse files and folders in a directory"""
    subfolder = request.args.get('path', '')
    current_dir = OUTPUT_DIR / subfolder if subfolder else OUTPUT_DIR
    
    if not current_dir.exists() or not current_dir.is_dir():
        return jsonify({'error': 'Invalid directory'}), 404
    
    # Get folders
    folders = []
    for item in current_dir.iterdir():
        if item.is_dir():
            rel_path = str(item.relative_to(OUTPUT_DIR))
            folders.append({
                'name': item.name,
                'path': rel_path,
                'type': 'folder'
            })
    
    # Get files with metadata
    metadata = load_metadata()
    files = []
    for entry in metadata:
        entry_path = Path(entry['path'])
        if entry_path.parent == current_dir:
            entry['type'] = 'file'
            entry['relative_path'] = str(entry_path.relative_to(OUTPUT_DIR))
            files.append(entry)
    
    # Sort: folders first, then files by timestamp (newest first)
    folders.sort(key=lambda x: x['name'])
    files.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    
    return jsonify({
        'current_path': subfolder,
        'folders': folders,
        'files': files
    })


@app.route('/api/folder', methods=['POST'])
def create_folder():
    """Create a new folder"""
    data = request.json
    folder_name = data.get('name', '').strip()
    parent_path = data.get('parent', '')
    
    if not folder_name:
        return jsonify({'error': 'Folder name required'}), 400
    
    # Sanitize folder name
    folder_name = "".join(c for c in folder_name if c.isalnum() or c in (' ', '-', '_'))
    
    target_dir = OUTPUT_DIR / parent_path / folder_name if parent_path else OUTPUT_DIR / folder_name
    
    if target_dir.exists():
        return jsonify({'error': 'Folder already exists'}), 400
    
    try:
        target_dir.mkdir(parents=True, exist_ok=False)
        return jsonify({'success': True, 'path': str(target_dir.relative_to(OUTPUT_DIR))})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/upload', methods=['POST'])
def upload_image():
    """Upload an image for use in image-to-image generation"""
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image file provided'}), 400
    
    file = request.files['image']
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400
    
    # Check file extension
    allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        return jsonify({'success': False, 'error': 'Invalid file type. Allowed: ' + ', '.join(allowed_extensions)}), 400
    
    try:
        # Save to ComfyUI input directory (C:\pinokio\api\comfy.git\app\input)
        comfyui_input_dir = Path('..') / 'comfy.git' / 'app' / 'input'
        
        # Verify directory exists
        if not comfyui_input_dir.exists():
            return jsonify({
                'success': False, 
                'error': f'ComfyUI input directory not found at {comfyui_input_dir.absolute()}'
            }), 500
        
        # Generate unique filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"upload_{timestamp}{file_ext}"
        filepath = comfyui_input_dir / filename
        
        # Save file
        file.save(str(filepath))
        
        return jsonify({
            'success': True,
            'filename': filename,
            'message': 'Image uploaded successfully'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/browse_images', methods=['GET'])
def browse_images():
    """Browse images from input or output folders with subfolder support"""
    folder = request.args.get('folder', 'input')  # 'input' or 'output'
    subpath = request.args.get('path', '')  # Subfolder path
    
    try:
        if folder == 'input':
            # List images and folders from ComfyUI input directory
            comfyui_input_dir = Path('..') / 'comfy.git' / 'app' / 'input'
            
            if not comfyui_input_dir.exists():
                return jsonify({'success': False, 'error': 'Input directory not found'}), 404
            
            # Navigate to subfolder if specified
            current_dir = comfyui_input_dir / subpath if subpath else comfyui_input_dir
            
            if not current_dir.exists() or not current_dir.is_dir():
                return jsonify({'success': False, 'error': 'Invalid directory'}), 404
            
            # Get folders
            folders = []
            for item in current_dir.iterdir():
                if item.is_dir():
                    rel_path = str(item.relative_to(comfyui_input_dir))
                    folders.append({
                        'name': item.name,
                        'path': rel_path,
                        'type': 'folder'
                    })
            
            # Get all image files
            allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
            images = []
            
            for file in current_dir.iterdir():
                if file.is_file() and file.suffix.lower() in allowed_extensions:
                    # Store relative path from input root
                    rel_path = str(file.relative_to(comfyui_input_dir))
                    images.append({
                        'filename': file.name,
                        'path': rel_path,
                        'mtime': file.stat().st_mtime
                    })
            
            # Sort folders by name, images by modification time (newest first)
            folders.sort(key=lambda x: x['name'])
            images.sort(key=lambda x: x['mtime'], reverse=True)
            
            return jsonify({
                'success': True, 
                'images': images, 
                'folders': folders,
                'current_path': subpath,
                'folder': 'input'
            })
        else:
            # For output folder, use existing browse endpoint functionality
            return jsonify({'success': False, 'error': 'Use /api/browse for output folder'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/image/input/<path:filepath>')
def serve_input_image(filepath):
    """Serve images from ComfyUI input directory (supports subfolders)"""
    try:
        comfyui_input_dir = Path('..') / 'comfy.git' / 'app' / 'input'
        # Resolve to absolute path
        absolute_dir = comfyui_input_dir.resolve()
        file_path = absolute_dir / filepath
        
        # Security check: ensure the file is within the input directory
        try:
            file_path.resolve().relative_to(absolute_dir)
        except ValueError:
            print(f"Security error: attempted to access file outside input directory: {filepath}")
            return jsonify({'error': 'Invalid file path'}), 403
        
        # Debug logging
        print(f"Serving input image: {filepath}")
        print(f"From directory: {absolute_dir}")
        print(f"File exists: {file_path.exists()}")
        
        if not file_path.exists():
            print(f"File not found: {file_path}")
            return jsonify({'error': 'File not found'}), 404
        
        # Get the directory and filename separately for send_from_directory
        file_dir = file_path.parent
        file_name = file_path.name
        
        return send_from_directory(str(file_dir), file_name)
    except Exception as e:
        print(f"Error serving input image {filepath}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 404


@app.route('/api/copy_to_input', methods=['POST'])
def copy_to_input():
    """Copy an image from output folder to input folder"""
    data = request.json
    filename = data.get('filename', '')
    
    if not filename:
        return jsonify({'success': False, 'error': 'Filename required'}), 400
    
    try:
        # Source: output directory (can include subfolder path)
        source = OUTPUT_DIR / filename
        
        if not source.exists():
            print(f"Source file not found: {source}")
            return jsonify({'success': False, 'error': f'Source file not found: {filename}'}), 404
        
        # Destination: ComfyUI input directory (root level)
        comfyui_input_dir = Path('..') / 'comfy.git' / 'app' / 'input'
        
        if not comfyui_input_dir.exists():
            return jsonify({'success': False, 'error': 'Input directory not found'}), 500
        
        # Generate unique filename if file already exists (copy to root of input folder)
        dest_filename = source.name
        dest_path = comfyui_input_dir / dest_filename
        
        counter = 1
        while dest_path.exists():
            stem = source.stem
            suffix = source.suffix
            dest_filename = f"{stem}_{counter}{suffix}"
            dest_path = comfyui_input_dir / dest_filename
            counter += 1
        
        # Copy file
        import shutil
        shutil.copy2(source, dest_path)
        
        print(f"Copied {source} to {dest_path}")
        
        return jsonify({
            'success': True,
            'filename': dest_filename,
            'message': 'Image copied to input folder'
        })
    except Exception as e:
        print(f"Error copying to input: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/move', methods=['POST'])
def move_items():
    """Move files and folders to a target directory"""
    data = request.json
    items = data.get('items', [])  # List of paths
    target = data.get('target', '')  # Target folder path
    
    target_dir = OUTPUT_DIR / target if target else OUTPUT_DIR
    
    if not target_dir.exists():
        return jsonify({'error': 'Target directory does not exist'}), 400
    
    moved = []
    errors = []
    
    for item_path in items:
        try:
            source = OUTPUT_DIR / item_path
            if not source.exists():
                errors.append(f"{item_path}: Not found")
                continue
            
            # Determine target path with conflict resolution
            target_path = target_dir / source.name
            target_path = get_unique_filename(target_path)
            
            # Move the file/folder
            import shutil
            shutil.move(str(source), str(target_path))
            
            # Update metadata if it's a file
            if source.is_file():
                old_path = str(source)
                new_path = str(target_path)
                update_metadata_path(old_path, new_path)
            
            moved.append({
                'from': item_path,
                'to': str(target_path.relative_to(OUTPUT_DIR))
            })
            
        except Exception as e:
            errors.append(f"{item_path}: {str(e)}")
    
    return jsonify({
        'success': len(errors) == 0,
        'moved': moved,
        'errors': errors
    })


@app.route('/api/delete', methods=['POST'])
def delete_items():
    """Delete files and empty folders"""
    data = request.json
    items = data.get('items', [])
    
    deleted = []
    errors = []
    
    for item_path in items:
        try:
            target = OUTPUT_DIR / item_path
            if not target.exists():
                errors.append(f"{item_path}: Not found")
                continue
            
            if target.is_file():
                target.unlink()
                delete_metadata_entry(str(target))
                deleted.append(item_path)
            elif target.is_dir():
                # Only delete if empty
                if not any(target.iterdir()):
                    target.rmdir()
                    deleted.append(item_path)
                else:
                    errors.append(f"{item_path}: Folder not empty")
            
        except Exception as e:
            errors.append(f"{item_path}: {str(e)}")
    
    return jsonify({
        'success': len(errors) == 0,
        'deleted': deleted,
        'errors': errors
    })


@app.route('/api/images/<image_id>')
def get_image_metadata(image_id):
    """Get metadata for a specific image"""
    metadata = load_metadata()
    for entry in metadata:
        if entry['id'] == image_id:
            return jsonify(entry)
    return jsonify({'error': 'Image not found'}), 404


@app.route('/outputs/<path:filepath>')
def serve_image(filepath):
    """Serve generated images from any subfolder"""
    file_path = OUTPUT_DIR / filepath
    if file_path.exists() and file_path.is_file():
        return send_file(file_path)
    return "Image not found", 404


# AI Assistant Endpoints

@app.route('/api/ai/models', methods=['GET'])
def get_ai_models():
    """Get available AI models from Ollama and Gemini"""
    try:
        models = ai_assistant.get_available_models()
        return jsonify({
            'success': True,
            'models': models
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/ai/stop', methods=['POST'])
def stop_ai_generation():
    """Stop AI generation and unload Ollama model"""
    try:
        data = request.json
        model = data.get('model')
        provider = data.get('provider', 'ollama')
        
        if provider == 'ollama' and model:
            ai_assistant._unload_ollama_model(model)
            return jsonify({
                'success': True,
                'message': f'Model {model} unloaded'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Only Ollama models can be stopped'
            }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/ai/optimize', methods=['POST'])
def optimize_prompt():
    """Optimize a prompt using AI"""
    data = request.json
    prompt = data.get('prompt', '').strip()
    model = data.get('model', 'llama2')
    provider = data.get('provider', 'ollama')
    use_instructions = data.get('use_instructions', True)
    stream = data.get('stream', False)
    is_batch = data.get('is_batch', False)
    
    if not prompt:
        return jsonify({'success': False, 'error': 'Prompt required'}), 400
    
    # Only Ollama supports streaming
    if stream and provider == 'ollama':
        from ai_instructions import OPTIMIZE_PROMPT_INSTRUCTION, OPTIMIZE_BATCH_PROMPT_INSTRUCTION
        if use_instructions:
            if is_batch:
                instruction = OPTIMIZE_BATCH_PROMPT_INSTRUCTION.format(prompt=prompt)
            else:
                instruction = OPTIMIZE_PROMPT_INSTRUCTION.format(prompt=prompt)
        else:
            instruction = prompt
        
        def generate():
            generator = ai_assistant._call_ollama(instruction, model, stream=True)
            for chunk in generator:
                yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield "data: {\"done\": true}\n\n"
        
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    else:
        result = ai_assistant.optimize_prompt(prompt, model, provider, use_instructions=use_instructions, is_batch=is_batch)
        return jsonify(result)


@app.route('/api/ai/suggest', methods=['POST'])
def suggest_prompt_edit():
    """Apply a user suggestion to edit a prompt"""
    data = request.json
    prompt = data.get('prompt', '').strip()
    suggestion = data.get('suggestion', '').strip()
    model = data.get('model', 'llama2')
    provider = data.get('provider', 'ollama')
    stream = data.get('stream', False)
    
    if not prompt or not suggestion:
        return jsonify({'success': False, 'error': 'Prompt and suggestion required'}), 400
    
    # Only Ollama supports streaming
    if stream and provider == 'ollama':
        from ai_instructions import EDIT_PROMPT_INSTRUCTION
        instruction = EDIT_PROMPT_INSTRUCTION.format(prompt=prompt, suggestion=suggestion)
        
        def generate():
            generator = ai_assistant._call_ollama(instruction, model, stream=True)
            for chunk in generator:
                yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield "data: {\"done\": true}\n\n"
        
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    else:
        result = ai_assistant.suggest_prompt_edit(prompt, suggestion, model, provider)
        return jsonify(result)
    
    result = ai_assistant.suggest_prompt_edit(prompt, suggestion, model, provider)
    return jsonify(result)


@app.route('/api/ai/optimize-instructions', methods=['GET'])
def get_optimize_instructions():
    """Get the optimize prompt instructions template"""
    from ai_instructions import OPTIMIZE_PROMPT_INSTRUCTION
    # Return the instructions without the {prompt} placeholder
    instructions = OPTIMIZE_PROMPT_INSTRUCTION.replace('{prompt}', '[YOUR PROMPT WILL BE INSERTED HERE]')
    return jsonify({'success': True, 'instructions': instructions})


@app.route('/api/ai/generate-csv', methods=['POST'])
def generate_csv_with_ai():
    """Generate CSV parameter data using AI"""
    data = request.json
    base_prompt = data.get('base_prompt')
    parameters = data.get('parameters', [])
    count = int(data.get('count', 5))
    model = data.get('model', 'llama2')
    provider = data.get('provider', 'ollama')
    custom_context = (data.get('custom_context') or '').strip()
    use_instructions = data.get('use_instructions', True)
    stream = data.get('stream', False)
    
    if not parameters:
        return jsonify({'success': False, 'error': 'Parameters required'}), 400
    
    if count < 1 or count > 50:
        return jsonify({'success': False, 'error': 'Count must be between 1 and 50'}), 400
    
    variable_parameters = data.get('variable_parameters', [])
    
    # Only Ollama supports streaming
    if stream and provider == 'ollama':
        from ai_instructions import GENERATE_PARAMETERS_INSTRUCTION
        
        # Build context
        context_parts = []
        if base_prompt:
            context_parts.append(f"Base Prompt Template: {base_prompt}")
        
        if variable_parameters:
            param_hints = []
            if 'width' in variable_parameters or 'height' in variable_parameters:
                param_hints.append("- width/height: Use values like 512, 768, 1024, 1536, 2048 (multiples of 64)")
            if 'steps' in variable_parameters:
                param_hints.append("- steps: Use values between 4-20 (4 for fast, 8-12 balanced, 16-20 detailed)")
            if 'seed' in variable_parameters:
                param_hints.append("- seed: Use random integers or leave empty for random generation")
            if 'file_prefix' in variable_parameters:
                param_hints.append("- file_prefix: Use descriptive names matching content")
            if 'subfolder' in variable_parameters:
                param_hints.append("- subfolder: Use logical folder names for organization")
            if any(lora in variable_parameters for lora in ['mcnl_lora', 'snofs_lora']):
                param_hints.append("- LoRA parameters: Use true/false, yes/no, or 1/0")
            
            if param_hints:
                context_parts.append("\\nVariable Parameter Guidelines:\\n" + "\\n".join(param_hints))
        
        if custom_context:
            context_parts.append(f"\\nCustom Requirements: {custom_context}")
        
        context_info = "\n".join(context_parts) if context_parts else "Generate creative and diverse parameter values."
        
        if use_instructions:
            headers = ",".join(parameters)
            instruction = GENERATE_PARAMETERS_INSTRUCTION.format(
                context_info=context_info,
                count=count,
                headers=headers
            )
        else:
            headers = ",".join(parameters)
            instruction = f"{context_info}\n\nGenerate {count} diverse CSV rows with these parameters: {headers}\n\nFirst row must be the headers, then {count} data rows."
        
        def generate():
            generator = ai_assistant._call_ollama(instruction, model, stream=True)
            for chunk in generator:
                yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield 'data: {"done": true}\n\n'
        
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    else:
        result = ai_assistant.generate_csv_parameters(
            base_prompt=base_prompt,
            parameters=parameters,
            count=count,
            model=model,
            provider=provider,
            custom_context=custom_context,
            use_instructions=use_instructions,
            variable_parameters=variable_parameters
        )
        return jsonify(result)


@app.route('/api/ai/generate-parameter-values', methods=['POST'])
def generate_parameter_values():
    """Generate values for a single parameter using AI"""
    try:
        data = request.json
        parameter = data.get('parameter')
        count = data.get('count', 5)
        model = data.get('model')
        provider = data.get('provider', 'ollama')
        instructions = data.get('instructions', '')
        stream = data.get('stream', False)
        
        if not parameter:
            return jsonify({'success': False, 'error': 'Parameter name is required'}), 400
        
        if not model:
            return jsonify({'success': False, 'error': 'Model is required'}), 400
        
        # Only Ollama supports streaming
        if stream and provider == 'ollama':
            # Build context for this parameter
            context_parts = [f"Generate {count} diverse and creative values for the parameter '{parameter}'."]
            
            # Add parameter-specific hints
            if parameter == 'width' or parameter == 'height':
                context_parts.append("Use image dimensions like 512, 768, 1024, 1536, 2048 (multiples of 64). Consider various aspect ratios.")
            elif parameter == 'steps':
                context_parts.append("Use values between 4-20 (4 for fast generation, 8-12 balanced, 16-20 detailed).")
            elif parameter == 'seed':
                context_parts.append("Use random integers or -1 for random generation.")
            elif parameter == 'file_prefix':
                context_parts.append("Use descriptive file name prefixes that match the content (e.g., 'portrait', 'landscape', 'character', 'scene').")
            elif parameter == 'subfolder':
                context_parts.append("Use logical folder names for organization (e.g., 'portraits', 'landscapes', 'variations', 'tests').")
            elif 'lora' in parameter.lower():
                context_parts.append("Use boolean values: true, false, yes, no, 1, or 0.")
            
            if instructions:
                context_parts.append(f"\nAdditional requirements: {instructions}")
            
            context_parts.append(f"\nOutput exactly {count} values, one per line. No numbering, no explanations, just the values.")
            
            instruction = "\n".join(context_parts)
            
            def generate():
                generator = ai_assistant._call_ollama(instruction, model, stream=True)
                for chunk in generator:
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
                yield 'data: {"done": true}\n\n'
            
            return Response(stream_with_context(generate()), mimetype='text/event-stream')
        else:
            result = ai_assistant.generate_parameter_values(
                parameter=parameter,
                count=count,
                model=model,
                provider=provider,
                instructions=instructions
            )
            
            return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ComfyUI Memory Management Endpoints

@app.route('/api/comfyui/unload', methods=['POST'])
def unload_comfyui_models():
    """Manually unload all ComfyUI models and clear memory"""
    global last_queue_empty_time, timer_stopped
    try:
        comfyui_client.unload_models()
        comfyui_client.clear_cache()
        # Stop timer permanently until new job is queued
        with queue_lock:
            last_queue_empty_time = None
            timer_stopped = True
        return jsonify({
            'success': True,
            'message': 'Models unloaded and memory cleared'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/comfyui/status', methods=['GET'])
def get_comfyui_status():
    """Get ComfyUI memory status"""
    global last_queue_empty_time, UNLOAD_DELAY_SECONDS
    
    with queue_lock:
        is_queue_empty = len(generation_queue) == 0 and active_generation is None
        empty_time = last_queue_empty_time
    
    status = {
        'queue_empty': is_queue_empty,
        'auto_unload_enabled': True,
        'unload_delay_seconds': UNLOAD_DELAY_SECONDS,
        'timer_active': False,
        'unload_in_seconds': 0
    }
    
    if is_queue_empty and empty_time is not None:
        current_time = time.time()
        elapsed = current_time - empty_time
        if elapsed < UNLOAD_DELAY_SECONDS:
            status['timer_active'] = True
            status['unload_in_seconds'] = max(0, int(UNLOAD_DELAY_SECONDS - elapsed))
        elif elapsed < UNLOAD_DELAY_SECONDS + 10:  # Show "unloaded" for 10 seconds
            status['models_unloaded'] = True
    
    return jsonify(status)


@app.route('/api/hardware/stats', methods=['GET'])
def get_hardware_stats():
    """Get current hardware usage statistics"""
    try:
        import psutil
        
        # CPU Usage
        cpu_percent = psutil.cpu_percent(interval=0.1)
        
        # RAM Usage
        ram = psutil.virtual_memory()
        ram_used_gb = ram.used / (1024**3)
        ram_total_gb = ram.total / (1024**3)
        ram_percent = ram.percent
        
        # GPU/VRAM Usage (try to get from nvidia-smi or fallback)
        gpu_percent = 0
        vram_used_gb = 0
        vram_total_gb = 0
        vram_percent = 0
        
        try:
            import subprocess
            # Try nvidia-smi for NVIDIA GPUs
            result = subprocess.run(
                ['nvidia-smi', '--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                values = result.stdout.strip().split(',')
                if len(values) >= 3:
                    gpu_percent = float(values[0].strip())
                    vram_used_gb = float(values[1].strip()) / 1024
                    vram_total_gb = float(values[2].strip()) / 1024
                    vram_percent = (vram_used_gb / vram_total_gb * 100) if vram_total_gb > 0 else 0
        except Exception as e:
            print(f"GPU stats unavailable: {e}")
        
        return jsonify({
            'success': True,
            'cpu': {
                'percent': round(cpu_percent, 1),
                'label': f'{round(cpu_percent, 1)}%'
            },
            'ram': {
                'percent': round(ram_percent, 1),
                'used_gb': round(ram_used_gb, 2),
                'total_gb': round(ram_total_gb, 2),
                'label': f'{round(ram_used_gb, 1)} / {round(ram_total_gb, 1)} GB'
            },
            'gpu': {
                'percent': round(gpu_percent, 1),
                'label': f'{round(gpu_percent, 1)}%'
            },
            'vram': {
                'percent': round(vram_percent, 1),
                'used_gb': round(vram_used_gb, 2),
                'total_gb': round(vram_total_gb, 2),
                'label': f'{round(vram_used_gb, 1)} / {round(vram_total_gb, 1)} GB'
            }
        })
    except ImportError:
        return jsonify({
            'success': False,
            'error': 'psutil not installed'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def ensure_dummy_image():
    """Create a dummy image if permanent\violet.webp doesn't exist"""
    comfyui_input_dir = Path('..') / 'comfy.git' / 'app' / 'input'
    permanent_dir = comfyui_input_dir / 'permanent'
    dummy_image_path = permanent_dir / 'violet.webp'
    
    if not dummy_image_path.exists():
        print(f"Creating dummy image: {dummy_image_path}")
        permanent_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Create a simple 512x512 purple/violet image using PIL
            from PIL import Image
            img = Image.new('RGB', (512, 512), color=(138, 43, 226))  # Violet color
            img.save(str(dummy_image_path), 'WEBP')
            print(f"✓ Dummy image created successfully")
        except ImportError:
            print("Warning: PIL not available, creating placeholder file")
            # If PIL is not available, create a minimal valid WebP file
            # This is a 1x1 violet pixel WebP file (minimal valid WebP)
            webp_data = bytes([
                0x52, 0x49, 0x46, 0x46, 0x3A, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
                0x56, 0x50, 0x38, 0x4C, 0x2E, 0x00, 0x00, 0x00, 0x2F, 0x00, 0x00, 0x00,
                0x00, 0x47, 0x00, 0x9D, 0x01, 0x2A, 0x01, 0x00, 0x01, 0x00, 0x11, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00
            ])
            with open(dummy_image_path, 'wb') as f:
                f.write(webp_data)
            print(f"✓ Placeholder image created")
    else:
        print(f"✓ Dummy image already exists: {dummy_image_path}")


if __name__ == '__main__':
    print("=" * 60)
    print("ComfyUI Web UI Starting...")
    print("=" * 60)
    print(f"Server: http://0.0.0.0:4879")
    print(f"Output Directory: {OUTPUT_DIR.absolute()}")
    print(f"ComfyUI Server: http://127.0.0.1:8188")
    print("=" * 60)
    
    # Ensure dummy image exists
    ensure_dummy_image()
    
    print("=" * 60)
    app.run(host='0.0.0.0', port=4879, debug=False, threaded=True)
