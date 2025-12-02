"""
Flask Web UI for ComfyUI Workflow
"""

from flask import Flask, render_template, request, jsonify, send_file
from comfyui_client import ComfyUIClient
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

# Initialize ComfyUI client
comfyui_client = ComfyUIClient(server_address="127.0.0.1:8188")


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
    except Exception as e:
        print(f"Error saving queue state: {e}")


def add_metadata_entry(image_path, prompt, width, height, steps, seed, nsfw, file_prefix, subfolder):
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
        "seed": seed,
        "nsfw": nsfw,
        "file_prefix": file_prefix
    }
    metadata.append(entry)
    save_metadata(metadata)
    return entry


def process_queue():
    """Background thread to process the generation queue"""
    global active_generation, generation_queue, completed_jobs
    
    while True:
        job = None
        
        with queue_lock:
            if generation_queue and not active_generation:
                job = generation_queue[-1]  # Take from end (oldest item)
                active_generation = job
                job['status'] = 'generating'
        
        if job:
            try:
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
                    cfg=1.0,
                    seed=seed,
                    nsfw=job['nsfw'],
                    output_path=str(output_path),
                    wait=True
                )
                
                # Add metadata with actual seed used
                metadata_entry = add_metadata_entry(
                    str(output_path),
                    job['prompt'],
                    job['width'],
                    job['height'],
                    job['steps'],
                    seed,
                    job['nsfw'],
                    file_prefix,
                    subfolder
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
            
            finally:
                with queue_lock:
                    if generation_queue and generation_queue[-1]['id'] == job['id']:
                        generation_queue.pop()  # Remove from end
                    
                    # Add to completed jobs history
                    completed_jobs.insert(0, job)
                    if len(completed_jobs) > MAX_COMPLETED_HISTORY:
                        completed_jobs.pop()
                    
                    active_generation = None
                
                # Save queue state after job completes
                save_queue_state()
        else:
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
    """Add a new generation job to the queue"""
    data = request.json
    
    job = {
        'id': str(uuid.uuid4()),
        'prompt': data.get('prompt', ''),
        'width': int(data.get('width', 1024)),
        'height': int(data.get('height', 1024)),
        'steps': int(data.get('steps', 4)),
        'seed': data.get('seed'),
        'nsfw': data.get('nsfw', False),
        'file_prefix': data.get('file_prefix', 'comfyui'),
        'subfolder': data.get('subfolder', ''),
        'status': 'queued',
        'added_at': datetime.now().isoformat()
    }
    
    with queue_lock:
        generation_queue.insert(0, job)  # Add to front of queue
    
    save_queue_state()
    return jsonify({'success': True, 'job_id': job['id']})


@app.route('/api/queue/batch', methods=['POST'])
def add_batch_to_queue():
    """Add multiple generation jobs from batch template"""
    data = request.json
    template = data.get('template', '')
    batch_data = data.get('batch_data', [])
    shared_params = data.get('shared_params', {})
    
    if not template or not batch_data:
        return jsonify({'error': 'Template and batch data required'}), 400
    
    jobs_queued = 0
    
    # Generate prompts and queue each job
    for params in batch_data:
        # Replace parameters in template
        prompt = template
        for key, value in params.items():
            prompt = prompt.replace(f'[{key}]', str(value))
        
        job = {
            'id': str(uuid.uuid4()),
            'prompt': prompt,
            'width': int(shared_params.get('width', 1024)),
            'height': int(shared_params.get('height', 1024)),
            'steps': int(shared_params.get('steps', 4)),
            'seed': shared_params.get('seed'),  # Use shared seed or None for random per image
            'nsfw': shared_params.get('nsfw', False),
            'file_prefix': shared_params.get('file_prefix', 'batch'),
            'subfolder': shared_params.get('subfolder', ''),
            'status': 'queued',
            'added_at': datetime.now().isoformat()
        }
        
        with queue_lock:
            generation_queue.insert(0, job)  # Add to front of queue
        
        jobs_queued += 1
    
    save_queue_state()
    return jsonify({'success': True, 'queued': jobs_queued})


@app.route('/api/queue', methods=['GET'])
def get_queue():
    """Get current queue status"""
    with queue_lock:
        queue_copy = generation_queue.copy()
        active = active_generation.copy() if active_generation else None
        completed_copy = completed_jobs.copy()
    
    return jsonify({
        'queue': queue_copy,
        'active': active,
        'completed': completed_copy
    })


@app.route('/api/queue/<job_id>', methods=['DELETE'])
def cancel_job(job_id):
    """Cancel a queued job"""
    with queue_lock:
        for i, job in enumerate(generation_queue):
            if job['id'] == job_id and job['status'] == 'queued':
                generation_queue.pop(i)
                save_queue_state()
                return jsonify({'success': True})
    
    return jsonify({'success': False, 'error': 'Job not found or already processing'}), 404


@app.route('/api/queue/clear', methods=['POST'])
def clear_queue():
    """Clear all queued and completed jobs (not the active one)"""
    with queue_lock:
        generation_queue.clear()
        completed_jobs.clear()
    
    save_queue_state()
    return jsonify({'success': True})


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


if __name__ == '__main__':
    print("=" * 60)
    print("ComfyUI Web UI Starting...")
    print("=" * 60)
    print(f"Server: http://0.0.0.0:4879")
    print(f"Output Directory: {OUTPUT_DIR.absolute()}")
    print(f"ComfyUI Server: http://127.0.0.1:8188")
    print("=" * 60)
    app.run(host='0.0.0.0', port=4879, debug=False, threaded=True)
