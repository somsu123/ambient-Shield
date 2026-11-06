// Shared response type for all background.js message roundtrips
export interface ScanResponse {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  cached?: boolean;
  /** Which analysis phase resolved the result (image scanner only) */
  phase?: number;
  remainingCalls?: number;
  error?: string;
}
