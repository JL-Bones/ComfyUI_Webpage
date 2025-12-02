# AI Assistant Features - User Guide

## Overview

The ComfyUI Web Interface now includes powerful AI-assisted features for prompt optimization and batch parameter generation. These features help you create better prompts and generate diverse image variations efficiently.

## Supported AI Providers

### 1. **Ollama (Local)**
- Runs on your local machine (port 11434)
- Free and private
- Requires Ollama to be installed and running
- Supports any Ollama model you have installed (llama2, mistral, codellama, etc.)
- **Installation**: Download from [ollama.com](https://ollama.com)

### 2. **Google Gemini (Cloud)**
- Cloud-based API service
- Requires API key (free tier available)
- Supports: `gemini-2.5-flash`, `gemini-2.5-pro`
- **Setup**: Add `GEMINI_API_KEY` to `.env` file

## Setup Instructions

### Ollama Setup

1. **Install Ollama**:
   ```powershell
   # Download and install from ollama.com
   # Or use winget:
   winget install Ollama.Ollama
   ```

2. **Pull a model**:
   ```powershell
   ollama pull llama2
   # or
   ollama pull mistral
   ```

3. **Verify it's running**:
   ```powershell
   ollama list
   ```

4. The web interface will automatically detect available models

### Gemini Setup

1. **Get API Key**:
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key

2. **Create `.env` file** in project root:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. Restart the Flask server

4. Gemini models will now appear in the AI provider dropdown

## Feature 1: AI Prompt Editor

Enhance your prompts with AI assistance.

### Location
- **Single Generation Tab**: Click "✨ Edit with AI" button below the prompt textarea
- **Batch Generation Tab**: Click "✨ Edit with AI" button next to the template input

### How to Use

1. **Enter a prompt** in the prompt field
2. **Click "✨ Edit with AI"** - Opens the AI Prompt Editor modal
3. **Select AI Provider** (Ollama or Gemini)
4. **Select Model** from the dropdown

#### Option A: Optimize Prompt
- Click **"Optimize Prompt"** button
- AI will enhance your prompt with:
  - Better descriptions
  - Quality tags
  - Lighting and composition details
  - Artistic style suggestions
- Result appears in the "AI Result" box

#### Option B: Custom Suggestion
- Enter specific changes in the **"Custom Suggestion"** field
  - Examples: 
    - "make it more dramatic"
    - "add sunset lighting"
    - "change to fantasy style"
- Click **"Apply"** button
- AI applies your suggestion to the prompt

5. **Review the result** in the AI Result textarea
6. **Click "Use This Prompt"** to apply it to your generation form

### Tips
- Start with a basic prompt like "a cat" and let AI expand it
- Use custom suggestions for iterative refinements
- Copy the current prompt to clipboard with the copy button
- The AI preserves parameter placeholders `[like_this]` in batch templates

## Feature 2: AI Parameter Generator

Automatically generate diverse parameter values for batch generation.

### Location
**Batch Generation Tab** → Manual Entry section → **"🤖 AI Generate Values"** button

### How to Use

1. **Create a prompt template** with parameters:
   ```
   A [animal] wearing a [clothing] in a [location]
   ```

2. **Click "🤖 AI Generate Values"** - Opens the AI Parameter Generator modal

3. **Configure generation**:
   - **AI Provider**: Choose Ollama or Gemini
   - **Model**: Select from available models
   - **Number of Variations**: 1-50 (default: 5)
   - **Context to Send**: Choose one:
     - **Template + Custom Context**: Sends full template with your context
     - **Parameters Only + Custom Context**: Sends just parameter names
     - **Custom Context Only**: Sends only your custom instructions

4. **Add custom context** (optional):
   ```
   Focus on fantasy themes
   Use vibrant colors
   Include various times of day
   ```

5. **Click "Generate Parameters"**
   - AI generates CSV data with creative values
   - Result includes instruction header
   - Preview appears in the textarea

6. **Click "Use This Data"** to load into batch generation
   - Automatically switches to "Paste Data" input method
   - Parses CSV and shows count of variations

### Context Options Explained

- **Full (Template + Context)**: Best for coherent variations that match the template structure
- **Parameters Only**: Good when you want AI to focus just on filling specific values
- **Custom Only**: Maximum control - provide exact instructions for what you want

### Example Generations

**Template**: `A [character] in a [setting] wearing [outfit]`

**Generated CSV**:
```csv
character,setting,outfit
wizard,mystical tower,flowing robes
knight,battlefield,shining armor
merchant,bustling market,fine silks
adventurer,dark forest,leather gear
noble,royal palace,elegant gown
```

## Feature 3: CSV Export with Instructions

Download batch data with embedded usage instructions.

### Location
**Batch Generation Tab** → Batch Preview section → **"Download CSV"** button

### How to Use

1. **Configure your batch** (manual, paste, or AI-generated data)
2. **Click "Preview Batch"** to verify
3. **Click "Download CSV"** button (appears after preview)
4. **CSV file is saved** with:
   - Instruction header (commented with #)
   - Template used
   - Parameter names
   - Usage instructions
   - All your data rows

### CSV Format

```csv
# ComfyUI Batch Generation CSV
# Generated: 12/2/2025, 3:45:23 PM
#
# Template: A [animal] wearing a [clothing] in a [location]
# Parameters: animal, clothing, location
# Total variations: 3
#
# Usage Instructions:
# 1. Upload this file in the Batch Generation tab
# 2. Set your desired Width, Height, Steps, and other settings
# 3. Click "Generate Batch" to create all variations
#
# CSV Data:

animal,clothing,location
cat,hat,garden
dog,scarf,beach
bird,cape,mountain
```

### Benefits
- **Self-documenting**: Anyone can understand the file's purpose
- **Reusable**: Keep templates for future use
- **Shareable**: Send to others with clear instructions
- **Version control friendly**: Comments track what was generated

## Performance Notes

### Ollama
- **First generation**: May be slow (loading model into memory)
- **Subsequent generations**: Fast (model stays loaded)
- **Auto-unload**: Models unload immediately after use to free memory
- **Recommended**: 8GB+ RAM for best performance

### Gemini
- **Speed**: Generally fast (cloud-based)
- **Rate limits**: Free tier has limits
- **Network**: Requires internet connection

## Troubleshooting

### "No models available" (Ollama)
1. Check Ollama is running: `ollama list`
2. Pull a model: `ollama pull llama2`
3. Restart Flask server
4. Check Ollama URL in `app.py` (default: `http://127.0.0.1:11434`)

### "Gemini API key not configured"
1. Verify `.env` file exists in project root
2. Check key format: `GEMINI_API_KEY=your_key_here`
3. Restart Flask server
4. Verify key is valid at Google AI Studio

### "AI is thinking..." never completes
1. **Ollama**: Check console for errors, ensure model is downloaded
2. **Gemini**: Check internet connection and API key
3. Try a different model
4. Check Flask console for error messages

### Generated CSV won't parse
1. AI sometimes adds extra formatting - manually clean the CSV
2. Remove any markdown code blocks (```csv)
3. Ensure first line is parameter names
4. Check for matching parameter counts in all rows

## Best Practices

### Prompt Optimization
- Start simple, let AI add complexity
- Use "Optimize" for enhancement, "Suggest" for specific changes
- Iterate: optimize → suggest tweaks → optimize again
- Copy good results for reuse

### Parameter Generation
- Use 5-10 variations for testing
- Provide context for better coherence
- Review and edit generated values if needed
- Save successful templates as CSV files

### Workflow
1. **Create base prompt** in Single Generation
2. **Test with AI optimization** to find good style
3. **Convert to template** with `[parameters]`
4. **Generate parameters** with AI
5. **Preview batch** to verify
6. **Download CSV** for future use
7. **Generate batch** with queue system

## API Endpoints

For developers integrating AI features:

- `GET /api/ai/models` - Get available models
- `POST /api/ai/optimize` - Optimize a prompt
- `POST /api/ai/suggest` - Apply suggestion to prompt
- `POST /api/ai/generate-parameters` - Generate batch parameters

See `app.py` and `ai_assistant.py` for implementation details.

## Privacy & Security

- **Ollama**: 100% local, no data leaves your machine
- **Gemini**: Prompts sent to Google's API
- **API Keys**: Stored in `.env` (add to `.gitignore`)
- **No logging**: Your prompts are not saved by this application

## Future Enhancements

Potential additions:
- Support for more AI providers (OpenAI, Anthropic, etc.)
- Prompt history and favorites
- Advanced parameter templates
- Image-to-prompt reverse engineering
- Style transfer suggestions

## Support

For issues or questions:
- Check console logs for errors
- Verify AI provider is accessible
- Review this guide's troubleshooting section
- Check project README for updates
