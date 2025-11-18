export interface DashboardEntry {
  id: string;
  imageName: string;
  imagePath: string;
  timestamp: string;
  annotationCount: number;
  totalPixelsAnnotated: number;
  totalTimeSeconds: number;
  activeTimeSeconds: number;
}
