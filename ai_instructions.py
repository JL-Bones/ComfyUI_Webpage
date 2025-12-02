"""
Preset Instructions for AI-Assisted Prompt Optimization and Parameter Generation
"""

# Prompt Optimization Instructions
OPTIMIZE_PROMPT_INSTRUCTION = """You are an expert at writing image generation prompts for AI models like Stable Diffusion.
Your task is to take the user's prompt and enhance it to produce better, more detailed images.

Guidelines for optimization:
- Add specific details about lighting, composition, style, and quality
- Include relevant artistic styles or techniques if appropriate
- Be descriptive but concise
- Maintain the core concept and intent of the original prompt
- Use comma-separated descriptive phrases
- Add quality tags like "high quality", "detailed", "professional"
- Consider adding camera angles, mood, or atmosphere details

Original prompt: {prompt}

Return ONLY the optimized prompt, without explanations or additional commentary."""

# Prompt Editing Instructions
EDIT_PROMPT_INSTRUCTION = """You are helping to edit an image generation prompt based on user feedback.

Original prompt: {prompt}

User suggestion: {suggestion}

Apply the user's suggestion to the prompt. Return ONLY the modified prompt without explanations."""

# Parameter Generation Instructions
GENERATE_PARAMETERS_INSTRUCTION = """You are generating diverse variations for an image generation batch.

{context_info}

Generate {count} diverse and creative variations. Output ONLY a CSV with these exact parameters as headers:
{headers}

Requirements:
- First row must be the parameter names (comma-separated)
- Generate exactly {count} data rows
- Each value should be unique and creative
- Values should be coherent and work well together
- No explanations, just the CSV data
- Do not use quotes around values unless they contain commas

Special parameter types:
- width/height: Use appropriate image dimensions (512, 768, 1024, 1536, 2048) considering aspect ratios
- steps: Use generation step counts (typically 4-20, with 4 being fast, 8-12 balanced, 16-20 detailed)
- seed: Use random integers or leave empty for random generation
- nsfw: Use 'true' or 'false' (lowercase)
- file_prefix: Use descriptive names matching the content (e.g., "portrait", "landscape", "abstract")
- subfolder: Use logical folder names for organization (e.g., "portraits", "landscapes", "style_tests")

Example format:
parameter1,parameter2,parameter3
value1a,value2a,value3a
value1b,value2b,value3b

Now generate the CSV:"""

# CSV Export Instructions Header
CSV_EXPORT_INSTRUCTIONS = """# ComfyUI Batch Generation CSV Instructions

This CSV file contains parameter values for batch image generation.

## Format:
- First row: Parameter names (matching [parameter] placeholders in your template)
- Following rows: Values for each image variation

## Usage:
1. Create a prompt template in the Batch Generation tab
   Example: "A [animal] wearing a [clothing] in a [location]"

2. Upload this CSV file or paste its contents
3. The system will replace [animal], [clothing], [location] with values from each row
4. Each row generates one unique image

## AI Generation:
This CSV was generated using AI to create diverse, creative variations.
You can regenerate or modify values as needed.

## Parameter Details:
"""

# Example CSV templates for common use cases
EXAMPLE_CSV_TEMPLATES = {
    "characters": """character_type,clothing,location,mood
warrior,armor,battlefield,determined
mage,robes,library,mystical
rogue,leather,shadows,sneaky
paladin,plate armor,temple,noble""",
    
    "landscapes": """time_of_day,weather,location,style
sunrise,clear,mountains,photorealistic
sunset,cloudy,beach,impressionist
night,starry,forest,fantasy
noon,rainy,city,cyberpunk""",
    
    "objects": """object,material,lighting,background
sword,steel,dramatic,dark
potion,glass,magical,mystical
book,leather,warm,library
crystal,gemstone,glowing,cave"""
}

def get_csv_with_instructions(csv_data: str, template: str = "", parameters: list = None) -> str:
    """
    Add instruction header to CSV data
    
    Args:
        csv_data: The CSV data string
        template: Optional template that was used
        parameters: Optional list of parameter names
    
    Returns:
        CSV data with instruction header
    """
    lines = [CSV_EXPORT_INSTRUCTIONS]
    
    if template:
        lines.append(f"## Template Used:\n{template}\n")
    
    if parameters:
        lines.append(f"## Parameters: {', '.join(parameters)}\n")
    
    lines.append("## Data:\n")
    lines.append(csv_data)
    
    return '\n'.join(lines)


def get_example_template(category: str = "characters") -> str:
    """Get an example CSV template by category"""
    return EXAMPLE_CSV_TEMPLATES.get(category, EXAMPLE_CSV_TEMPLATES["characters"])
