import React, { useMemo } from 'react';
import { DashboardEntry } from '../types/dashboard';
import { ChartIcon, ClockIcon, CloseIcon, PencilIcon } from './icons';

interface DashboardModalProps {
  entries: DashboardEntry[];
  liveEntries: DashboardEntry[];
  totalImages: number;
  onClose: () => void;
}

const getLatestSnapshots = (source: DashboardEntry[]) => {
  const latest = new Map<string, DashboardEntry>();
  source.forEach(entry => {
    const existing = latest.get(entry.imagePath);
    if (!existing || new Date(entry.timestamp) > new Date(existing.timestamp)) {
      latest.set(entry.imagePath, entry);
    }
  });
  return Array.from(latest.values());
};

const formatSeconds = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
};

const formatDate = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  });
};

const DashboardModal: React.FC<DashboardModalProps> = ({ entries, liveEntries, totalImages, onClose }) => {
  const canonicalSavedEntries = useMemo(() => getLatestSnapshots(entries), [entries]);
  const canonicalLiveEntries = useMemo(() => getLatestSnapshots(liveEntries), [liveEntries]);

  const summary = useMemo(() => {
    const totalImagesTracked = canonicalLiveEntries.length;
    const totalPixels = canonicalLiveEntries.reduce((sum, entry) => sum + entry.totalPixelsAnnotated, 0);
    const avgPixels = totalImagesTracked > 0 ? totalPixels / totalImagesTracked : 0;
    const totalTimeSeconds = canonicalLiveEntries.reduce((sum, entry) => sum + entry.totalTimeSeconds, 0);
    const totalActiveSeconds = canonicalLiveEntries.reduce((sum, entry) => sum + entry.activeTimeSeconds, 0);
    const avgAnnotations = totalImagesTracked > 0
      ? canonicalLiveEntries.reduce((sum, entry) => sum + entry.annotationCount, 0) / totalImagesTracked
      : 0;

    return {
      totalImages: totalImagesTracked,
      totalPixels,
      avgPixels,
      totalTimeSeconds,
      totalActiveSeconds,
      avgAnnotations,
    };
  }, [canonicalLiveEntries]);

  const remainingImages = Math.max(totalImages - summary.totalImages, 0);
  const progressPercentage = totalImages > 0 ? (summary.totalImages / totalImages) * 100 : 0;
  const avgTimePerImage = summary.totalImages > 0 ? summary.totalTimeSeconds / summary.totalImages : 0;
  const avgActivePerImage = summary.totalImages > 0 ? summary.totalActiveSeconds / summary.totalImages : 0;
  const timePerPixel = summary.totalPixels > 0 ? summary.totalTimeSeconds / summary.totalPixels : 0;
  const activeTimePerPixel = summary.totalPixels > 0 ? summary.totalActiveSeconds / summary.totalPixels : 0;
  const avgPixelsPerImage = summary.avgPixels;

  let projectedTotalTime = remainingImages * avgTimePerImage;
  let projectedActiveTime = remainingImages * avgActivePerImage;

  if ((!projectedTotalTime || Number.isNaN(projectedTotalTime)) && avgPixelsPerImage > 0 && timePerPixel > 0) {
    const estimatedPixels = remainingImages * avgPixelsPerImage;
    projectedTotalTime = estimatedPixels * timePerPixel;
    projectedActiveTime = estimatedPixels * activeTimePerPixel;
  }

  const dailyStats = useMemo(() => {
    const statsMap = new Map<string, {
      images: number;
      pixels: number;
      totalTimeSeconds: number;
      activeTimeSeconds: number;
      annotations: number;
    }>();

    canonicalLiveEntries.forEach(entry => {
      const dateKey = entry.timestamp.split('T')[0];
      if (!statsMap.has(dateKey)) {
        statsMap.set(dateKey, {
          images: 0,
          pixels: 0,
          totalTimeSeconds: 0,
          activeTimeSeconds: 0,
          annotations: 0,
        });
      }
      const day = statsMap.get(dateKey)!;
      day.images += 1;
      day.pixels += entry.totalPixelsAnnotated;
      day.totalTimeSeconds += entry.totalTimeSeconds;
      day.activeTimeSeconds += entry.activeTimeSeconds;
      day.annotations += entry.annotationCount;
    });

    return Array.from(statsMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries]);

  const maxPixels = Math.max(...dailyStats.map(stat => stat.pixels), 0);
  const recentEntries = useMemo(() => {
    return [...canonicalSavedEntries]
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 10);
  }, [canonicalSavedEntries]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-400">Panel de control</p>
            <h2 className="text-3xl font-bold text-white">Dashboard de anotaciones</h2>
            <p className="text-sm text-gray-400">Actividad registrada automáticamente cada vez que se guardan los cambios.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-gray-700 p-2 text-gray-300 hover:bg-gray-800 hover:text-white"
            aria-label="Cerrar dashboard"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>

        {canonicalLiveEntries.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <ChartIcon className="mx-auto mb-4 h-12 w-12 text-gray-600" />
            <p className="text-lg font-semibold text-gray-300">Aún no hay datos registrados.</p>
            <p className="text-sm text-gray-500">Guarda una anotación para empezar a generar métricas.</p>
          </div>
        ) : (
          <div className="space-y-8 p-6">
            <section className="rounded-3xl border border-amber-400/40 bg-gradient-to-br from-amber-900/60 via-orange-900/40 to-yellow-800/40 p-6 text-white shadow-[0_20px_45px_rgba(0,0,0,0.35)]">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.6em] text-amber-200">Estimación del proyecto</p>
                  <h3 className="text-3xl font-extrabold leading-tight">
                    {remainingImages.toLocaleString('es-ES')} imagen{remainingImages === 1 ? '' : 'es'} pendientes
                  </h3>
                  <p className="mt-2 text-sm text-amber-100/80">
                    Proyección basada en la media real de píxeles anotados y tiempo invertido por imagen.
                  </p>
                </div>
                <div className="grid gap-4 text-sm text-amber-50 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Tiempo total estimado</p>
                    <p className="mt-1 text-2xl font-bold">{projectedTotalTime > 0 ? formatSeconds(projectedTotalTime) : '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Tiempo activo estimado</p>
                    <p className="mt-1 text-2xl font-bold">{projectedActiveTime > 0 ? formatSeconds(projectedActiveTime) : '—'}</p>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-amber-100/80">
                  <span>Avance del proyecto</span>
                  <span>{summary.totalImages.toLocaleString('es-ES')} / {totalImages.toLocaleString('es-ES')} imágenes</span>
                </div>
                <div className="mt-2 h-4 rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 via-yellow-300 to-white"
                    style={{ width: `${Math.min(Math.max(progressPercentage, 1), 100)}%` }}
                  ></div>
                </div>
                <div className="mt-1 text-right text-xs font-semibold tracking-wide text-amber-100">
                  {progressPercentage.toFixed(1)}% completado
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-indigo-900/40 to-indigo-700/20 p-4">
                <p className="text-sm text-indigo-200">Imágenes registradas</p>
                <p className="text-3xl font-bold text-white">{summary.totalImages.toLocaleString('es-ES')}</p>
                <p className="text-xs text-gray-400">Guardados registrados en el historial</p>
              </div>
              <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-emerald-900/30 to-emerald-700/10 p-4">
                <p className="text-sm text-emerald-200">Media de píxeles por imagen</p>
                <p className="text-3xl font-bold text-white">{Math.round(summary.avgPixels).toLocaleString('es-ES')}</p>
                <p className="text-xs text-gray-400">Total acumulado: {summary.totalPixels.toLocaleString('es-ES')} px²</p>
              </div>
              <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-sky-900/40 to-sky-700/10 p-4">
                <div className="flex items-center gap-2 text-sky-200">
                  <ClockIcon className="h-5 w-5" />
                  <p className="text-sm">Tiempo total</p>
                </div>
                <p className="text-3xl font-bold text-white">{formatSeconds(summary.totalTimeSeconds)}</p>
                <p className="text-xs text-gray-400">Incluye pausas y navegación</p>
              </div>
              <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-cyan-900/30 to-cyan-700/10 p-4">
                <div className="flex items-center gap-2 text-cyan-200">
                  <PencilIcon className="h-5 w-5" />
                  <p className="text-sm">Tiempo activo</p>
                </div>
                <p className="text-3xl font-bold text-white">{formatSeconds(summary.totalActiveSeconds)}</p>
                <p className="text-xs text-gray-400">Promedio anotaciones: {summary.avgAnnotations.toFixed(1)}</p>
              </div>
              <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-amber-900/40 to-amber-700/10 p-4">
                <p className="text-sm text-amber-200">Ritmo actual</p>
                <p className="text-3xl font-bold text-white">{summary.totalImages > 0 ? formatSeconds(avgTimePerImage) : '—'}</p>
                <p className="text-xs text-gray-400">Tiempo medio por imagen (total)</p>
                <p className="text-xs text-gray-500 mt-1">Activo medio: {summary.totalImages > 0 ? formatSeconds(avgActivePerImage) : '—'}</p>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Actividad diaria</p>
                    <h3 className="text-lg font-semibold text-white">Últimos {Math.min(dailyStats.length, 7)} días activos</h3>
                  </div>
                </div>
                <div className="space-y-3">
                  {dailyStats.slice(0, 7).map(day => (
                    <div key={day.date} className="rounded-xl border border-gray-800 bg-gray-800/40 p-3">
                      <div className="flex items-center justify-between text-sm text-gray-300">
                        <span className="font-semibold text-white">{formatDate(day.date)}</span>
                        <span>{day.images} imagen{day.images === 1 ? '' : 'es'}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-gray-700">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400"
                          style={{ width: `${maxPixels ? Math.max((day.pixels / maxPixels) * 100, 4) : 4}%` }}
                        ></div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
                        <span>Píxeles: {Math.round(day.pixels).toLocaleString('es-ES')}</span>
                        <span>Tiempo: {formatSeconds(day.totalTimeSeconds)}</span>
                        <span>Activo: {formatSeconds(day.activeTimeSeconds)}</span>
                      </div>
                    </div>
                  ))}
                  {dailyStats.length === 0 && (
                    <p className="text-sm text-gray-500">No hay actividad registrada todavía.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Últimas sesiones</p>
                    <h3 className="text-lg font-semibold text-white">Guardados recientes</h3>
                  </div>
                </div>
                <div className="space-y-3">
                  {recentEntries.map(entry => (
                    <div key={entry.id} className="rounded-xl border border-gray-800 bg-gray-800/40 p-3">
                      <div className="flex items-center justify-between text-sm text-white">
                        <span className="font-semibold">{entry.imageName}</span>
                        <span className="text-gray-400">{new Date(entry.timestamp).toLocaleString('es-ES')}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-gray-400">
                        <div>
                          <p className="text-gray-500">Anotaciones</p>
                          <p className="text-white">{entry.annotationCount}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Píxeles</p>
                          <p className="text-white">{Math.round(entry.totalPixelsAnnotated).toLocaleString('es-ES')}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Tiempo total</p>
                          <p className="text-white">{formatSeconds(entry.totalTimeSeconds)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Tiempo activo</p>
                          <p className="text-white">{formatSeconds(entry.activeTimeSeconds)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardModal;
