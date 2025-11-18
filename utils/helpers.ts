export const trimTrailingSeparator = (value: string) => value.replace(/[\\/]+$/, '');
export const detectSeparator = (value: string) => (value.includes('\\') ? '\\' : '/');

export const joinPathSegments = (base: string, child: string) => {
  if (!base) return child;
  const sanitizedBase = trimTrailingSeparator(base);
  const separator = detectSeparator(base);
  const sanitizedChild = child.replace(/^[\\/]+/, '');
  return `${sanitizedBase}${separator}${sanitizedChild}`;
};

export type OutputPaths = {
  annotations: string;
  masks: string;
  times: string;
};

export const getDefaultOutputPaths = (baseDir: string): OutputPaths => {
  if (!baseDir) {
    return { annotations: '', masks: '', times: '' };
  }
  const cleanBase = trimTrailingSeparator(baseDir);
  const separator = detectSeparator(cleanBase);
  return {
    annotations: `${cleanBase}${separator}annotations`,
    masks: `${cleanBase}${separator}masks`,
    times: `${cleanBase}${separator}times`
  };
};

export const hexToRgba = (hex: string, alpha: number = 0.5): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
        return `rgba(255, 255, 255, ${alpha})`; // fallback
    }
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
