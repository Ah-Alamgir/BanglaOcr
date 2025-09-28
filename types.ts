export enum PageStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Page {
  id: string;
  file: File;
  status: PageStatus;
  previewUrl: string;
  text?: string;
  error?: string;
}