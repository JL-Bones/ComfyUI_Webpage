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
    
    def optimize_prompt(self, prompt: str, model: str, provider: str = 'ollama', use_instructions: bool = True, is_batch: bool = False) -> Dict[str, Any]:
        """
        Optimize an image generation prompt
        
        Args:
            prompt: Original prompt text
            model: Model name (e.g., 'llama2', 'gemini-2.5-flash')
            provider: 'ollama' or 'gemini'
            use_instructions: If True, use the optimize instructions. If False, just send the prompt.
            is_batch: If True, use batch prompt optimization (preserves [parameters])
        
        Returns:
            Dict with 'success', 'optimized_prompt', and optional 'error'
        """
        from ai_instructions import OPTIMIZE_BATCH_PROMPT_INSTRUCTION
        
        if use_instructions:
            if is_batch:
                instruction = OPTIMIZE_BATCH_PROMPT_INSTRUCTION.format(prompt=prompt)
            else:
                instruction = OPTIMIZE_PROMPT_INSTRUCTION.format(prompt=prompt)
        else:
            # Just send the prompt directly without instructions
            instruction = prompt
        
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
    
    def generate_csv_parameters(
        self,
        base_prompt: str,
        parameters: list,
        count: int,
        model: str,
        provider: str = 'ollama',
        custom_context: str = None,
        use_instructions: bool = True,
        variable_parameters: list = None
    ) -> Dict[str, Any]:
        """
        Generate CSV parameter data for batch generation
        
        Args:
            base_prompt: The base prompt template (optional)
            parameters: List of parameter names
            count: Number of variations to generate
            model: Model name
            provider: 'ollama' or 'gemini'
            custom_context: Custom suggestions/context
            use_instructions: Whether to include default instructions
            variable_parameters: List of parameter names that are generation params (width, height, etc.)
        
        Returns:
            Dict with 'success', 'csv_data', and optional 'error'
        """
        from ai_instructions import GENERATE_PARAMETERS_INSTRUCTION
        
        # Build context info based on what's provided
        context_parts = []
        
        if base_prompt:
            context_parts.append(f"Base Prompt Template: {base_prompt}")
        
        # Add hints for variable parameters
        if variable_parameters:
            param_hints = []
            if 'width' in variable_parameters or 'height' in variable_parameters:
                param_hints.append("- width/height: Use values like 512, 768, 1024, 1536, 2048 (multiples of 64)")
            if 'steps' in variable_parameters:
                param_hints.append("- steps: Use values between 4-20 (4 for fast, 8-12 balanced, 16-20 detailed)")
            if 'seed' in variable_parameters:
                param_hints.append("- seed: Use random integers or leave empty for random generation")
            if 'file_prefix' in variable_parameters:
                param_hints.append("- file_prefix: Use descriptive names matching content (e.g., 'portrait', 'landscape', 'character')")
            if 'subfolder' in variable_parameters:
                param_hints.append("- subfolder: Use logical folder names for organization (e.g., 'portraits', 'landscapes', 'variations')")
            if 'mcnl_lora' in variable_parameters or 'snofs_lora' in variable_parameters:
                param_hints.append("- LoRA parameters: Use true/false, yes/no, or 1/0 to enable/disable")
            
            if param_hints:
                context_parts.append("\nVariable Parameter Guidelines:\n" + "\n".join(param_hints))
        
        if custom_context:
            context_parts.append(f"\nCustom Requirements: {custom_context}")
        
        context_info = "\n".join(context_parts) if context_parts else "Generate creative and diverse parameter values."
        
        # Build the instruction
        if use_instructions:
            headers = ",".join(parameters)
            instruction = GENERATE_PARAMETERS_INSTRUCTION.format(
                context_info=context_info,
                count=count,
                headers=headers
            )
        else:
            # Without instructions, just send a simple request
            headers = ",".join(parameters)
            instruction = f"{context_info}\n\nGenerate {count} diverse CSV rows with these parameters: {headers}\n\nFirst row must be the headers, then {count} data rows."
        
        try:
            if provider == 'ollama':
                result = self._call_ollama(instruction, model)
            elif provider == 'gemini':
                result = self._call_gemini(instruction, model)
            else:
                return {'success': False, 'error': f'Unknown provider: {provider}'}
            
            if result.get('success'):
                # The result should contain 'optimized_prompt' which is our CSV data
                csv_data = result.get('optimized_prompt', '')
                return {'success': True, 'csv_data': csv_data}
            else:
                return result
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def generate_parameter_values(
        self,
        parameter: str,
        count: int,
        model: str,
        provider: str = 'ollama',
        instructions: str = None
    ) -> Dict[str, Any]:
        """
        Generate values for a single parameter
        
        Args:
            parameter: Name of the parameter to generate values for
            count: Number of values to generate
            model: Model name
            provider: 'ollama' or 'gemini'
            instructions: Custom instructions for value generation
        
        Returns:
            Dict with 'success', 'values' (list), and optional 'error'
        """
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
        
        # Add custom instructions if provided
        if instructions:
            context_parts.append(f"\nAdditional requirements: {instructions}")
        
        context_parts.append(f"\nOutput exactly {count} values, one per line. No numbering, no explanations, just the values.")
        
        instruction = "\n".join(context_parts)
        
        try:
            if provider == 'ollama':
                result = self._call_ollama(instruction, model)
            elif provider == 'gemini':
                result = self._call_gemini(instruction, model)
            else:
                return {'success': False, 'error': f'Unknown provider: {provider}'}
            
            if result.get('success'):
                # Parse the result into individual values
                output_text = result.get('optimized_prompt', '')
                values = [line.strip() for line in output_text.split('\n') if line.strip()]
                
                # Remove any numbering (1., 2., etc.) if present
                cleaned_values = []
                for value in values:
                    # Remove leading numbers and dots/parentheses
                    cleaned = value.lstrip('0123456789.)-( ').strip()
                    if cleaned:
                        cleaned_values.append(cleaned)
                
                return {'success': True, 'values': cleaned_values}
            else:
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
    
    def _call_ollama(self, prompt: str, model: str, stream: bool = False) -> Dict[str, Any]:
        """Call Ollama API"""
        data = {
            'model': model,
            'prompt': prompt,
            'stream': stream,
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
            if stream:
                # Return generator for streaming
                return self._stream_ollama(req, model)
            else:
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
    
    def _stream_ollama(self, req, model: str):
        """Stream responses from Ollama API"""
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                full_response = ""
                for line in response:
                    line_text = line.decode('utf-8').strip()
                    if line_text:
                        try:
                            chunk = json.loads(line_text)
                            if 'response' in chunk:
                                text = chunk['response']
                                full_response += text
                                yield text
                            if chunk.get('done', False):
                                break
                        except json.JSONDecodeError:
                            continue
                
                # Unload model after streaming completes
                self._unload_ollama_model(model)
                
        except Exception as e:
            yield f"\n\n[Error: {str(e)}]"
            self._unload_ollama_model(model)
    
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
