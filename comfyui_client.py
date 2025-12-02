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
        
    def load_workflow(self, workflow_path: str = "Imaginer.json") -> Dict[str, Any]:
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
        seed: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Modify workflow parameters
        
        Args:
            workflow: The workflow dictionary
            positive_prompt: Positive prompt text
            width: Image width
            height: Image height
            steps: Number of sampling steps
            cfg: CFG scale
            seed: Random seed (None for random)
            
        Returns:
            Modified workflow
        """
        # Create a copy to avoid modifying the original
        modified = json.loads(json.dumps(workflow))
        
        # Update positive prompt
        if positive_prompt:
            modified["75:6"]["inputs"]["text"] = positive_prompt
        
        # Update dimensions
        if width is not None:
            modified["75:58"]["inputs"]["width"] = width
        if height is not None:
            modified["75:58"]["inputs"]["height"] = height
        
        # Update sampling parameters
        if steps is not None:
            modified["75:3"]["inputs"]["steps"] = steps
        if cfg is not None:
            modified["75:3"]["inputs"]["cfg"] = cfg
        if seed is not None:
            modified["75:3"]["inputs"]["seed"] = seed
        elif seed is None:
            # Generate random seed
            modified["75:3"]["inputs"]["seed"] = random.randint(0, 2**32 - 1)
        
        return modified
    
    def generate_image(
        self,
        positive_prompt: str,
        width: int = 512,
        height: int = 1024,
        steps: int = 4,
        cfg: float = 1.0,
        seed: Optional[int] = None,
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
            seed=seed
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
                result = json.loads(response.read())
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
                result = json.loads(response.read())
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
