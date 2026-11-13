// Deepfake Classifier Provider Interface — STUB
// 
// To add a real classifier:
// Option A: ONNX via transformers.js in an offscreen document
//   1. Add offscreen document with transformers.js
//   2. Load a deepfake detection model (e.g. Synth-DF-Net ONNX)
//   3. Implement classifyFrame(base64Jpeg) → { score: 0-1, label: string }
//
// Option B: Local HTTP service
//   1. Run a small Flask/FastAPI service on e.g. localhost:8765
//   2. POST { image: base64 } → { score: 0-1 }
//   3. Add "http://localhost:8765/*" to optional_host_permissions
//
// The score from the classifier is combined with LLM artifact scores
// using WEIGHTS.classifier_bonus in extension/deepfake/config.js.

export async function classifyFrame(_base64Jpeg) {
  // Stub: returns null to indicate classifier is unavailable
  return null;
}

export async function checkClassifierHealth() {
  return { ok: false, message: "No classifier configured. See classifier-stub.js for setup instructions." };
}
