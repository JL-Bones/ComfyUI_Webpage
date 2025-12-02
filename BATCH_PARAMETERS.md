# Batch Generation - Per-Image Parameter Control

This document explains the advanced per-image parameter control feature for batch generation.

## Overview

In addition to the template-based prompt replacement (e.g., `[parameter]` syntax), you can now control **any generation parameter on a per-image basis** including:

- Width
- Height
- Steps
- Seed
- File Prefix
- Output Folder (Subfolder)
- NSFW Mode

## How It Works

### 1. Enable Per-Image Control

Next to each parameter in the Batch Generation form, you'll find a checkbox. When checked:
- An additional input field appears below the parameter
- The default parameter input becomes disabled
- Each image in the batch can have its own value for that parameter

### 2. Provide Values

There are two ways to provide per-image parameter values:

#### Method A: Manual Entry (Comma-Separated)
When using the "Manual Entry" input method:
1. Check the parameter checkbox
2. Enter comma-separated values in the parameter input field
3. Number of values must match the number of images

**Example:**
```
Prompt Template: A [animal] in a [location]

Parameters (3 images):
- animal: cat, dog, bird
- location: garden, park, tree

Checked Width with values: 512, 768, 1024
Checked Steps with values: 4, 8, 12

Result:
- Image 1: "A cat in a garden" - 512px wide, 4 steps
- Image 2: "A dog in a park" - 768px wide, 8 steps  
- Image 3: "A bird in a tree" - 1024px wide, 12 steps
```

#### Method B: CSV/JSON Columns
When using "Paste Data" or "Upload File" methods:
1. Add columns with these exact names to your CSV/JSON:
   - `width` - Image width in pixels
   - `height` - Image height in pixels
   - `steps` - Number of sampling steps
   - `seed` - Random seed (number)
   - `file_prefix` - Filename prefix string
   - `subfolder` - Output folder path
   - `nsfw` - true/false for NSFW mode

**CSV Example:**
```csv
subject,clothing,location,width,height,steps,seed,file_prefix,subfolder,nsfw
cat,sweater,garden,512,512,4,12345,cat_images,animals,false
dog,hat,park,768,768,8,67890,dog_images,animals,false
bird,scarf,tree,1024,1024,12,11111,bird_images,animals,false
```

**JSON Example:**
```json
[
  {
    "subject": "cat",
    "clothing": "sweater",
    "location": "garden",
    "width": 512,
    "height": 512,
    "steps": 4,
    "seed": 12345,
    "file_prefix": "cat_images",
    "subfolder": "animals",
    "nsfw": false
  },
  {
    "subject": "dog",
    "clothing": "hat",
    "location": "park",
    "width": 768,
    "height": 768,
    "steps": 8,
    "seed": 67890,
    "file_prefix": "dog_images",
    "subfolder": "animals",
    "nsfw": false
  }
]
```

### 3. Parameter Priority

When a parameter checkbox is checked:
1. **Per-image values** from the parameterized input or CSV columns take priority
2. **Default values** from the main parameter inputs are ignored for that parameter
3. **Unchecked parameters** use the default value for all images

This allows you to mix-and-match:
- Some parameters vary per-image (checked)
- Other parameters stay constant (unchecked)

## Use Cases

### 1. Progressive Resolution Testing
Generate the same prompt at different resolutions:
```
Template: A futuristic city at sunset

Check Width: 512, 768, 1024, 1536
Check Height: 512, 768, 1024, 1536
Steps: 4 (shared)

Result: 4 images at progressively higher resolutions
```

### 2. Step Comparison
Compare generation quality at different step counts:
```
Template: A detailed portrait of a [character]

character: warrior, mage, rogue, archer
Check Steps: 4, 8, 12, 16
Width/Height: 1024 (shared)

Result: 4 images showing quality progression
```

### 3. Seed Variations
Generate multiple variations of the same prompt:
```
Template: A mystical forest with glowing mushrooms

Check Seed: 12345, 67890, 11111, 22222, 33333
All other parameters: shared

Result: 5 different interpretations of the same prompt
```

### 4. Organized Output
Automatically organize images into folders:
```
CSV with subfolder column:
animal,subfolder
cat,animals/felines
dog,animals/canines
bird,animals/avian
fish,animals/aquatic

Result: Images automatically sorted into category folders
```

### 5. Custom Naming
Generate images with descriptive filenames:
```
Check File Prefix: sunset_beach, sunset_mountain, sunset_desert, sunset_ocean

Result: Files named:
- sunset_beach0000.png
- sunset_mountain0000.png
- sunset_desert0000.png
- sunset_ocean0000.png
```

### 6. Mixed NSFW Content
Control NSFW mode per-image:
```
CSV with nsfw column:
subject,location,nsfw
person,office,false
person,gym,false
person,beach,true
person,bedroom,true

Result: Appropriate NSFW flag for each scenario
```

## Preview Feature

The batch preview shows all parameterized values:
- Displays the resolved prompt for each image
- Shows dimension badges (width×height)
- Displays steps, seed if specified
- Shows file prefix and subfolder if set
- Highlights NSFW mode with red badge

This lets you verify everything is correct before generating.

## Tips

1. **Start Simple**: Begin with just prompt parameters, then add per-image control as needed
2. **Use CSV for Complex Batches**: Easier to manage many parameters in spreadsheet format
3. **Test with Preview**: Always preview before generating large batches
4. **Organize with Folders**: Use subfolder parameter to auto-sort outputs
5. **Seed for Consistency**: Use same seed with different parameters to isolate effects
6. **Empty = Default**: Leave parameter inputs empty to use unchecked default values

## Example Files

See these files in the project root:
- `example_batch.csv` - Basic batch without per-image parameters
- `example_batch.json` - JSON format example
- `example_batch_parameterized.csv` - Complete example with all parameters

## AI-Assisted Parameter Generation

The "🤖 AI Generate Values" button uses AI to automatically create parameter variations for your batch. The AI is **context-aware** and considers your current batch settings when generating values.

### What the AI Knows

When generating parameters, the AI receives information about:
- **Image dimensions:** Current width and height settings
- **Generation steps:** Your configured step count
- **Seed value:** Whether you're using a specific seed or random
- **NSFW mode:** Current NSFW setting
- **File prefix:** Your naming convention
- **Output folder:** Target folder for organization
- **Varied parameters:** Which checkboxes are enabled for per-image variation

### How It Helps

**Smart Dimension Suggestions:**
- If width/height are checked for variation, AI suggests appropriate aspect ratios
- Takes into account your base dimensions (e.g., if you set 1024×1024, AI might suggest 512×512, 768×768, 1024×1024, 1024×1536)
- Considers common use cases (portrait, landscape, square)

**Intelligent Step Counts:**
- If steps are varied, AI suggests balanced ranges (e.g., 4 for speed, 8-12 for quality, 16-20 for detail)
- Takes into account your base step setting as a reference point

**Organized File Management:**
- If file_prefix is varied, AI creates descriptive names matching content
- If subfolder is varied, AI suggests logical folder structures for organization

**NSFW Awareness:**
- Considers your NSFW mode when generating appropriate content
- Can vary NSFW per-image with appropriate scene context

### Usage Example

1. Set base parameters: 1024×1024, 8 steps
2. Check "Width" and "Height" for variation
3. Enter template: "A [style] painting of [subject]"
4. Click "🤖 AI Generate Values"
5. AI generates CSV with:
   - style and subject variations
   - Appropriate dimension pairs (512×512, 768×1024, 1024×768, 1024×1536, 1536×1024)
   - Maintains your 8 steps for all (unless steps is also checked)

## Technical Notes

- Parameter values must match the count of images being generated
- Type conversion is automatic (numbers parsed, booleans from true/false strings)
- Invalid values fall back to defaults with warnings
- Backend processes each image with its specific parameters
- Queue system handles mixed parameter batches seamlessly
- All parameters are saved in metadata for reference
- AI parameter generation respects current batch configuration
