import React, { useState, useEffect } from 'react';
import { getDrives, browseDirectory, DirectoryItem, Drive } from '../utils/api';
import { FolderIcon, ChevronRightIcon, HardDriveIcon, SpinnerIcon, HomeIcon } from './icons';

interface DirectoryBrowserProps {
  onSelectDirectory: (path: string) => void;
  onClose: () => void;
}

const DirectoryBrowser: React.FC<DirectoryBrowserProps> = ({ onSelectDirectory, onClose }) => {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);

  // Cargar drives al montar el componente
  useEffect(() => {
    loadDrives();
  }, []);

  const loadDrives = async () => {
    setLoading(true);
    setError(null);
    try {
      const drivesList = await getDrives();
      setDrives(drivesList);
      setCurrentPath('');
      setItems([]);
      setBreadcrumbs([]);
    } catch (err) {
      setError('Failed to load drives');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const navigateToPath = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await browseDirectory(path);
      setCurrentPath(response.currentPath);
      
      // Filtrar solo directorios
      const directories = response.items.filter(item => item.isDirectory);
      setItems(directories);
      
      // Actualizar breadcrumbs
      updateBreadcrumbs(response.currentPath);
    } catch (err) {
      setError(`Failed to access directory: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateBreadcrumbs = (path: string) => {
    if (!path) {
      setBreadcrumbs([]);
      return;
    }

    // Dividir el path en partes
    const parts = path.split(/[\\/]/).filter(p => p);
    
    // En Windows, el primer elemento es la letra del drive (ej: "C:")
    const crumbs: string[] = [];
    let accumulated = '';
    
    parts.forEach((part, index) => {
      if (index === 0 && part.endsWith(':')) {
        // Drive en Windows
        accumulated = part + '\\';
      } else if (index === 0) {
        // Root en Unix
        accumulated = '/' + part;
      } else {
        accumulated += (accumulated.endsWith('\\') || accumulated.endsWith('/') ? '' : '\\') + part;
      }
      crumbs.push(accumulated);
    });
    
    setBreadcrumbs(crumbs);
  };

  const handleItemClick = (item: DirectoryItem) => {
    navigateToPath(item.path);
  };

  const handleBreadcrumbClick = (path: string) => {
    navigateToPath(path);
  };

  const handleSelectCurrent = () => {
    if (currentPath) {
      onSelectDirectory(currentPath);
    }
  };

  const handleGoBack = () => {
    if (breadcrumbs.length > 1) {
      navigateToPath(breadcrumbs[breadcrumbs.length - 2]);
    } else if (breadcrumbs.length === 1) {
      loadDrives();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-[90%] max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <FolderIcon className="w-6 h-6 text-indigo-400" />
            Select Directory
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <div className="px-6 py-3 bg-gray-750 border-b border-gray-700 flex items-center gap-2 overflow-x-auto">
            <button
              onClick={loadDrives}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors flex-shrink-0"
              title="Home"
            >
              <HomeIcon className="w-4 h-4" />
            </button>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const displayName = crumb.split(/[\\/]/).filter(p => p).pop() || crumb;
              
              return (
                <React.Fragment key={index}>
                  <ChevronRightIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  {!isLast ? (
                    <button
                      onClick={() => handleBreadcrumbClick(crumb)}
                      className="px-2 py-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-sm flex-shrink-0"
                    >
                      {displayName}
                    </button>
                  ) : (
                    <span className="px-2 py-1 text-white font-medium text-sm flex-shrink-0">
                      {displayName}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <SpinnerIcon className="w-10 h-10 text-indigo-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-red-400">
              <p className="text-lg mb-4">{error}</p>
              <button
                onClick={currentPath ? () => navigateToPath(currentPath) : loadDrives}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : !currentPath && drives.length > 0 ? (
            // Mostrar drives
            <div className="grid grid-cols-2 gap-4">
              {drives.map((drive) => (
                <button
                  key={drive.path}
                  onClick={() => navigateToPath(drive.path)}
                  className="flex items-center gap-3 p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-left group"
                >
                  <HardDriveIcon className="w-8 h-8 text-indigo-400 group-hover:text-indigo-300 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-white">{drive.name}</p>
                    <p className="text-sm text-gray-400">{drive.path}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : items.length > 0 ? (
            // Mostrar directorios
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleItemClick(item)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-left group"
                >
                  <FolderIcon className="w-6 h-6 text-yellow-400 group-hover:text-yellow-300 flex-shrink-0" />
                  <span className="text-gray-100 group-hover:text-white flex-1 truncate">
                    {item.name}
                  </span>
                  <ChevronRightIcon className="w-5 h-5 text-gray-500 group-hover:text-gray-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <p>No subdirectories found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-700 gap-4">
          <button
            onClick={handleGoBack}
            disabled={!currentPath && drives.length > 0}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            ← Back
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelectCurrent}
              disabled={!currentPath}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
            >
              Select This Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DirectoryBrowser;
