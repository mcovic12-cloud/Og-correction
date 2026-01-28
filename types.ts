
export type CorrectionMode = 'Proportion (Mode A)' | 'Conditioned (Mode B)';
export type AngleTag = 'Front' | '3/4 View' | 'Profile' | 'Upshot' | 'Downshot' | 'Generic';
export type AutoCorrectionScope = 'Full Image' | 'Face Priority' | 'Clothing Priority' | 'Hands Priority';

export interface CorrectionSettings {
  strength: number;
  linePreservation: number;
  mode: CorrectionMode;
  angleTag: AngleTag;
  scope: AutoCorrectionScope;
  absoluteLineFidelity: boolean;
}

export type ViewMode = 'Before' | 'After' | 'Overlay';

export interface ReferenceImage {
  id: string;
  packId: string;
  data: string;
  tags: string[];
  similarity?: number;
}

export interface ReferencePack {
  id: string;
  name: string;
  description: string;
  images: ReferenceImage[];
  createdAt: number;
}

export interface CorrectionMetrics {
  mask_coverage: number;
  denoise_used: number;
  diff_in_mask: number;
  diff_outside_mask: number;
  absolute_line_fidelity: boolean;
}

export interface EditSession {
  id: string;
  originalImage: string;
  resultImage: string;
  settings: CorrectionSettings;
  timestamp: number;
  metrics: CorrectionMetrics;
}

export enum Tool {
  Brush = 'brush',
  Eraser = 'eraser'
}
