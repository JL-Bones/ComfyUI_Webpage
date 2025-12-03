"""
AI Assistant for Prompt Optimization and Parameter Generation
Supports Ollama (local) and Google Gemini API
"""

import json
import urllib.request
import urllib.parse
import urllib.error
import os
from typing import Optional, List, Dict, Any
from ai_instructions import (
    OPTIMIZE_PROMPT_INSTRUCTION,
    EDIT_PROMPT_INSTRUCTION,
    GENERATE_PARAMETERS_INSTRUCTION,
    get_csv_with_instructions
)


class AIAssistant:
    """AI assistant for prompt optimization and parameter generation"""
    
    def __init__(self, ollama_url: str = "http://127.0.0.1:11434"):
        self.ollama_url = ollama_url
        self.gemini_api_key = self._load_gemini_key()
    
    def _load_gemini_key(self) -> Optional[str]:
        """Load Gemini API key from .env file"""
        env_file = os.path.join(os.path.dirname(__file__), '.env')
        if os.path.exists(env_file):
            try:
                with open(env_file, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('GEMINI_API_KEY='):
                            return line.split('=', 1)[1].strip().strip('"').strip("'")
            except Exception as e:
                print(f"Error loading .env file: {e}")
        return None
    
    def get_available_ollama_models(self) -> List[str]:
        """Get list of available Ollama models"""
        try:
            req = urllib.request.Request(
                f"{self.ollama_url}/api/tags",
                method="GET"
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                return [model['name'] for model in data.get('models', [])]
        except Exception as e:
            print(f"Error fetching Ollama models: {e}")
            return []
    
    def get_available_gemini_models(self) -> List[str]:
        """Get list of available Gemini models"""
        if not self.gemini_api_key:
            return []
        return ['gemini-2.5-flash', 'gemini-2.5-pro']
    
    def get_available_models(self) -> Dict[str, List[str]]:
        """Get all available models grouped by provider"""
        return {
            'ollama': self.get_available_ollama_models(),
            'gemini': self.get_available_gemini_models()
        }
    
    def optimize_prompt(self, prompt: str, model: str, provider: str = 'ollama') -> Dict[str, Any]:
        """
        Optimize an image generation prompt
        
        Args:
            prompt: Original prompt text
            model: Model name (e.g., 'llama2', 'gemini-2.5-flash')
            provider: 'ollama' or 'gemini'
        
        Returns:
            Dict with 'success', 'optimized_prompt', and optional 'error'
        """
        instruction = OPTIMIZE_PROMPT_INSTRUCTION.format(prompt=prompt)
        
        try:
            if provider == 'ollama':
                result = self._call_ollama(instruction, model)
            elif provider == 'gemini':
                result = self._call_gemini(instruction, model)
            else:
                return {'success': False, 'error': f'Unknown provider: {provider}'}
            
            return result
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def suggest_prompt_edit(self, prompt: str, suggestion: str, model: str, provider: str = 'ollama') -> Dict[str, Any]:
        """
        Apply a user suggestion to modify a prompt
        
        Args:
            prompt: Original prompt text
            suggestion: User's suggestion for modification
            model: Model name
            provider: 'ollama' or 'gemini'
        
        Returns:
            Dict with 'success', 'edited_prompt', and optional 'error'
        """
        instruction = EDIT_PROMPT_INSTRUCTION.format(prompt=prompt, suggestion=suggestion)
        
        try:
            if provider == 'ollama':
                result = self._call_ollama(instruction, model)
            elif provider == 'gemini':
                result = self._call_gemini(instruction, model)
            else:
                return {'success': False, 'error': f'Unknown provider: {provider}'}
            
            return result
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def generate_batch_parameters(
        self,
        template: str,
        count: int,
        context: str,
        context_type: str = 'full',
        model: str = 'llama2',
        provider: str = 'ollama',
        batch_params: Dict = None,
        varied_params: list = None
    ) -> Dict[str, Any]:
        """
        Generate parameter values for batch generation
        
        Args:
            template: Prompt template with [parameters]
            count: Number of variations to generate
            context: Additional context (base prompt, parameters only, or custom text)
            context_type: 'full' (template + context), 'parameters' (just params), 'custom' (just context)
            model: Model name
            provider: 'ollama' or 'gemini'
            batch_params: Dictionary of batch generation parameters (width, height, steps, etc.)
            varied_params: List of parameter names that should vary per-image
        
        Returns:
            Dict with 'success', 'data' (CSV format), and optional 'error'
        """
        # Extract parameters from template
        import re
        parameters = list(set(re.findall(r'\[([^\]]+)\]', template)))
        
        if not parameters and not varied_params:
            return {'success': False, 'error': 'No parameters found in template'}
        
        # Add varied parameters to the list of columns to generate
        all_params = parameters.copy()
        if varied_params:
            for param in varied_params:
                if param not in all_params:
                    all_params.append(param)
        
        # Build generation settings context
        settings_context = ""
        if batch_params:
            settings_info = []
            if batch_params.get('width'):
                settings_info.append(f"Image width: {batch_params['width']}px")
            if batch_params.get('height'):
                settings_info.append(f"Image height: {batch_params['height']}px")
            if batch_params.get('steps'):
                settings_info.append(f"Generation steps: {batch_params['steps']}")
            if batch_params.get('seed') and batch_params['seed'] != 'random':
                settings_info.append(f"Seed: {batch_params['seed']}")
            if batch_params.get('file_prefix'):
                settings_info.append(f"File prefix: {batch_params['file_prefix']}")
            if batch_params.get('subfolder'):
                settings_info.append(f"Output folder: {batch_params['subfolder']}")
            
            if settings_info:
                settings_context = "\n\nGeneration Settings:\n" + "\n".join(f"- {info}" for info in settings_info)
        
        # Add varied parameters context
        if varied_params:
            varied_info = f"\n\nParameters that should vary per-image: {', '.join(varied_params)}"
            if 'width' in varied_params or 'height' in varied_params:
                varied_info += "\n- For dimensions, suggest appropriate values (512, 768, 1024, 1536, etc.)"
            if 'steps' in varied_params:
                varied_info += "\n- For steps, suggest values between 4 and 20"
            if 'seed' in varied_params:
                varied_info += "\n- For seed, use random integers or leave empty"
            settings_context += varied_info
        
        # Build instruction based on context type
        if context_type == 'full':
            context_info = f"Template: {template}\n\nAdditional context: {context}{settings_context}"
        elif context_type == 'parameters':
            context_info = f"Parameters to fill: {', '.join(parameters)}\n\nContext: {context}{settings_context}"
        else:  # custom
            context_info = f"{context}{settings_context}"
        
        instruction = GENERATE_PARAMETERS_INSTRUCTION.format(
            context_info=context_info,
            count=count,
            headers=','.join(all_params)
        )
        
        try:
            if provider == 'ollama':
                result = self._call_ollama(instruction, model)
            elif provider == 'gemini':
                result = self._call_gemini(instruction, model)
            else:
                return {'success': False, 'error': f'Unknown provider: {provider}'}
            
            if result['success']:
                # Rename key for clarity
                csv_data = result.pop('optimized_prompt', result.pop('edited_prompt', ''))
                # Add instructions to CSV
                result['data'] = get_csv_with_instructions(csv_data, template, parameters)
                
            return result
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _call_ollama(self, prompt: str, model: str) -> Dict[str, Any]:
        """Call Ollama API"""
        data = {
            'model': model,
            'prompt': prompt,
            'stream': False,
            'options': {
                'temperature': 0.7,
                'top_p': 0.9
            }
        }
        
        req = urllib.request.Request(
            f"{self.ollama_url}/api/generate",
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                result = json.loads(response.read().decode())
                response_text = result.get('response', '').strip()
                
                # Unload model immediately
                self._unload_ollama_model(model)
                
                return {
                    'success': True,
                    'optimized_prompt': response_text
                }
        except urllib.error.HTTPError as e:
            error_msg = e.read().decode() if e.fp else str(e)
            return {'success': False, 'error': f'Ollama HTTP error: {error_msg}'}
        except Exception as e:
            return {'success': False, 'error': f'Ollama error: {str(e)}'}
    
    def _unload_ollama_model(self, model: str):
        """Unload Ollama model from memory immediately"""
        try:
            data = {
                'model': model,
                'keep_alive': 0  # Unload immediately
            }
            
            req = urllib.request.Request(
                f"{self.ollama_url}/api/generate",
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'},
                method="POST"
            )
            
            with urllib.request.urlopen(req, timeout=5) as response:
                pass  # Just trigger the unload
                
        except Exception as e:
            print(f"Warning: Could not unload model {model}: {e}")
    
    def _call_gemini(self, prompt: str, model: str) -> Dict[str, Any]:
        """Call Google Gemini API"""
        if not self.gemini_api_key:
            return {'success': False, 'error': 'Gemini API key not configured in .env file'}
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.gemini_api_key}"
        
        data = {
            'contents': [{
                'parts': [{
                    'text': prompt
                }]
            }],
            'generationConfig': {
                'temperature': 0.7,
                'topP': 0.9,
                'maxOutputTokens': 2048
            }
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode())
                
                # Extract text from response
                candidates = result.get('candidates', [])
                if not candidates:
                    return {'success': False, 'error': 'No response from Gemini'}
                
                content = candidates[0].get('content', {})
                parts = content.get('parts', [])
                if not parts:
                    return {'success': False, 'error': 'Empty response from Gemini'}
                
                response_text = parts[0].get('text', '').strip()
                
                return {
                    'success': True,
                    'optimized_prompt': response_text
                }
                
        except urllib.error.HTTPError as e:
            error_msg = e.read().decode() if e.fp else str(e)
            return {'success': False, 'error': f'Gemini HTTP error: {error_msg}'}
        except Exception as e:
            return {'success': False, 'error': f'Gemini error: {str(e)}'}


# Example usage
if __name__ == '__main__':
    assistant = AIAssistant()
    
    # Test model discovery
    print("Available models:", assistant.get_available_models())
    
    # Test prompt optimization (requires Ollama running with a model)
    # result = assistant.optimize_prompt("a cat", "llama2", "ollama")
    # print("Optimized:", result)
