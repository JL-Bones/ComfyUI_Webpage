"""
Example script demonstrating how to use the ComfyUI client
"""

from comfyui_client import ComfyUIClient


def basic_example():
    """Basic usage example"""
    print("=== Basic Example ===")
    
    # Create client (make sure ComfyUI is running on localhost:8188)
    client = ComfyUIClient(server_address="127.0.0.1:8188")
    
    # Generate a simple image
    client.generate_image(
        positive_prompt="a cute cat sitting on a windowsill",
        negative_prompt="blurry, distorted",
        width=512,
        height=512,
        output_path="cat_image.png"
    )
    print("✓ Basic example completed\n")


def custom_parameters_example():
    """Example with custom parameters"""
    print("=== Custom Parameters Example ===")
    
    client = ComfyUIClient()
    
    # Generate with custom settings
    client.generate_image(
        positive_prompt="futuristic cityscape at night, neon lights, cyberpunk style",
        negative_prompt="blurry, low quality, distorted",
        width=1024,
        height=512,
        steps=8,
        cfg=1.5,
        seed=12345,  # Fixed seed for reproducibility
        output_path="cityscape.png"
    )
    print("✓ Custom parameters example completed\n")


def batch_generation_example():
    """Generate multiple images"""
    print("=== Batch Generation Example ===")
    
    client = ComfyUIClient()
    
    prompts = [
        "a serene forest with sunlight filtering through trees",
        "a majestic dragon flying over mountains",
        "a cozy coffee shop interior with warm lighting"
    ]
    
    for i, prompt in enumerate(prompts):
        print(f"Generating image {i+1}/{len(prompts)}: {prompt}")
        client.generate_image(
            positive_prompt=prompt,
            negative_prompt="blurry, low quality",
            width=512,
            height=1024,
            output_path=f"batch_image_{i+1}.png"
        )
    
    print("✓ Batch generation completed\n")


def modify_workflow_example():
    """Example showing how to modify workflow directly"""
    print("=== Modify Workflow Example ===")
    
    client = ComfyUIClient()
    
    # Load workflow
    workflow = client.load_workflow("Imaginer.json")
    
    # Modify workflow parameters
    modified = client.modify_workflow(
        workflow,
        positive_prompt="a magical fantasy castle in the clouds",
        negative_prompt="",
        width=768,
        height=768,
        steps=6,
        cfg=1.2
    )
    
    # Queue the modified workflow
    response = client.queue_prompt(modified)
    print(f"Queued prompt ID: {response['prompt_id']}")
    
    # Wait for completion
    history = client.wait_for_completion(response['prompt_id'])
    print("✓ Workflow modification example completed\n")


def async_generation_example():
    """Example of non-blocking generation"""
    print("=== Async Generation Example ===")
    
    client = ComfyUIClient()
    
    # Load and modify workflow
    workflow = client.load_workflow()
    modified = client.modify_workflow(
        workflow,
        positive_prompt="a peaceful zen garden with cherry blossoms",
        width=512,
        height=1024
    )
    
    # Queue without waiting
    response = client.queue_prompt(modified)
    prompt_id = response['prompt_id']
    print(f"Queued prompt (async): {prompt_id}")
    print("You can continue with other tasks while this generates...")
    
    # Later, check if it's done
    import time
    time.sleep(5)  # Simulate doing other work
    
    try:
        history = client.get_history(prompt_id)
        if prompt_id in history:
            print("✓ Generation completed!")
        else:
            print("Still processing...")
    except Exception as e:
        print(f"Error checking status: {e}")
    
    print("✓ Async example completed\n")


if __name__ == "__main__":
    print("ComfyUI Client Examples")
    print("=" * 50)
    print("\nMake sure ComfyUI is running on http://127.0.0.1:8188")
    print("before running these examples.\n")
    
    # Run the basic example
    try:
        basic_example()
    except Exception as e:
        print(f"Error in basic example: {e}")
        print("\nMake sure ComfyUI is running and accessible!")
        print("You can modify the examples to suit your needs.\n")
