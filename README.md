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
- 💾 **Auto-save**: Single "Guardar cambios" button saves JSON, PNG mask, and `annotation_times.txt`, and switching images also auto-saves
- �️ **Output folders**: JSON, masks, and time logs are organized in dedicated subdirectories (annotations/masks/times)
- �📊 **Statistics**: Real-time pixel statistics and completion progress
- 🎊 **Completion Tracking**: Mark images as complete with confetti animation
- 🔍 **Zoom & Pan**: Full image navigation with mouse and keyboard

## Quick Start

### ⚠️ Prerequisito: Node.js debe estar disponible

Si al ejecutar `npm` o `node` en una nueva terminal obtienes errores, sigue la **[Guía de Configuración Completa (SETUP.md)](./SETUP.md)**.

**Solución rápida** (ejecutar como ADMINISTRADOR):
```powershell
.\setup-node-path.ps1
```

Luego cierra **TODAS** las terminales y abre una nueva. Node/npm funcionarán automáticamente.

---

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
6. Use **"Guardar cambios"** to persist JSON, mask, and times (also auto-saves before switching images)

### Saving & auto-save

- The new **"Guardar cambios"** button writes the current image annotations (`.json`), the mask (`_mask.png`), and the global timer log (`annotation_times.txt`) directly inside the open folder.
- Los archivos se organizan automáticamente en:
   - `<carpeta_imágenes>/annotations/*.json`
   - `<carpeta_imágenes>/masks/*_mask.png`
   - `<carpeta_imágenes>/times/annotation_times.txt`
- Navigating to another image (buttons, thumbnail jump, or arrow keys) triggers the same save process automatically before the image changes.
- The timer log keeps both total and active annotation time per image, so you always have an up-to-date history without manual exports.
- Si necesitas rutas personalizadas (por ejemplo, otro disco), abre la sección **Output Folders → Avanzado** en la barra lateral, ajusta las rutas y, si quieres volver a la estructura estándar, usa "Restaurar rutas por defecto".
- Las rutas personalizadas se guardan en `.viewer-config.json` dentro de la carpeta raíz de imágenes, por lo que la configuración se recuerda automáticamente al volver a abrirla.

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
