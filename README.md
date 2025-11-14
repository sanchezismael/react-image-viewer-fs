<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# React Image Viewer with File System Backend

Image annotation tool with polygon drawing, timer tracking, and local file system integration.

## Features

- 🖼️ **Direct File System Access**: Browse and load images from local directories without uploads
- ⏱️ **Time Tracking**: Automatic timer for annotation time (total and active time)
- ✏️ **Polygon Annotations**: Draw and edit polygon annotations on images
- 🎨 **Custom Classes**: Define multiple annotation classes with custom colors
- 💾 **Auto-save**: Automatically saves JSON annotations and PNG masks to source directory
- 📊 **Statistics**: Real-time pixel statistics and completion progress
- 🎊 **Completion Tracking**: Mark images as complete with confetti animation
- 🔍 **Zoom & Pan**: Full image navigation with mouse and keyboard

## Quick Start

### Option 1: Double-click Launcher (Easiest)

Simply double-click on:
- **`start-app.bat`** (Windows Batch)
- **`start-app.ps1`** (PowerShell - right-click → Run with PowerShell)

Ambos scripts:
- Aseguran que `node` esté disponible (añaden `C:\Program Files\nodejs` al PATH si hace falta).
- Ejecutan `npm install` automáticamente la primera vez.
- Lanzan `npm run dev` directamente en Windows (sin WSL).

### Option 2: Manual Start

**Prerequisites en Windows:** Tener Node.js 18 LTS o superior instalado (MSI oficial o `winget install OpenJS.NodeJS.LTS`).

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
6. Annotations are auto-saved as JSON and PNG masks in the original folder

## Keyboard Shortcuts

- **Arrow Left/Right**: Navigate between images
- **D**: Toggle drawing mode
- **Delete/Backspace**: Delete selected annotation
- **Mouse Wheel**: Zoom in/out
- **Click + Drag**: Pan image

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Express.js, Node.js
- **Styling**: Tailwind CSS
