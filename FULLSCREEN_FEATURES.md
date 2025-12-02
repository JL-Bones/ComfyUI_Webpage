# Fullscreen Viewer - Zoom and Autoplay Features

This document explains the advanced zoom and autoplay features available in the fullscreen image viewer.

## Zoom Controls

### Overview
The fullscreen viewer now supports advanced zoom functionality, allowing you to examine images in detail at up to 500% magnification.

### Zoom Methods

#### 1. Mouse Wheel
- **Scroll up** to zoom in
- **Scroll down** to zoom out
- Smooth incremental zoom with each scroll

#### 2. Keyboard Shortcuts
- Press **`+`** or **`=`** to zoom in
- Press **`-`** or **`_`** to zoom out
- Press **`0`** (zero) to reset to 100%

#### 3. On-Screen Buttons
Located in the bottom center control panel:
- **Magnifying glass with plus** - Zoom in
- **Magnifying glass with minus** - Zoom out
- **Circle with crosshair** - Reset zoom to 100%
- **Zoom level display** - Shows current zoom percentage (100%-500%)

#### 4. Touch Gestures (Mobile/Tablet)
- **Pinch out** (spread two fingers apart) to zoom in
- **Pinch in** (bring two fingers together) to zoom out

### Panning When Zoomed

When zoomed beyond 100%, you can pan around the image:

**Desktop:**
- Click and drag with the mouse
- Cursor changes to "move" icon when draggable
- Cursor changes to "grabbing" while dragging

**Touch Devices:**
- Touch and drag with one finger
- Pan works at any zoom level above 100%

### Zoom Behavior

- **Range:** 100% (fit to screen) to 500% (5× magnification)
- **Auto-reset:** Zoom resets to 100% when navigating to a different image
- **Transform origin:** Zooms from the center of the image
- **Smooth transitions:** 0.2s easing for comfortable viewing
- **Swipe disabled when zoomed:** Prevents accidental navigation while examining details

## Autoplay Controls

### Overview
Autoplay allows automatic progression through images at a configurable interval, perfect for slideshows or reviewing batches.

### Activation

#### Keyboard Shortcut
- Press **`Space`** to toggle play/pause at any time

#### On-Screen Button
Located in the bottom right control panel:
- **Play icon** (triangle) - Start autoplay
- **Pause icon** (two bars) - Stop autoplay
- Icon updates to reflect current state

### Configuration

**Interval Input:**
- Adjustable from **0.5 to 60 seconds**
- Default: **3 seconds**
- Located next to the play/pause button
- Change takes effect on next image transition
- Input field labeled with "s" (seconds) indicator

### Autoplay Behavior

- **Sequential progression:** Advances to next image (wraps to start after last image)
- **Respects manual navigation:** Pauses automatically when you use arrow keys or buttons
- **Resume from position:** Restarts timer from current image when re-enabled
- **Stops on exit:** Automatically stops when closing fullscreen mode
- **Zoom independent:** Works with or without zoom active

### Use Cases

1. **Slideshow Viewing:**
   - Set interval to 5-10 seconds
   - Enable autoplay
   - Lean back and review your gallery

2. **Batch Review:**
   - Set shorter interval (1-2 seconds)
   - Quickly scan through generated variations
   - Pause on interesting results for closer inspection

3. **Comparison Workflow:**
   - Set interval to 3 seconds
   - Zoom in to specific detail
   - Let autoplay cycle through images while maintaining zoom
   - Compare same region across multiple images

4. **Presentation Mode:**
   - Set longer interval (10-15 seconds)
   - Enable autoplay
   - Use as portfolio presentation or demo

## Combined Usage

### Zoom + Autoplay Workflow

The most powerful feature is using both together:

1. **Navigate to first image** in a batch
2. **Zoom in** to an area of interest (e.g., face details at 200%)
3. **Pan** to position the detail in view
4. **Enable autoplay** at 2-3 second interval
5. **Review** the same detail across all images automatically

This is extremely useful for:
- Comparing same features across batch variations
- Quality checking at high magnification
- Finding best results in a large batch
- Spotting artifacts or issues consistently

### Navigation Priority

When both features are active:
- **Manual navigation** (arrow keys, buttons) takes precedence
- **Autoplay pauses** when you navigate manually
- **Zoom persists** across automatic transitions
- **Pan position resets** when image changes (zoom level maintained)

## Fullscreen Controls Summary

### Bottom Center Panel (Zoom)
```
[−] 100% [+] [↺]
```
- `-` Zoom out
- `100%` Current zoom level
- `+` Zoom in
- `↺` Reset zoom

### Bottom Right Panel (Autoplay)
```
[▶] [3.0] s
```
- `▶/⏸` Play/Pause toggle
- `3.0` Interval in seconds (editable)
- `s` Seconds label

### Top Controls
- **Top right:** Image counter (e.g., "5 / 10")
- **Top right (close):** Exit fullscreen (×)

### Side Navigation
- **Left:** Previous image (◀)
- **Right:** Next image (▶)

## Keyboard Reference

| Key | Action |
|-----|--------|
| `Space` | Toggle autoplay |
| `+` or `=` | Zoom in |
| `-` or `_` | Zoom out |
| `0` | Reset zoom to 100% |
| `←` or `A` | Previous image |
| `→` or `D` | Next image |
| `Esc` | Exit fullscreen |

## Touch Gestures Reference

| Gesture | Action |
|---------|--------|
| Pinch out | Zoom in |
| Pinch in | Zoom out |
| Swipe left | Next image (when zoom = 100%) |
| Swipe right | Previous image (when zoom = 100%) |
| Drag | Pan (when zoomed) |

## Tips and Tricks

1. **Quick Detail Check:**
   - Mouse wheel to zoom in quickly
   - Check details without clicking buttons
   - Scroll out to return to full view

2. **Hands-Free Batch Review:**
   - Enable autoplay with suitable interval
   - Zoom if needed
   - Watch hands-free, pause with Space when something catches attention

3. **Mobile Viewing:**
   - Use pinch gestures for precise zoom control
   - Single-finger pan when examining details
   - Swipe between images when fully zoomed out

4. **Presentation Mode:**
   - Enter fullscreen
   - Set autoplay to 8-10 seconds
   - Let it run for automatic portfolio showcase
   - Press Space to pause for questions/discussion

5. **Quality Assurance:**
   - Zoom to 200-300% on critical areas
   - Enable autoplay at 1-2 second intervals
   - Quickly scan for defects across batch
   - Stop immediately when issues found

6. **Comparison Analysis:**
   - Keep zoom and pan consistent
   - Use autoplay to cycle
   - Compare exact same region across images
   - Keyboard navigation (arrows) for manual control

## Technical Notes

- Zoom uses CSS transforms for GPU acceleration
- Smooth transitions with 0.2s ease-out timing
- Pan constraints prevent losing image off-screen
- Touch events use passive: false for pinch-zoom
- Autoplay timer clears on component unmount
- All controls auto-hide after 2 seconds of inactivity
- Mouse movement shows controls instantly
