// Ambient Shield — Deepfake Scanner Configuration
// Single source of truth for all tunable parameters.

export const DEEPFAKE_CONFIG = {
  // Model settings
  DEFAULT_OLLAMA_HOST: "http://localhost:11434",
  DEFAULT_VISION_MODEL: "gemma3:4b",
  SUGGESTED_GPU_MODEL: "gemma3:12b",
  KNOWN_VISION_MODELS: ["gemma3", "llava", "moondream", "bakllava", "minicpm-v", "llava-phi3"],

  // Frame extraction
  DEFAULT_FRAME_COUNT: 8,        // evenly spaced
  MAX_FRAME_COUNT: 16,
  MIN_FRAME_COUNT: 3,
  FRAME_MAX_PX: 768,             // longest side
  FRAME_JPEG_QUALITY: 0.8,

  // Image analysis
  IMAGE_MAX_PX: 768,             // longest side sent to model
  IMAGE_DISPLAY_MAX_PX: 2048,   // for preview

  // File limits
  IMAGE_MAX_BYTES: 10 * 1024 * 1024,   // 10 MB
  VIDEO_MAX_BYTES: 100 * 1024 * 1024,  // 100 MB
  VIDEO_MIME_TYPES: ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"],
  IMAGE_MIME_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],

  // LLM
  DEFAULT_TIMEOUT_MS: 60000,
  FRAME_TIMEOUT_MS: 45000,
  MAX_RETRIES: 2,
  CONCURRENCY_LIMIT: 2,

  // Cache
  CACHE_TTL_MS: 24 * 60 * 60 * 1000,  // 24h
  CACHE_STORAGE_KEY: "deepfakeCache",

  // Scoring weights (must sum to 1.0)
  WEIGHTS: {
    llm_artifacts: 0.60,
    pixel_consistency: 0.25,
    metadata_flags: 0.15,
    // classifier weight added to llm_artifacts when classifier is present
    classifier_bonus: 0.20,  // replaces that fraction of llm_artifacts
  },

  // Verdict thresholds
  VERDICT: {
    AUTHENTIC_MAX: 0.30,     // suspicion <= 0.30 → "Likely authentic"
    INCONCLUSIVE_MAX: 0.65,  // suspicion <= 0.65 → "Inconclusive"
    // above 0.65 → "Possible manipulation"
  },
};
