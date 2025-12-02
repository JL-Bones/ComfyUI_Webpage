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

# Global queue and status
generation_queue = []
queue_lock = threading.Lock()
active_generation = None

# Initialize ComfyUI client
comfyui_client = ComfyUIClient(server_address="127.0.0.1:8188")


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


def add_metadata_entry(image_path, prompt, negative_prompt, width, height, steps, seed):
    """Add a new metadata entry"""
    metadata = load_metadata()
    entry = {
        "id": str(uuid.uuid4()),
        "filename": os.path.basename(image_path),
        "path": str(image_path),
        "timestamp": datetime.now().isoformat(),
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "width": width,
        "height": height,
        "steps": steps,
        "seed": seed
    }
    metadata.append(entry)
    save_metadata(metadata)
    return entry


def process_queue():
    """Background thread to process the generation queue"""
    global active_generation
    
    while True:
        job = None
        
        with queue_lock:
            if generation_queue and not active_generation:
                job = generation_queue[0]
                active_generation = job
                job['status'] = 'generating'
        
        if job:
            try:
                # Generate image
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                output_filename = f"comfyui_{timestamp}_{job['id'][:8]}.png"
                output_path = OUTPUT_DIR / output_filename
                
                # Get the seed (generate if not provided)
                seed = job.get('seed')
                if seed is None:
                    import random
                    seed = random.randint(0, 2**32 - 1)
                
                comfyui_client.generate_image(
                    positive_prompt=job['prompt'],
                    negative_prompt=job['negative_prompt'],
                    width=job['width'],
                    height=job['height'],
                    steps=job['steps'],
                    cfg=1.0,
                    seed=seed,
                    output_path=str(output_path),
                    wait=True
                )
                
                # Add metadata with actual seed used
                metadata_entry = add_metadata_entry(
                    str(output_path),
                    job['prompt'],
                    job['negative_prompt'],
                    job['width'],
                    job['height'],
                    job['steps'],
                    seed
                )
                
                job['status'] = 'completed'
                job['output_path'] = str(output_path)
                job['metadata_id'] = metadata_entry['id']
                job['completed_at'] = datetime.now().isoformat()
                
            except Exception as e:
                job['status'] = 'failed'
                job['error'] = str(e)
                job['failed_at'] = datetime.now().isoformat()
            
            finally:
                with queue_lock:
                    if generation_queue and generation_queue[0]['id'] == job['id']:
                        generation_queue.pop(0)
                    active_generation = None
        else:
            time.sleep(0.5)


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
        'negative_prompt': data.get('negative_prompt', ''),
        'width': int(data.get('width', 512)),
        'height': int(data.get('height', 1024)),
        'steps': int(data.get('steps', 4)),
        'seed': data.get('seed'),
        'status': 'queued',
        'added_at': datetime.now().isoformat()
    }
    
    with queue_lock:
        generation_queue.append(job)
    
    return jsonify({'success': True, 'job_id': job['id']})


@app.route('/api/queue', methods=['GET'])
def get_queue():
    """Get current queue status"""
    with queue_lock:
        queue_copy = generation_queue.copy()
        active = active_generation.copy() if active_generation else None
    
    return jsonify({
        'queue': queue_copy,
        'active': active
    })


@app.route('/api/queue/<job_id>', methods=['DELETE'])
def cancel_job(job_id):
    """Cancel a queued job"""
    with queue_lock:
        for i, job in enumerate(generation_queue):
            if job['id'] == job_id and job['status'] == 'queued':
                generation_queue.pop(i)
                return jsonify({'success': True})
    
    return jsonify({'success': False, 'error': 'Job not found or already processing'}), 404


@app.route('/api/images')
def get_images():
    """Get all generated images with metadata"""
    metadata = load_metadata()
    # Reverse to show newest first
    return jsonify(metadata[::-1])


@app.route('/api/images/<image_id>')
def get_image_metadata(image_id):
    """Get metadata for a specific image"""
    metadata = load_metadata()
    for entry in metadata:
        if entry['id'] == image_id:
            return jsonify(entry)
    return jsonify({'error': 'Image not found'}), 404


@app.route('/outputs/<filename>')
def serve_image(filename):
    """Serve generated images"""
    file_path = OUTPUT_DIR / filename
    if file_path.exists():
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
