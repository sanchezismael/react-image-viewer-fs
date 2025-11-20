const API_BASE_URL = '/api';

export interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface BrowseResponse {
  currentPath: string;
  parent: string;
  items: DirectoryItem[];
}

export interface ImageFile {
  name: string;
  path: string;
  url: string;
  modifiedAt?: string;
}

export interface JsonFile {
  name: string;
  path: string;
}

export interface FilesResponse {
  path: string;
  images: ImageFile[];
  jsonFiles: JsonFile[];
}

export interface Drive {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface DrivesResponse {
  drives: Drive[];
}

export interface DeleteImagePayload {
  imagePath: string;
  annotationPath?: string;
  maskPath?: string;
}

export interface DeleteImageResponse {
  success: boolean;
  deleted: {
    image: boolean;
    annotation: boolean;
    mask: boolean;
  };
}

let drivesCache: Drive[] | null = null;
let drivesPromise: Promise<Drive[]> | null = null;

/**
 * Obtener lista de drives disponibles (cacheada para evitar llamadas duplicadas en dev/StrictMode)
 */
export async function getDrives(): Promise<Drive[]> {
  if (drivesCache) return drivesCache;
  if (drivesPromise) return drivesPromise;

  drivesPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/drives`);
      if (!response.ok) {
        throw new Error(`Failed to fetch drives: ${response.statusText}`);
      }
      const data: DrivesResponse = await response.json();
      drivesCache = data.drives;
      return data.drives;
    } catch (error) {
      console.error('Error fetching drives:', error);
      // limpiar para reintento en futuras llamadas
      drivesPromise = null;
      throw error;
    }
  })();

  return drivesPromise;
}

/**
 * Navegar por un directorio espec├¡fico
 */
export async function browseDirectory(dirPath: string): Promise<BrowseResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/browse?path=${encodeURIComponent(dirPath)}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to browse directory: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error browsing directory:', error);
    throw error;
  }
}

/**
 * Obtener todos los archivos de imagen y JSON de un directorio
 */
export async function getFiles(dirPath: string): Promise<FilesResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/files?path=${encodeURIComponent(dirPath)}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to load files: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading files:', error);
    throw error;
  }
}

/**
 * Obtener la URL para mostrar una imagen
 */
export function getImageUrl(imagePath: string): string {
  return `${API_BASE_URL}/image?path=${encodeURIComponent(imagePath)}`;
}

/**
 * Leer contenido de un archivo JSON
 */
export async function readJsonFile(jsonPath: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE_URL}/json?path=${encodeURIComponent(jsonPath)}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to read JSON: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error reading JSON file:', error);
    throw error;
  }
}

/**
 * Guardar datos en un archivo JSON
 */
export async function saveJsonFile(filePath: string, data: any): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/save-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: filePath, data }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to save JSON: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error saving JSON file:', error);
    throw error;
  }
}

/**
 * Guardar una imagen (m├íscara) en formato base64
 */
export async function saveImageFile(filePath: string, base64Data: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/save-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: filePath, base64: base64Data }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to save image: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error saving image file:', error);
    throw error;
  }
}

/**
 * Leer contenido de un archivo de texto
 */
export async function readTextFile(filePath: string): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/text?path=${encodeURIComponent(filePath)}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to read text: ${response.statusText}`);
    }
    const data = await response.json();
    return data.content;
  } catch (error) {
    console.error('Error reading text file:', error);
    throw error;
  }
}

/**
 * Guardar un archivo de texto plano
 */
export async function saveTextFile(filePath: string, content: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/save-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: filePath, content }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to save text file: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error saving text file:', error);
    throw error;
  }
}

/**
 * Eliminar una imagen y sus archivos asociados
 */
export async function deleteImageAssets(payload: DeleteImagePayload): Promise<DeleteImageResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/delete-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to delete image: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
}
