<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# React Image Viewer with File System Backend

Image annotation tool with polygon drawing, timer tracking, and local file system integration.

## Features
- Direct file system access: browse and load images from local directories without uploads
- Time tracking: automatic timer for annotation time (total and active time)
- Polygon annotations: draw and edit polygon annotations on images
- Custom classes: define multiple annotation classes with custom colors
- Auto-save: single "Guardar cambios" button saves JSON, PNG mask, and `annotation_times.txt`; switching images auto-saves too
- Output folders: JSON, masks, and time logs organized in dedicated subdirectories (annotations/masks/times)
- Statistics: real-time pixel statistics and completion progress
- Completion tracking: mark images as complete with confetti animation
- Zoom and pan with mouse and keyboard

## Quick Start

### Prerequisite: Node.js must be available

If running `npm` or `node` fails in a new terminal, follow the **[Complete Setup Guide (SETUP.md)](./SETUP.md)**.

Quick fix (run as Administrator):
```powershell
.\setup-node-path.ps1
```

Then close all terminals and open a new one. Node/npm should be available automatically.

---

### Option 1: Double-click launcher (easiest)

Simply double-click:
- `start-app.bat` (Windows Batch)
- `start-app.ps1` (PowerShell - right-click and select "Run with PowerShell")

Both scripts:
- Ensure `node` is on PATH (adds `C:\Program Files\nodejs` if needed)
- Run `npm install` automatically the first time
- Launch `npm run dev` directly on Windows (no WSL required)

### Option 2: Manual start

Prerequisites on Windows: Node.js 18 LTS or newer installed.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the application:
   ```bash
   npm run dev
   ```
3. Open your browser:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## Usage

1. Click **"Select Folder"** to browse your local file system
2. Navigate to a folder containing images
3. Click **"Select"** to load all images from that folder
4. Add annotation classes and start drawing polygons
5. Use arrow keys to navigate between images
6. Use **"Guardar cambios"** to persist JSON, mask, and times (auto-saves before switching images)

### Saving and auto-save

- The **"Guardar cambios"** button writes the current image annotations (`.json`), the mask (`_mask.png`), and the global timer log (`annotation_times.txt`) inside the open folder.
- Files are organized in:
   - `<image_folder>/annotations/*.json`
   - `<image_folder>/masks/*_mask.png`
   - `<image_folder>/times/annotation_times.txt`
- Navigating to another image (buttons, jump, or arrow keys) triggers the same save process automatically.
- The timer log keeps both total and active annotation time per image.
- For custom output paths, open **Output Folders > Avanzado** in the sidebar, adjust the paths, and use "Restaurar rutas por defecto" to return to the default structure.
- Custom paths are stored in `.viewer-config.json` inside the root image folder so they persist when you reopen it.

## Keyboard Shortcuts

- Arrow Left/Right: navigate between images
- D: toggle drawing mode
- Delete/Backspace: delete selected annotation
- Mouse Wheel: zoom in/out
- Click + Drag: pan image

## Technology Stack

- Frontend: React 19, TypeScript, Vite
- Backend: Express.js, Node.js
- Styling: Tailwind CSS
