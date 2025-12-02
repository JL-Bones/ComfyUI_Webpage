# ComfyUI Workflow Client

Python client for interacting with the ComfyUI Imaginer workflow.

## Setup

1. Make sure ComfyUI is running on `http://127.0.0.1:8188`
2. No additional dependencies required (uses standard library only)

## Usage

### Basic Example

```python
from comfyui_client import ComfyUIClient

# Initialize client
client = ComfyUIClient(server_address="127.0.0.1:8188")

# Generate an image
client.generate_image(
    positive_prompt="a beautiful landscape with mountains",
    negative_prompt="blurry, low quality",
    width=512,
    height=1024,
    output_path="output.png"
)
```

### Advanced Usage

```python
# Load and modify workflow manually
workflow = client.load_workflow("Imaginer.json")
modified = client.modify_workflow(
    workflow,
    positive_prompt="your prompt here",
    steps=8,
    cfg=1.5,
    seed=12345
)

# Queue the prompt
response = client.queue_prompt(modified)
prompt_id = response['prompt_id']

# Wait for completion
history = client.wait_for_completion(prompt_id)
```

## Available Parameters

- `positive_prompt`: Main prompt text
- `negative_prompt`: Negative prompt text
- `width`: Image width (default: 512)
- `height`: Image height (default: 1024)
- `steps`: Sampling steps (default: 4)
- `cfg`: CFG scale (default: 1.0)
- `seed`: Random seed (None for random)

## Files

- `comfyui_client.py`: Main client library
- `example.py`: Example usage scripts
- `Imaginer.json`: ComfyUI workflow definition

## Running Examples

```powershell
python example.py
```

This will run a basic example that generates an image. Uncomment other example functions in `example.py` to try different features.
