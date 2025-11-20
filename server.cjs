const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const fsp = fs.promises;
const app = express();

const PORT = Number(process.env.PORT || 3001);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const ALLOWED_ROOT = process.env.ALLOWED_ROOT ? path.resolve(process.env.ALLOWED_ROOT) : null;

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const ALLOWED_TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.log'];

app.use(cors({
  origin: ALLOWED_ORIGIN,
  credentials: true
}));

// Aumentar el limite de tamano del payload para imagenes grandes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const isSubPath = (base, target) => {
  const relative = path.relative(base, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const normalizeAndValidatePath = (targetPath) => {
  if (!targetPath || typeof targetPath !== 'string') {
    const err = new Error('Path parameter is required');
    err.statusCode = 400;
    throw err;
  }
  const resolved = path.resolve(targetPath);
  if (ALLOWED_ROOT && !isSubPath(ALLOWED_ROOT, resolved)) {
    const err = new Error('Path is outside the allowed root');
    err.statusCode = 403;
    throw err;
  }
  return resolved;
};

const ensureDirectory = async (candidatePath) => {
  const resolved = normalizeAndValidatePath(candidatePath);
  const stats = await fsp.stat(resolved).catch((error) => {
    if (error.code === 'ENOENT') {
      const err = new Error('Directory not found');
      err.statusCode = 404;
      throw err;
    }
    throw error;
  });
  if (!stats.isDirectory()) {
    const err = new Error('Path is not a directory');
    err.statusCode = 400;
    throw err;
  }
  return resolved;
};

const ensureFile = async (candidatePath, allowedExtensions) => {
  const resolved = normalizeAndValidatePath(candidatePath);
  const ext = path.extname(resolved).toLowerCase();
  if (allowedExtensions && !allowedExtensions.includes(ext)) {
    const err = new Error('Invalid file extension');
    err.statusCode = 400;
    throw err;
  }

  const stats = await fsp.stat(resolved).catch((error) => {
    if (error.code === 'ENOENT') {
      const err = new Error('File not found');
      err.statusCode = 404;
      throw err;
    }
    throw error;
  });

  if (!stats.isFile()) {
    const err = new Error('Path is not a file');
    err.statusCode = 400;
    throw err;
  }

  return { resolved, stats };
};

const handleError = (res, error, fallbackMessage) => {
  const status = error.statusCode || 500;
  const message = error.message || fallbackMessage;
  if (status >= 500) {
    console.error(message, error);
  }
  return res.status(status).json({ error: message });
};

/**
 * Endpoint para listar contenido de un directorio
 * GET /api/browse?path=C:/ruta/carpeta
 */
app.get('/api/browse', async (req, res) => {
  try {
    const dirPath = await ensureDirectory(req.query.path);
    const items = await fsp.readdir(dirPath, { withFileTypes: true });

    res.json({
      currentPath: dirPath,
      parent: path.dirname(dirPath),
      items: items.map((item) => ({
        name: item.name,
        path: path.join(dirPath, item.name),
        isDirectory: item.isDirectory(),
        isFile: item.isFile(),
      })),
    });
  } catch (error) {
    handleError(res, error, 'Failed to read directory');
  }
});

/**
 * Endpoint para obtener archivos de imagen y JSON de una carpeta
 * GET /api/files?path=C:/ruta/carpeta
 */
app.get('/api/files', async (req, res) => {
  try {
    const dirPath = await ensureDirectory(req.query.path);
    const items = await fsp.readdir(dirPath, { withFileTypes: true });

    const images = [];
    const jsonFiles = [];

    // Hard guard to avoid blowing up on huge directories
    const MAX_ENTRIES = 2000;
    let processed = 0;
    const statPromises = [];

    for (const item of items) {
      if (processed >= MAX_ENTRIES) break;
      if (!item.isFile()) continue;
      if (item.name.startsWith('.')) continue;

      const ext = path.extname(item.name).toLowerCase();

      const isImage = ALLOWED_IMAGE_EXTENSIONS.includes(ext) && !item.name.endsWith('_mask.png');
      const isJson = ext === '.json';
      if (!isImage && !isJson) continue;

      const fullPath = path.join(dirPath, item.name);
      processed += 1;
      statPromises.push(
        (async () => {
          const fileStats = await fsp.stat(fullPath);
          if (isImage) {
            images.push({
              name: item.name,
              path: fullPath,
              url: `/api/image?path=${encodeURIComponent(fullPath)}`,
              modifiedAt: fileStats.mtime.toISOString(),
            });
          } else if (isJson) {
            jsonFiles.push({ name: item.name, path: fullPath });
          }
        })()
      );
    }

    await Promise.all(statPromises);

    images.sort((a, b) => a.name.localeCompare(b.name));
    jsonFiles.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      path: dirPath,
      images,
      jsonFiles,
    });
  } catch (error) {
    handleError(res, error, 'Failed to load files');
  }
});

/**
 * Endpoint para servir una imagen especifica
 * GET /api/image?path=C:/ruta/imagen.jpg
 */
app.get('/api/image', async (req, res) => {
  try {
    const { resolved } = await ensureFile(req.query.path, ALLOWED_IMAGE_EXTENSIONS);

    const ext = path.extname(resolved).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const fileStream = fs.createReadStream(resolved);
    fileStream.on('error', (error) => handleError(res, error, 'Failed to serve image'));
    fileStream.pipe(res);
  } catch (error) {
    handleError(res, error, 'Failed to serve image');
  }
});

/**
 * Endpoint para leer el contenido de un archivo JSON
 * GET /api/json?path=C:/ruta/archivo.json
 */
app.get('/api/json', async (req, res) => {
  try {
    const { resolved } = await ensureFile(req.query.path, ['.json']);
    const content = await fsp.readFile(resolved, 'utf-8');
    const data = JSON.parse(content);
    res.json(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      error.statusCode = 400;
      error.message = 'Invalid JSON file';
    }
    handleError(res, error, 'Failed to read JSON file');
  }
});

/**
 * Endpoint para guardar un archivo JSON
 * POST /api/save-json
 * Body: { path: string, data: object }
 */
app.post('/api/save-json', async (req, res) => {
  try {
    const { path: filePath, data } = req.body;

    if (!filePath || data === undefined) {
      return res.status(400).json({ error: 'Path and data are required' });
    }

    const resolved = normalizeAndValidatePath(filePath);
    if (path.extname(resolved).toLowerCase() !== '.json') {
      return res.status(400).json({ error: 'Invalid file extension. Only .json allowed.' });
    }

    const jsonString = JSON.stringify(data, null, 2);
    await fsp.mkdir(path.dirname(resolved), { recursive: true });
    await fsp.writeFile(resolved, jsonString, 'utf-8');

    res.json({ success: true, message: 'JSON file saved successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to save JSON file');
  }
});

/**
 * Endpoint para guardar una imagen (mascara)
 * POST /api/save-image
 * Body: { path: string, base64: string }
 */
app.post('/api/save-image', async (req, res) => {
  try {
    const { path: filePath, base64 } = req.body;

    if (!filePath || !base64) {
      return res.status(400).json({ error: 'Path and base64 data are required' });
    }

    const resolved = normalizeAndValidatePath(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file extension. Only images allowed.' });
    }

    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    await fsp.mkdir(path.dirname(resolved), { recursive: true });
    await fsp.writeFile(resolved, buffer);

    res.json({ success: true, message: 'Image saved successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to save image');
  }
});

/**
 * Endpoint para leer un archivo de texto
 * GET /api/text
 * Query: { path: string }
 */
app.get('/api/text', async (req, res) => {
  try {
    const { resolved } = await ensureFile(req.query.path, ALLOWED_TEXT_EXTENSIONS);
    const content = await fsp.readFile(resolved, 'utf-8');
    res.json({ content });
  } catch (error) {
    handleError(res, error, 'Failed to read text file');
  }
});

/**
 * Endpoint para guardar un archivo de texto plano
 * POST /api/save-text
 * Body: { path: string, content: string }
 */
app.post('/api/save-text', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;

    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ error: 'Path and content are required' });
    }

    const resolved = normalizeAndValidatePath(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_TEXT_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file extension. Only text files allowed.' });
    }

    await fsp.mkdir(path.dirname(resolved), { recursive: true });
    await fsp.writeFile(resolved, content, 'utf-8');

    res.json({ success: true, message: 'Text file saved successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to save text file');
  }
});

/**
 * Endpoint para eliminar una imagen y sus archivos relacionados
 * POST /api/delete-image
 * Body: { imagePath: string, annotationPath?: string, maskPath?: string }
 */
app.post('/api/delete-image', async (req, res) => {
  try {
    const { imagePath, annotationPath, maskPath } = req.body;

    if (!imagePath) {
      return res.status(400).json({ error: 'imagePath is required' });
    }

    const { resolved: resolvedImage } = await ensureFile(imagePath, ALLOWED_IMAGE_EXTENSIONS);

    const deleteIfPossible = async (candidatePath) => {
      if (!candidatePath) return false;
      try {
        const { resolved } = await ensureFile(candidatePath);
        await fsp.unlink(resolved);
        return true;
      } catch (error) {
        if (error.statusCode === 404) return false;
        throw error;
      }
    };

    await fsp.unlink(resolvedImage);

    const deleted = {
      image: true,
      annotation: await deleteIfPossible(annotationPath),
      mask: await deleteIfPossible(maskPath),
    };

    res.json({ success: true, deleted });
  } catch (error) {
    handleError(res, error, 'Failed to delete image');
  }
});

/**
 * Endpoint para obtener drives/discos disponibles (Windows)
 */
app.get('/api/drives', async (req, res) => {
  try {
    if (process.platform === 'win32') {
      const TIMEOUT_MS = 200; // fails fast on slow/unmounted drives
      const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

      // Cachea durante 30s para evitar escaneos repetidos si se abre varias veces el modal
      if (!app.locals.drivesCache) {
        app.locals.drivesCache = { ts: 0, data: [] };
      }
      const cacheAge = Date.now() - app.locals.drivesCache.ts;
      if (cacheAge < 30_000 && app.locals.drivesCache.data.length > 0) {
        return res.json({ drives: app.locals.drivesCache.data });
      }

      const withTimeout = (promise, ms) =>
        Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
        ]);

      const driveChecks = await Promise.all(
        letters.map(async (letter) => {
          const drivePath = `${letter}:\\`;
          try {
            await withTimeout(fsp.access(drivePath), TIMEOUT_MS);
            return {
              name: `${letter}:`,
              path: drivePath,
              isDirectory: true,
            };
          } catch {
            return null;
          }
        })
      );

      const drives = driveChecks.filter(Boolean);
      app.locals.drivesCache = { ts: Date.now(), data: drives };
      return res.json({ drives });
    }

    res.json({
      drives: [
        { name: 'Home', path: require('os').homedir(), isDirectory: true },
        { name: 'Root', path: '/', isDirectory: true },
      ],
    });
  } catch (error) {
    handleError(res, error, 'Failed to list drives');
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log('File system API ready');
});
