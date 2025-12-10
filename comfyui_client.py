"""
ComfyUI Workflow Client
Interact with ComfyUI API to execute the Imaginer workflow
"""

import json
import urllib.request
import urllib.parse
import urllib.error
import uuid
import random
import time
from typing import Optional, Dict, Any


class ComfyUIClient:
    def __init__(self, server_address: str = "127.0.0.1:8188"):
        """
        Initialize ComfyUI client
        
        Args:
            server_address: ComfyUI server address (default: 127.0.0.1:8188)
        """
        self.server_address = server_address
        self.client_id = str(uuid.uuid4())
        
    def load_workflow(self, workflow_path: str = "workflows/Qwen_Full.json") -> Dict[str, Any]:
        """Load workflow from JSON file"""
        with open(workflow_path, 'r') as f:
            return json.load(f)
    
    def queue_prompt(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """
        Queue a prompt to ComfyUI
        
        Args:
            workflow: The workflow dictionary
            
        Returns:
            Response from the API containing prompt_id
        """
        p = {"prompt": workflow, "client_id": self.client_id}
        data = json.dumps(p).encode('utf-8')
        
        req = urllib.request.Request(
            f"http://{self.server_address}/prompt",
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        
        try:
            response = urllib.request.urlopen(req)
            return json.loads(response.read())
        except urllib.error.URLError as e:
            print(f"Error connecting to ComfyUI: {e}")
            raise
    
    def get_image(self, filename: str, subfolder: str = "", folder_type: str = "output") -> bytes:
        """
        Download generated image from ComfyUI
        
        Args:
            filename: Name of the image file
            subfolder: Subfolder in the output directory
            folder_type: Type of folder (output, input, temp)
            
        Returns:
            Image data as bytes
        """
        data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        url_values = urllib.parse.urlencode(data)
        
        url = f"http://{self.server_address}/view?{url_values}"
        
        try:
            with urllib.request.urlopen(url) as response:
                return response.read()
        except urllib.error.URLError as e:
            print(f"Error downloading image: {e}")
            raise
    
    def get_history(self, prompt_id: str) -> Dict[str, Any]:
        """
        Get the execution history for a prompt
        
        Args:
            prompt_id: The prompt ID to query
            
        Returns:
            History data for the prompt
        """
        url = f"http://{self.server_address}/history/{prompt_id}"
        
        try:
            with urllib.request.urlopen(url) as response:
                return json.loads(response.read())
        except urllib.error.URLError as e:
            print(f"Error getting history: {e}")
            raise
    
    def wait_for_completion(self, prompt_id: str, timeout: int = 300) -> Dict[str, Any]:
        """
        Wait for a prompt to complete execution
        
        Args:
            prompt_id: The prompt ID to wait for
            timeout: Maximum time to wait in seconds
            
        Returns:
            History data when completed
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            history = self.get_history(prompt_id)
            
            if prompt_id in history:
                return history[prompt_id]
            
            time.sleep(1)
        
        raise TimeoutError(f"Workflow did not complete within {timeout} seconds")
    
    def modify_workflow(
        self,
        workflow: Dict[str, Any],
        positive_prompt: str = "",
        width: Optional[int] = None,
        height: Optional[int] = None,
        steps: Optional[int] = None,
        cfg: Optional[float] = None,
        seed: Optional[int] = None,
        shift: Optional[float] = None,
        use_image: bool = False,
        use_image_size: bool = False,
        image_filename: Optional[str] = None,
        mcnl_lora: bool = False,
        snofs_lora: bool = False,
        male_lora: bool = False
    ) -> Dict[str, Any]:
        """
        Modify workflow parameters for Qwen_Full.json workflow
        
        Args:
            workflow: The workflow dictionary
            positive_prompt: Positive prompt text
            width: Image width
            height: Image height
            steps: Number of sampling steps
            cfg: CFG scale
            seed: Random seed (None for random)
            shift: Shift parameter for ModelSamplingAuraFlow
            use_image: Whether to use image-to-image mode
            use_image_size: Whether to use the uploaded image's size
            image_filename: Name of uploaded image file
            mcnl_lora: Enable MCNL LoRA
            snofs_lora: Enable Snofs LoRA
            male_lora: Enable Male LoRA
            
        Returns:
            Modified workflow
        """
        # Create a copy to avoid modifying the original
        modified = json.loads(json.dumps(workflow))
        
        # Update positive prompt (node 45)
        if positive_prompt:
            modified["45"]["inputs"]["value"] = positive_prompt
        
        # Update dimensions (nodes 32=width, 31=height)
        if width is not None:
            modified["32"]["inputs"]["value"] = width
        if height is not None:
            modified["31"]["inputs"]["value"] = height
        
        # Update sampling parameters
        if steps is not None:
            modified["36"]["inputs"]["value"] = steps
        if cfg is not None:
            modified["39"]["inputs"]["value"] = cfg
        if shift is not None:
            modified["40"]["inputs"]["value"] = shift
        if seed is not None:
            modified["35"]["inputs"]["value"] = seed
        elif seed is None:
            # Generate random seed
            modified["35"]["inputs"]["value"] = random.randint(0, 2**32 - 1)
        
        # Update use_image (node 38)
        modified["38"]["inputs"]["value"] = use_image
        
        # Update use_image_size (node 34)
        modified["34"]["inputs"]["value"] = use_image_size
        
        # Update image filename (node 43). Some workflows require a valid image path
        # even in text-to-image mode. Provide a fallback to a permanent dummy image
        # to avoid Bad Request errors from ComfyUI when the path is missing.
        if not image_filename:
            # Default dummy image path relative to ComfyUI input root
            image_filename = "permanent/violet.webp"
        modified["43"]["inputs"]["image"] = image_filename
        
        # Update LoRA booleans (nodes 41=MCNL, 42=Snofs, 33=Male)
        modified["41"]["inputs"]["value"] = mcnl_lora
        modified["42"]["inputs"]["value"] = snofs_lora
        modified["33"]["inputs"]["value"] = male_lora
        
        return modified

    def unload_models(self) -> None:
        """Call ComfyUI to unload models (free VRAM/RAM caches)."""
        url = f"http://{self.server_address}/unload"
        req = urllib.request.Request(url, method="POST")
        try:
            with urllib.request.urlopen(req) as response:
                # ComfyUI may return empty response; handle gracefully
                _ = response.read().decode("utf-8").strip()
        except urllib.error.URLError as e:
            # Log and continue; unloading failures shouldn't crash the app
            print(f"Error calling /unload: {e}")
        except Exception as e:
            print(f"Unexpected error unloading models: {e}")

    def clear_cache(self) -> None:
        """Call ComfyUI to clear caches via /free endpoint."""
        url = f"http://{self.server_address}/free"
        req = urllib.request.Request(url, method="POST")
        try:
            with urllib.request.urlopen(req) as response:
                # ComfyUI /free often returns empty or non-JSON; just read and ignore
                _ = response.read().decode("utf-8").strip()
        except urllib.error.URLError as e:
            print(f"Error calling /free: {e}")
        except Exception as e:
            print(f"Unexpected error clearing cache: {e}")
    
    def generate_image(
        self,
        positive_prompt: str,
        width: int = 512,
        height: int = 1024,
        steps: int = 4,
        cfg: float = 1.0,
        seed: Optional[int] = None,
        shift: float = 3.0,
        use_image: bool = False,
        use_image_size: bool = False,
        image_filename: Optional[str] = None,
        mcnl_lora: bool = False,
        snofs_lora: bool = False,
        male_lora: bool = False,
        output_path: Optional[str] = None,
        wait: bool = True
    ) -> Optional[str]:
        """
        Generate an image using the workflow
        
        Args:
            positive_prompt: Positive prompt text
            width: Image width
            height: Image height
            steps: Number of sampling steps
            cfg: CFG scale
            seed: Random seed (None for random)
            shift: Shift parameter for ModelSamplingAuraFlow
            use_image: Whether to use image-to-image mode
            use_image_size: Whether to use the uploaded image's size
            image_filename: Name of uploaded image file
            mcnl_lora: Enable MCNL LoRA
            snofs_lora: Enable Snofs LoRA
            male_lora: Enable Male LoRA
            output_path: Path to save the image (None to not save)
            wait: Whether to wait for completion
            
        Returns:
            Path to saved image if output_path provided and wait=True, else None
        """
        # Load and modify workflow
        workflow = self.load_workflow()
        modified_workflow = self.modify_workflow(
            workflow,
            positive_prompt=positive_prompt,
            width=width,
            height=height,
            steps=steps,
            cfg=cfg,
            seed=seed,
            shift=shift,
            use_image=use_image,
            use_image_size=use_image_size,
            image_filename=image_filename,
            mcnl_lora=mcnl_lora,
            snofs_lora=snofs_lora,
            male_lora=male_lora
        )
        
        # Queue the prompt
        response = self.queue_prompt(modified_workflow)
        prompt_id = response['prompt_id']
        print(f"Queued prompt: {prompt_id}")
        
        if not wait:
            return None
        
        # Wait for completion
        print("Waiting for generation to complete...")
        history = self.wait_for_completion(prompt_id)
        
        # Get the output images
        outputs = history['outputs']
        
        # Find SaveImage node output
        for node_id, node_output in outputs.items():
            if 'images' in node_output:
                for image in node_output['images']:
                    filename = image['filename']
                    subfolder = image.get('subfolder', '')
                    
                    # Download image
                    image_data = self.get_image(filename, subfolder)
                    
                    if output_path:
                        # Save image
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        print(f"Image saved to: {output_path}")
                        return output_path
                    else:
                        print(f"Image generated: {filename}")
        
        return None
    
    def unload_models(self) -> bool:
        """
        Unload all models from memory (RAM/VRAM)
        
        Returns:
            True if successful, False otherwise
        """
        url = f"http://{self.server_address}/free"
        
        data = json.dumps({"unload_models": True, "free_memory": True}).encode('utf-8')
        
        req = urllib.request.Request(
            url,
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                response_text = response.read().decode('utf-8').strip()
                # Some ComfyUI versions return empty response
                if response_text:
                    try:
                        result = json.loads(response_text)
                    except json.JSONDecodeError:
                        pass  # Empty or non-JSON response is OK
                print(f"Models unloaded and memory freed")
                return True
        except urllib.error.URLError as e:
            print(f"Error unloading models: {e}")
            return False
    
    def clear_cache(self) -> bool:
        """
        Clear cache and garbage collect
        
        Returns:
            True if successful, False otherwise
        """
        url = f"http://{self.server_address}/free"
        
        data = json.dumps({"unload_models": False, "free_memory": True}).encode('utf-8')
        
        req = urllib.request.Request(
            url,
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                response_text = response.read().decode('utf-8').strip()
                # Some ComfyUI versions return empty response
                if response_text:
                    try:
                        result = json.loads(response_text)
                    except json.JSONDecodeError:
                        pass  # Empty or non-JSON response is OK
                print(f"Cache cleared")
                return True
        except urllib.error.URLError as e:
            print(f"Error clearing cache: {e}")
            return False
    
    def interrupt_processing(self) -> bool:
        """
        Interrupt current processing (emergency stop)
        
        Returns:
            True if successful, False otherwise
        """
        url = f"http://{self.server_address}/interrupt"
        
        req = urllib.request.Request(url, method='POST')
        
        try:
            with urllib.request.urlopen(req) as response:
                print(f"Processing interrupted")
                return True
        except urllib.error.URLError as e:
            print(f"Error interrupting: {e}")
            return False


def main():
    """Example usage"""
    # Initialize client
    client = ComfyUIClient(server_address="127.0.0.1:8188")
    
    # Generate an image
    client.generate_image(
        positive_prompt="a beautiful landscape with mountains and a lake at sunset",
        width=512,
        height=1024,
        steps=4,
        cfg=1.0,
        output_path="output_image.png"
    )


if __name__ == "__main__":
    main()
