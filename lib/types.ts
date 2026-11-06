// Shared types for all analyzer results — used by API routes and UI components

export type RiskLevel = "SAFE" | "CAUTION" | "DANGER";

// ── Privacy Policy ────────────────────────────────────────────────────────
export interface PolicyResult {
  riskScore: number;       // 1–10
  riskLevel: RiskLevel;
  summary: string;         // 1 sentence
  whatTheyCollect: string[];
  whoTheyShare: string[];
  yourRights: string[];
  redFlags: string[];
  simpleSummary: string;   // plain-English 1 sentence
  optOutTips: string[];
  verdict: string;         // 1 sentence conclusion
}

// ── Fact Check ───────────────────────────────────────────────────────────────
export type FactCheckVerdict =
  | "TRUE"
  | "LIKELY_TRUE"
  | "UNVERIFIED"
  | "MISLEADING"
  | "FALSE"
  | "SATIRE";

export interface FactCheckResult {
  verdict: FactCheckVerdict;
  riskLevel: RiskLevel;
  credibilityScore: number;   // 0–100
  explanation: string;        // 1 sentence
  redFlags: string[];
  whatToCheck: string[];
  simpleSummary: string;      // 1 sentence plain-English
}

// ── Image / Deepfake ────────────────────────────────────────────────────────
export type ImageCategory =
  | "ADULT"
  | "VIOLENCE"
  | "DEEPFAKE"
  | "ADULT_AD"
  | "EDUCATIONAL"
  | "CLEAN";

export interface ImageAnalysisResult {
  category: ImageCategory;
  confidence: number;   // 0–1
  reason: string;       // <=10 words
  shouldBlock: boolean;
  indicators: string[];
}

// ── API response wrapper ─────────────────────────────────────────────────
export interface AnalysisResponse<T = PolicyResult> {
  success: boolean;
  result?: T;
  cached?: boolean;
  remainingCalls?: number;
  error?: string;
  /** Which analysis phase resolved the result (image scanner only) */
  phase?: 1 | 2 | 3;
}

// ── History entry stored in localStorage ────────────────────────────────
export interface HistoryEntry<T = PolicyResult> {
  id: string;
  type: "policy" | "factcheck" | "image";
  timestamp: number;
  inputPreview: string;   // first 80 chars of input
  result: T;
}
