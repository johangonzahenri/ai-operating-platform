/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Canonical WGSL Shaders for On-Device Neural Micro-Model Execution.
 * 
 * Operations:
 * 1. Dense (Matrix-Vector Multiplication with Bias): y = W * x + b
 * 2. Activation: ReLU(x) = max(0.0, x)
 * 3. Fused Canonical VTO Micro-Model: Linear(8 -> 4) -> ReLU -> Linear(4 -> 2)
 * 
 * Memory Layout:
 * - Uniform buffer: Dimensions & Hyperparameters
 * - Storage buffer (read): Inputs & Weights
 * - Storage buffer (read_write): Output Activations
 */

export const WGSL_CANONICAL_VTO_MICRO_MODEL_SHADER = `
struct ModelParams {
  in_features: u32,
  hidden_features: u32,
  out_features: u32,
  _padding: u32,
};

@group(0) @binding(0) var<uniform> params: ModelParams;
@group(0) @binding(1) var<storage, read> input_tensor: array<f32>;
@group(0) @binding(2) var<storage, read> layer1_weights: array<f32>;
@group(0) @binding(3) var<storage, read> layer1_biases: array<f32>;
@group(0) @binding(4) var<storage, read> layer2_weights: array<f32>;
@group(0) @binding(5) var<storage, read> layer2_biases: array<f32>;
@group(0) @binding(6) var<storage, read_write> output_tensor: array<f32>;

// Workgroup size 1 since micro-model is tiny (4 hidden, 2 output)
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  if (global_id.x != 0u) {
    return;
  }

  // Intermediate activation buffer in registers / workgroup
  var hidden: array<f32, 4>;

  // 1. Layer 1: Dense (8 -> 4) + ReLU
  for (var h = 0u; h < params.hidden_features; h = h + 1u) {
    var sum: f32 = layer1_biases[h];
    let row_offset: u32 = h * params.in_features;
    for (var i = 0u; i < params.in_features; i = i + 1u) {
      sum = sum + input_tensor[i] * layer1_weights[row_offset + i];
    }
    // ReLU activation
    if (sum > 0.0) {
      hidden[h] = sum;
    } else {
      hidden[h] = 0.0;
    }
  }

  // 2. Layer 2: Dense (4 -> 2)
  for (var o = 0u; o < params.out_features; o = o + 1u) {
    var sum: f32 = layer2_biases[o];
    let row_offset: u32 = o * params.hidden_features;
    for (var h = 0u; h < params.hidden_features; h = h + 1u) {
      sum = sum + hidden[h] * layer2_weights[row_offset + h];
    }
    output_tensor[o] = sum;
  }
}
`;
