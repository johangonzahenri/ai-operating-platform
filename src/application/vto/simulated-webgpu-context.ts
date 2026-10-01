/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Simulated In-Memory WebGPU Test Double Context.
 * 
 * Purpose:
 * Enables testing the WebGpuInferenceProvider adapter lifecycle, buffer allocations,
 * and error paths deterministically without physical GPU hardware or third-party emulators.
 */

import {
  WebGpuContextLike,
  WebGpuAdapterLike,
  WebGpuDeviceLike,
  WebGpuQueueLike,
  WebGpuBufferLike,
} from "./webgpu-inference-provider.js";

export class SimulatedWebGpuBuffer implements WebGpuBufferLike {
  public size: number;
  public usage: number;
  public data: ArrayBuffer;
  public isDestroyed = false;
  public isMapped = false;

  constructor(descriptor: { size: number; usage: number; mappedAtCreation?: boolean }) {
    this.size = descriptor.size;
    this.usage = descriptor.usage;
    this.data = new ArrayBuffer(descriptor.size);
    if (descriptor.mappedAtCreation) {
      this.isMapped = true;
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.isMapped = false;
  }

  public async mapAsync(mode: number, offset = 0, size?: number): Promise<void> {
    if (this.isDestroyed) throw new Error("BUFFER_DESTROYED: Cannot map destroyed buffer");
    this.isMapped = true;
  }

  public getMappedRange(offset = 0, size?: number): ArrayBuffer {
    if (!this.isMapped) throw new Error("BUFFER_NOT_MAPPED: Buffer is not mapped");
    return this.data.slice(offset, size ? offset + size : undefined);
  }

  public unmap(): void {
    this.isMapped = false;
  }
}

export class SimulatedWebGpuQueue implements WebGpuQueueLike {
  public writes: { buffer: SimulatedWebGpuBuffer; offset: number; byteLength: number }[] = [];

  public writeBuffer(
    buffer: WebGpuBufferLike,
    bufferOffset: number,
    data: BufferSource | ArrayBufferView,
    dataOffset = 0,
    size?: number
  ): void {
    const simBuf = buffer as SimulatedWebGpuBuffer;
    if (simBuf.isDestroyed) throw new Error("Cannot write to destroyed buffer");

    const srcView = new Uint8Array(
      ArrayBuffer.isView(data) ? data.buffer : (data as ArrayBuffer),
      ArrayBuffer.isView(data) ? data.byteOffset + dataOffset : dataOffset,
      size ?? (ArrayBuffer.isView(data) ? data.byteLength - dataOffset : (data as ArrayBuffer).byteLength - dataOffset)
    );

    const destView = new Uint8Array(simBuf.data);
    destView.set(srcView, bufferOffset);

    this.writes.push({ buffer: simBuf, offset: bufferOffset, byteLength: srcView.byteLength });
  }

  public submit(commandBuffers: readonly any[]): void {
    // Process commands in simulated environment
    for (const cmd of commandBuffers) {
      if (cmd?.copies) {
        for (const copy of cmd.copies) {
          const srcView = new Uint8Array(copy.src.data);
          const dstView = new Uint8Array(copy.dst.data);
          dstView.set(srcView.slice(0, copy.size));
        }
      }
    }
  }

  public async onSubmittedWorkDone(): Promise<void> {
    // Immediate completion in simulation
  }
}

export class SimulatedWebGpuDevice implements WebGpuDeviceLike {
  public queue: SimulatedWebGpuQueue;
  public lost: Promise<{ reason: string; message: string }>;
  private _lostResolve!: (value: { reason: string; message: string }) => void;
  public isDestroyed = false;

  constructor() {
    this.queue = new SimulatedWebGpuQueue();
    this.lost = new Promise((resolve) => {
      this._lostResolve = resolve;
    });
  }

  public triggerDeviceLoss(reason: string, message: string): void {
    this._lostResolve({ reason, message });
  }

  public createBuffer(descriptor: { size: number; usage: number; mappedAtCreation?: boolean }): WebGpuBufferLike {
    return new SimulatedWebGpuBuffer(descriptor);
  }

  public createShaderModule(descriptor: { code: string }): any {
    return { code: descriptor.code };
  }

  public createComputePipeline(descriptor: any): any {
    return {
      layout: descriptor.layout,
      compute: descriptor.compute,
      getBindGroupLayout: (index: number) => ({ index }),
    };
  }

  public createBindGroupLayout(descriptor: any): any {
    return { entries: descriptor.entries };
  }

  public createBindGroup(descriptor: any): any {
    return { layout: descriptor.layout, entries: descriptor.entries };
  }

  public createCommandEncoder(): any {
    const copies: { src: SimulatedWebGpuBuffer; dst: SimulatedWebGpuBuffer; size: number }[] = [];
    let boundPipeline: any;
    let boundGroup: any;

    return {
      beginComputePass: () => ({
        setPipeline: (p: any) => {
          boundPipeline = p;
        },
        setBindGroup: (idx: number, g: any) => {
          boundGroup = g;
        },
        dispatchWorkgroups: (x: number, y: number, z: number) => {
          // In simulation, compute the linear layer output from bound buffers
          if (boundGroup?.entries) {
            const inputBuf = boundGroup.entries[1].resource.buffer as SimulatedWebGpuBuffer;
            const l1WBuf = boundGroup.entries[2].resource.buffer as SimulatedWebGpuBuffer;
            const l1BBuf = boundGroup.entries[3].resource.buffer as SimulatedWebGpuBuffer;
            const l2WBuf = boundGroup.entries[4].resource.buffer as SimulatedWebGpuBuffer;
            const l2BBuf = boundGroup.entries[5].resource.buffer as SimulatedWebGpuBuffer;
            const outBuf = boundGroup.entries[6].resource.buffer as SimulatedWebGpuBuffer;

            const input = new Float32Array(inputBuf.data);
            const l1W = new Float32Array(l1WBuf.data);
            const l1B = new Float32Array(l1BBuf.data);
            const l2W = new Float32Array(l2WBuf.data);
            const l2B = new Float32Array(l2BBuf.data);

            // Layer 1: Dense [4, 8] + ReLU
            const hidden = new Float32Array(4);
            for (let h = 0; h < 4; h++) {
              let sum = l1B[h];
              for (let i = 0; i < 8; i++) {
                sum += input[i] * l1W[h * 8 + i];
              }
              hidden[h] = Math.max(0, sum);
            }

            // Layer 2: Dense [2, 4]
            const outData = new Float32Array(outBuf.data);
            for (let o = 0; o < 2; o++) {
              let sum = l2B[o];
              for (let h = 0; h < 4; h++) {
                sum += hidden[h] * l2W[o * 4 + h];
              }
              outData[o] = sum;
            }
          }
        },
        end: () => {},
      }),
      copyBufferToBuffer: (src: WebGpuBufferLike, srcOffset: number, dst: WebGpuBufferLike, dstOffset: number, size: number) => {
        copies.push({ src: src as SimulatedWebGpuBuffer, dst: dst as SimulatedWebGpuBuffer, size });
      },
      finish: () => ({ copies }),
    };
  }

  public destroy(): void {
    this.isDestroyed = true;
  }
}

export class SimulatedWebGpuAdapter implements WebGpuAdapterLike {
  public activeDevice = new SimulatedWebGpuDevice();

  public async requestDevice(descriptor?: any): Promise<WebGpuDeviceLike> {
    return this.activeDevice;
  }
}

export class SimulatedWebGpuContext implements WebGpuContextLike {
  public adapter = new SimulatedWebGpuAdapter();
  public shouldFail = false;

  constructor(options?: { shouldFail?: boolean }) {
    this.shouldFail = options?.shouldFail ?? false;
  }

  public async requestAdapter(options?: any): Promise<WebGpuAdapterLike | null> {
    if (this.shouldFail) return null;
    return this.adapter;
  }
}
