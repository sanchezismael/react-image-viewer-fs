const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Configurar CORS para permitir peticiones desde el frontend
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

/**
 * Endpoint para listar contenido de un directorio
 * GET /api/browse?path=C:/ruta/carpeta
 */
app.get('/api/browse', (req, res) => {
  try {
    const dirPath = req.query.path;
    
    if (!dirPath) {
      return res.status(400).json({ error: 'Path parameter is required' });
    }

    // Seguridad básica: verificar que el path existe
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // Leer contenido del directorio
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    const result = {
      currentPath: dirPath,
      parent: path.dirname(dirPath),
      items: items.map(item => ({
        name: item.name,
        path: path.join(dirPath, item.name),
        isDirectory: item.isDirectory(),
        isFile: item.isFile()
      }))
    };

    res.json(result);
  } catch (error) {
    console.error('Error browsing directory:', error);
    res.status(500).json({ error: 'Failed to read directory', message: error.message });
  }
});

/**
 * Endpoint para obtener archivos de imagen y JSON de una carpeta
 * GET /api/files?path=C:/ruta/carpeta
 */
app.get('/api/files', (req, res) => {
  try {
    const dirPath = req.query.path;
    
    if (!dirPath) {
      return res.status(400).json({ error: 'Path parameter is required' });
    }

    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // Leer todos los archivos
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // Filtrar imágenes (excluyendo máscaras) y archivos JSON
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const images = [];
    const jsonFiles = [];

    items.forEach(item => {
      if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        const fullPath = path.join(dirPath, item.name);
        
        if (imageExtensions.includes(ext) && !item.name.endsWith('_mask.png')) {
          images.push({
            name: item.name,
            path: fullPath,
            url: `/api/image?path=${encodeURIComponent(fullPath)}`
          });
        } else if (ext === '.json') {
          jsonFiles.push({
            name: item.name,
            path: fullPath
          });
        }
      }
    });

    // Ordenar alfabéticamente
    images.sort((a, b) => a.name.localeCompare(b.name));
    jsonFiles.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      path: dirPath,
      images,
      jsonFiles
    });
  } catch (error) {
    console.error('Error loading files:', error);
    res.status(500).json({ error: 'Failed to load files', message: error.message });
  }
});

/**
 * Endpoint para servir una imagen específica
 * GET /api/image?path=C:/ruta/imagen.jpg
 */
app.get('/api/image', (req, res) => {
  try {
    const imagePath = req.query.path;
    
    if (!imagePath) {
      return res.status(400).json({ error: 'Path parameter is required' });
    }

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const stats = fs.statSync(imagePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    // Servir el archivo con el content-type apropiado
    const ext = path.extname(imagePath).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp'
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    const fileStream = fs.createReadStream(imagePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image', message: error.message });
  }
});

/**
 * Endpoint para leer el contenido de un archivo JSON
 * GET /api/json?path=C:/ruta/archivo.json
 */
app.get('/api/json', (req, res) => {
  try {
    const jsonPath = req.query.path;
    
    if (!jsonPath) {
      return res.status(400).json({ error: 'Path parameter is required' });
    }

    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'JSON file not found' });
    }

    const content = fs.readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(content);
    
    res.json(data);
  } catch (error) {
    console.error('Error reading JSON:', error);
    res.status(500).json({ error: 'Failed to read JSON file', message: error.message });
  }
});

/**
 * Endpoint para guardar un archivo JSON
 * POST /api/save-json
 * Body: { path: string, data: object }
 */
app.post('/api/save-json', (req, res) => {
  try {
    const { path: filePath, data } = req.body;
    
    if (!filePath || !data) {
      return res.status(400).json({ error: 'Path and data are required' });
    }

    const jsonString = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonString, 'utf-8');
    
    res.json({ success: true, message: 'JSON file saved successfully' });
  } catch (error) {
    console.error('Error saving JSON:', error);
    res.status(500).json({ error: 'Failed to save JSON file', message: error.message });
  }
});

/**
 * Endpoint para guardar una imagen (máscara)
 * POST /api/save-image
 * Body: { path: string, base64: string }
 */
app.post('/api/save-image', (req, res) => {
  try {
    const { path: filePath, base64 } = req.body;
    
    if (!filePath || !base64) {
      return res.status(400).json({ error: 'Path and base64 data are required' });
    }

    // Extraer datos base64 (remover prefijo data:image/png;base64,)
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    fs.writeFileSync(filePath, buffer);
    
    res.json({ success: true, message: 'Image saved successfully' });
  } catch (error) {
    console.error('Error saving image:', error);
    res.status(500).json({ error: 'Failed to save image', message: error.message });
  }
});

/**
 * Endpoint para obtener drives/discos disponibles (Windows)
 */
app.get('/api/drives', (req, res) => {
  try {
    if (process.platform === 'win32') {
      // En Windows, listar drives disponibles
      const drives = [];
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      
      for (const letter of letters) {
        const drivePath = `${letter}:\\`;
        try {
          if (fs.existsSync(drivePath)) {
            drives.push({
              name: `${letter}:`,
              path: drivePath,
              isDirectory: true
            });
          }
        } catch (e) {
          // Drive no accesible, continuar
        }
      }
      
      res.json({ drives });
    } else {
      // En Linux/Mac, empezar desde home o root
      res.json({
        drives: [
          { name: 'Home', path: require('os').homedir(), isDirectory: true },
          { name: 'Root', path: '/', isDirectory: true }
        ]
      });
    }
  } catch (error) {
    console.error('Error listing drives:', error);
    res.status(500).json({ error: 'Failed to list drives', message: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📁 File system API ready\n`);
});
