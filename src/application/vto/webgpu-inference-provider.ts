/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * WebGPU On-Device Neural Inference Adapter.
 * 
 * Location: Peripheral Application Layer (src/application/vto/)
 * 
 * Invariants:
 * - Domain is 100% isolated: No navigator.gpu or GPUDevice leaked into src/domain/.
 * - Explicit WebGPU capability detection (secure context, adapter availability, device acquisition).
 * - Full resource lifecycle management: static model buffers reused, staging buffer mapped & unmapped cleanly.
 * - GPUDevice.lost explicitly captured and triggers status transition to DEVICE_LOST.
 * - Test double support: can be injected with custom WebGpuDeviceContext or native global GPU.
 */

import {
  OnDeviceInferenceProviderPort,
  InferenceProviderType,
  InferenceLifecycleStatus,
  InferenceProviderCapabilities,
  InferenceRequest,
  InferenceResult,
} from "../../domain/vto/inference-provider-port.js";
import { MicroModelManifest, validateModelAbi, validateModelManifest } from "../../domain/vto/neural-model.js";
import { Tensor } from "../../domain/vto/neural-tensor.js";
import { WGSL_CANONICAL_VTO_MICRO_MODEL_SHADER } from "./wgsl-shaders.js";

// Minimal structural WebGPU types to avoid external DOM/lib dependencies in Node builds
export interface WebGpuBufferLike {
  readonly size: number;
  readonly usage: number;
  destroy(): void;
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
}

export interface WebGpuQueueLike {
  writeBuffer(
    buffer: WebGpuBufferLike,
    bufferOffset: number,
    data: BufferSource | ArrayBufferView,
    dataOffset?: number,
    size?: number
  ): void;
  submit(commandBuffers: readonly any[]): void;
  onSubmittedWorkDone(): Promise<void>;
}

export interface WebGpuDeviceLike {
  readonly queue: WebGpuQueueLike;
  readonly lost: Promise<{ reason: string; message: string }>;
  createBuffer(descriptor: { size: number; usage: number; mappedAtCreation?: boolean }): WebGpuBufferLike;
  createShaderModule(descriptor: { code: string }): any;
  createComputePipeline(descriptor: { layout: string | any; compute: { module: any; entryPoint: string } }): any;
  createBindGroupLayout(descriptor: any): any;
  createBindGroup(descriptor: any): any;
  createCommandEncoder(): any;
  destroy(): void;
}

export interface WebGpuAdapterLike {
  requestDevice(descriptor?: any): Promise<WebGpuDeviceLike>;
}

export interface WebGpuContextLike {
  requestAdapter(options?: any): Promise<WebGpuAdapterLike | null>;
}

export interface WebGpuInferenceProviderConfig {
  readonly gpuContext?: WebGpuContextLike | undefined;
  readonly shaderCodeOverride?: string | undefined;
}

export class WebGpuInferenceProvider implements OnDeviceInferenceProviderPort {
  public readonly providerId = "webgpu-inference-v1";
  public readonly providerType: InferenceProviderType = "WEBGPU";

  private _status: InferenceLifecycleStatus = "UNINITIALIZED";
  private _gpuContext?: WebGpuContextLike;
  private _adapter?: WebGpuAdapterLike;
  private _device?: WebGpuDeviceLike;
  private _loadedModel?: MicroModelManifest;
  private _pipeline?: any;
  private _bindGroup?: any;

  // Static GPU Buffers
  private _paramsBuffer?: WebGpuBufferLike;
  private _l1WeightsBuffer?: WebGpuBufferLike;
  private _l1BiasesBuffer?: WebGpuBufferLike;
  private _l2WeightsBuffer?: WebGpuBufferLike;
  private _l2BiasesBuffer?: WebGpuBufferLike;

  // Dynamic / Per-Inference Buffers
  private _inputBuffer?: WebGpuBufferLike;
  private _outputBuffer?: WebGpuBufferLike;
  private _stagingBuffer?: WebGpuBufferLike;

  private _isWarm = false;
  private _shaderCode: string;

  constructor(config?: WebGpuInferenceProviderConfig) {
    this._gpuContext = config?.gpuContext;
    this._shaderCode = config?.shaderCodeOverride ?? WGSL_CANONICAL_VTO_MICRO_MODEL_SHADER;
  }

  public get lifecycleStatus(): InferenceLifecycleStatus {
    return this._status;
  }

  /**
   * Evaluates environment WebGPU capability without throwing.
   */
  public async getCapabilities(): Promise<InferenceProviderCapabilities> {
    const gpu = this.resolveGpuContext();
    if (!gpu) {
      return {
        providerId: this.providerId,
        providerType: this.providerType,
        isHardwareAccelerated: false,
        supportsFp16: false,
        maxBufferBytes: 0,
        isAvailableInEnvironment: false,
        environmentReason: "WebGPU context (navigator.gpu) not available in current environment",
      };
    }

    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        return {
          providerId: this.providerId,
          providerType: this.providerType,
          isHardwareAccelerated: false,
          supportsFp16: false,
          maxBufferBytes: 0,
          isAvailableInEnvironment: false,
          environmentReason: "GPUAdapter could not be obtained from WebGPU context",
        };
      }

      return {
        providerId: this.providerId,
        providerType: this.providerType,
        isHardwareAccelerated: true,
        supportsFp16: false,
        maxBufferBytes: 128 * 1024 * 1024,
        isAvailableInEnvironment: true,
      };
    } catch (err) {
      return {
        providerId: this.providerId,
        providerType: this.providerType,
        isHardwareAccelerated: false,
        supportsFp16: false,
        maxBufferBytes: 0,
        isAvailableInEnvironment: false,
        environmentReason: `Error querying WebGPU adapter: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  public async initializeDevice(): Promise<void> {
    if (this._device && this._status === "READY") {
      return;
    }

    this._status = "INITIALIZING";
    const gpu = this.resolveGpuContext();
    if (!gpu) {
      this._status = "DEGRADED";
      throw new Error("WEBGPU_UNAVAILABLE: WebGPU context not detected in runtime environment");
    }

    this._adapter = (await gpu.requestAdapter()) ?? undefined;
    if (!this._adapter) {
      this._status = "DEGRADED";
      throw new Error("WEBGPU_ADAPTER_UNAVAILABLE: Failed to request GPUAdapter");
    }

    this._device = await this._adapter.requestDevice();
    if (!this._device) {
      this._status = "DEGRADED";
      throw new Error("WEBGPU_DEVICE_UNAVAILABLE: Failed to acquire GPUDevice");
    }

    // Attach device lost handler
    this._device.lost.then((info) => {
      this._status = "DEVICE_LOST";
      this._pipeline = undefined;
      this._bindGroup = undefined;
    }).catch(() => {
      this._status = "DEVICE_LOST";
    });

    this._status = "READY";
  }

  public async loadModel(manifest: MicroModelManifest): Promise<void> {
    const manifestCheck = validateModelManifest(manifest);
    if (!manifestCheck.isValid) {
      this._status = "DEGRADED";
      throw new Error(`MODEL_INTEGRITY_FAILED: ${manifestCheck.errors.join("; ")}`);
    }

    if (!this._device) {
      await this.initializeDevice();
    }

    const device = this._device!;

    // Compile WGSL Shader Module
    const shaderModule = device.createShaderModule({
      code: this._shaderCode,
    });

    // Create Compute Pipeline (using layout: 'auto' or default pipeline layout)
    this._pipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    // Allocate & upload static weights buffers
    const l1 = manifest.weights.layer1;
    const l2 = manifest.weights.layer2;

    // Buffer usages (STORAGE = 0x0080, UNIFORM = 0x0040, COPY_DST = 0x0008, COPY_SRC = 0x0004, MAP_READ = 0x0001)
    const USAGE_UNIFORM = 0x0040 | 0x0008;
    const USAGE_STORAGE = 0x0080 | 0x0008;

    // Params uniform: 4 x u32 = 16 bytes
    const paramsData = new Uint32Array([l1.inFeatures, l1.outFeatures, l2.outFeatures, 0]);
    this._paramsBuffer = device.createBuffer({
      size: 16,
      usage: USAGE_UNIFORM,
    });
    device.queue.writeBuffer(this._paramsBuffer, 0, paramsData);

    // L1 Weights
    const l1WeightsData = new Float32Array(l1.weights);
    this._l1WeightsBuffer = device.createBuffer({
      size: l1WeightsData.byteLength,
      usage: USAGE_STORAGE,
    });
    device.queue.writeBuffer(this._l1WeightsBuffer, 0, l1WeightsData);

    // L1 Biases
    const l1BiasesData = new Float32Array(l1.biases);
    this._l1BiasesBuffer = device.createBuffer({
      size: l1BiasesData.byteLength,
      usage: USAGE_STORAGE,
    });
    device.queue.writeBuffer(this._l1BiasesBuffer, 0, l1BiasesData);

    // L2 Weights
    const l2WeightsData = new Float32Array(l2.weights);
    this._l2WeightsBuffer = device.createBuffer({
      size: l2WeightsData.byteLength,
      usage: USAGE_STORAGE,
    });
    device.queue.writeBuffer(this._l2WeightsBuffer, 0, l2WeightsData);

    // L2 Biases
    const l2BiasesData = new Float32Array(l2.biases);
    this._l2BiasesBuffer = device.createBuffer({
      size: l2BiasesData.byteLength,
      usage: USAGE_STORAGE,
    });
    device.queue.writeBuffer(this._l2BiasesBuffer, 0, l2BiasesData);

    // Prepare per-inference buffers
    const inputSize = l1.inFeatures * 4;
    const outputSize = l2.outFeatures * 4;

    this._inputBuffer = device.createBuffer({
      size: inputSize,
      usage: 0x0080 | 0x0008, // STORAGE | COPY_DST
    });

    this._outputBuffer = device.createBuffer({
      size: outputSize,
      usage: 0x0080 | 0x0004, // STORAGE | COPY_SRC
    });

    this._stagingBuffer = device.createBuffer({
      size: outputSize,
      usage: 0x0001 | 0x0008, // MAP_READ | COPY_DST
    });

    // Create BindGroup
    this._bindGroup = device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout?.(0) ?? undefined,
      entries: [
        { binding: 0, resource: { buffer: this._paramsBuffer } },
        { binding: 1, resource: { buffer: this._inputBuffer } },
        { binding: 2, resource: { buffer: this._l1WeightsBuffer } },
        { binding: 3, resource: { buffer: this._l1BiasesBuffer } },
        { binding: 4, resource: { buffer: this._l2WeightsBuffer } },
        { binding: 5, resource: { buffer: this._l2BiasesBuffer } },
        { binding: 6, resource: { buffer: this._outputBuffer } },
      ],
    });

    this._loadedModel = manifest;
    this._status = "READY";
  }

  public async infer(request: InferenceRequest): Promise<InferenceResult> {
    const totalStart = Date.now();

    if (this._status === "DEVICE_LOST") {
      return {
        requestId: request.requestId,
        modelId: request.modelId,
        modelVersion: request.modelVersion,
        providerId: this.providerId,
        providerType: this.providerType,
        status: "DEVICE_LOST",
        outputs: new Map(),
        metrics: { queueLatencyMs: 0, computeLatencyMs: 0, readbackLatencyMs: 0, totalDurationMs: 0, isWarmStart: false },
        errorDetails: "WebGPU GPUDevice has been lost or destroyed",
      };
    }

    if (this._status !== "READY" || !this._device || !this._loadedModel || !this._pipeline) {
      return {
        requestId: request.requestId,
        modelId: request.modelId,
        modelVersion: request.modelVersion,
        providerId: this.providerId,
        providerType: this.providerType,
        status: "ERROR",
        outputs: new Map(),
        metrics: { queueLatencyMs: 0, computeLatencyMs: 0, readbackLatencyMs: 0, totalDurationMs: 0, isWarmStart: false },
        errorDetails: `Provider not ready or pipeline uninitialized. Status: ${this._status}`,
      };
    }

    if (request.abortSignal?.aborted) {
      return {
        requestId: request.requestId,
        modelId: request.modelId,
        modelVersion: request.modelVersion,
        providerId: this.providerId,
        providerType: this.providerType,
        status: "ABORTED",
        outputs: new Map(),
        metrics: { queueLatencyMs: 0, computeLatencyMs: 0, readbackLatencyMs: 0, totalDurationMs: 0, isWarmStart: false },
        errorDetails: "Inference request aborted before GPU dispatch",
      };
    }

    // ABI Validation
    const inputMeta = new Map<string, { shape: readonly number[]; dataType: string }>();
    for (const [name, tensor] of request.inputs.entries()) {
      inputMeta.set(name, { shape: tensor.shape, dataType: tensor.dataType });
    }

    const abiCheck = validateModelAbi(this._loadedModel, inputMeta);
    if (!abiCheck.isValid) {
      return {
        requestId: request.requestId,
        modelId: request.modelId,
        modelVersion: request.modelVersion,
        providerId: this.providerId,
        providerType: this.providerType,
        status: "VALIDATION_FAILED",
        outputs: new Map(),
        metrics: { queueLatencyMs: 0, computeLatencyMs: 0, readbackLatencyMs: 0, totalDurationMs: 0, isWarmStart: false },
        errorDetails: `ABI Mismatch: ${abiCheck.errors.join("; ")}`,
      };
    }

    try {
      const device = this._device;
      const inputTensor = request.inputs.get(this._loadedModel.inputs[0].name)!;

      // 1. Upload Input Tensor to GPU input buffer
      const queueStart = Date.now();
      device.queue.writeBuffer(this._inputBuffer!, 0, inputTensor.data);
      const queueLatency = Date.now() - queueStart;

      // 2. Dispatch Compute Pass
      const computeStart = Date.now();
      const commandEncoder = device.createCommandEncoder();
      const passEncoder = commandEncoder.beginComputePass();
      passEncoder.setPipeline(this._pipeline);
      passEncoder.setBindGroup(0, this._bindGroup);
      passEncoder.dispatchWorkgroups(1, 1, 1);
      passEncoder.end();

      // 3. Copy output to staging buffer for readback
      commandEncoder.copyBufferToBuffer(this._outputBuffer!, 0, this._stagingBuffer!, 0, this._stagingBuffer!.size);
      device.queue.submit([commandEncoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      const computeLatency = Date.now() - computeStart;

      // 4. Readback from staging buffer
      const readbackStart = Date.now();
      await this._stagingBuffer!.mapAsync(0x0001); // MAP_READ
      const mappedRange = this._stagingBuffer!.getMappedRange();
      const resultData = new Float32Array(mappedRange.slice(0));
      this._stagingBuffer!.unmap();
      const readbackLatency = Date.now() - readbackStart;

      // Numerical Safety Inspection (NaN / Infinity check)
      for (let i = 0; i < resultData.length; i++) {
        if (!Number.isFinite(resultData[i])) {
          return {
            requestId: request.requestId,
            modelId: request.modelId,
            modelVersion: request.modelVersion,
            providerId: this.providerId,
            providerType: this.providerType,
            status: "ERROR",
            outputs: new Map(),
            metrics: {
              queueLatencyMs: queueLatency,
              computeLatencyMs: computeLatency,
              readbackLatencyMs: readbackLatency,
              totalDurationMs: Date.now() - totalStart,
              isWarmStart: this._isWarm,
            },
            errorDetails: `NUMERICAL_INSTABILITY: WebGPU output contains non-finite value at index ${i}: ${resultData[i]}`,
          };
        }
      }

      const isWarm = this._isWarm;
      this._isWarm = true;

      const outputTensor = new Tensor(this._loadedModel.outputs[0].shape, resultData, "FLOAT32");
      const outputs = new Map<string, Tensor>([[this._loadedModel.outputs[0].name, outputTensor]]);

      return {
        requestId: request.requestId,
        modelId: request.modelId,
        modelVersion: request.modelVersion,
        providerId: this.providerId,
        providerType: this.providerType,
        status: "SUCCESS",
        outputs,
        metrics: {
          queueLatencyMs: queueLatency,
          computeLatencyMs: computeLatency,
          readbackLatencyMs: readbackLatency,
          totalDurationMs: Date.now() - totalStart,
          isWarmStart: isWarm,
        },
      };
    } catch (err) {
      return {
        requestId: request.requestId,
        modelId: request.modelId,
        modelVersion: request.modelVersion,
        providerId: this.providerId,
        providerType: this.providerType,
        status: "ERROR",
        outputs: new Map(),
        metrics: { queueLatencyMs: 0, computeLatencyMs: 0, readbackLatencyMs: 0, totalDurationMs: Date.now() - totalStart, isWarmStart: false },
        errorDetails: `WebGPU Execution Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  public async dispose(): Promise<void> {
    this._status = "DISPOSED";

    // Clean up GPU Buffers
    this._paramsBuffer?.destroy();
    this._l1WeightsBuffer?.destroy();
    this._l1BiasesBuffer?.destroy();
    this._l2WeightsBuffer?.destroy();
    this._l2BiasesBuffer?.destroy();
    this._inputBuffer?.destroy();
    this._outputBuffer?.destroy();
    this._stagingBuffer?.destroy();

    this._paramsBuffer = undefined;
    this._l1WeightsBuffer = undefined;
    this._l1BiasesBuffer = undefined;
    this._l2WeightsBuffer = undefined;
    this._l2BiasesBuffer = undefined;
    this._inputBuffer = undefined;
    this._outputBuffer = undefined;
    this._stagingBuffer = undefined;

    this._pipeline = undefined;
    this._bindGroup = undefined;
    this._loadedModel = undefined;

    this._device?.destroy();
    this._device = undefined;
    this._adapter = undefined;
    this._isWarm = false;
  }

  private resolveGpuContext(): WebGpuContextLike | undefined {
    if (this._gpuContext) {
      return this._gpuContext;
    }
    if (typeof navigator !== "undefined" && (navigator as any).gpu) {
      return (navigator as any).gpu as WebGpuContextLike;
    }
    return undefined;
  }
}
