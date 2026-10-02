/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Satellite Browser Runtime Verification Harness & Test Fixtures.
 * 
 * Invariants:
 * 1. Honest Evidence Classification: Accurately detects whether DOM, WebGL, WebGPU, and camera
 *    hardware are present, defaulting to explicit ENVIRONMENT_PENDING in headless Node.js environments.
 * 2. Deterministic Testing Double: Provides compliant Three.js shims for verifying scene graph
 *    assembly, buffer updates, and draw calls without browser automation dependencies.
 * 3. Fail-Closed Diagnostics: Flags capability mismatches cleanly without crashing the platform.
 */

import { ThreeJsShim } from "./satellite-3d-renderer-adapter.js";

export interface BrowserCapabilityReport {
  readonly isBrowser: boolean;
  readonly hasWindow: boolean;
  readonly hasDocument: boolean;
  readonly hasCanvas: boolean;
  readonly hasOffscreenCanvas: boolean;
  readonly hasWebGL: boolean;
  readonly hasWebGL2: boolean;
  readonly hasWebGPU: boolean;
  readonly hasMediaDevices: boolean;
  readonly hasGetUserMedia: boolean;
  readonly hasThreeJs: boolean;
  readonly status: "ENVIRONMENT_PENDING" | "BROWSER_AVAILABLE" | "HARDWARE_ACCELERATED";
  readonly statusSummary: string;
  readonly recommendations: readonly string[];
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * Inspects the current execution runtime for browser and hardware capabilities.
 */
export function inspectBrowserRuntimeCapabilities(): BrowserCapabilityReport {
  const hasWindow = typeof window !== "undefined";
  const hasDocument = typeof document !== "undefined";
  const isBrowser = hasWindow && hasDocument;
  const hasCanvas = hasDocument && typeof (document as any).createElement === "function";
  const hasOffscreenCanvas = typeof OffscreenCanvas !== "undefined";

  let hasWebGL = false;
  let hasWebGL2 = false;
  if (hasCanvas) {
    try {
      const c = (document as any).createElement("canvas");
      hasWebGL = !!c.getContext("webgl");
      hasWebGL2 = !!c.getContext("webgl2");
    } catch {
      // Ignored
    }
  }

  const hasWebGPU = hasWindow && typeof (navigator as any)?.gpu !== "undefined";
  const hasMediaDevices = hasWindow && typeof (navigator as any)?.mediaDevices !== "undefined";
  const hasGetUserMedia = hasMediaDevices && typeof (navigator as any)?.mediaDevices?.getUserMedia === "function";
  const hasThreeJs = hasWindow && typeof (window as any)?.THREE !== "undefined";

  let status: BrowserCapabilityReport["status"] = "ENVIRONMENT_PENDING";
  let statusSummary = "ENVIRONMENT_PENDING: Headless Node.js runtime detected";
  const recommendations: string[] = [];

  if (hasWebGL2 || hasWebGPU) {
    status = "HARDWARE_ACCELERATED";
    statusSummary = "HARDWARE_ACCELERATED: Hardware-backed WebGL2/WebGPU available";
  } else if (hasWindow && hasDocument) {
    status = "BROWSER_AVAILABLE";
    statusSummary = "BROWSER_AVAILABLE: Browser DOM active, canvas acceleration pending";
    if (!hasWebGL) recommendations.push("Enable WebGL context in browser");
  } else {
    recommendations.push("Execute in browser runtime or headless browser harness for visual rendering");
    recommendations.push("Provide camera stream via navigator.mediaDevices.getUserMedia");
  }

  return Object.freeze({
    isBrowser,
    hasWindow,
    hasDocument,
    hasCanvas,
    hasOffscreenCanvas,
    hasWebGL,
    hasWebGL2,
    hasWebGPU,
    hasMediaDevices,
    hasGetUserMedia,
    hasThreeJs,
    status,
    statusSummary,
    recommendations: Object.freeze(recommendations),
    details: Object.freeze({
      nodeVersion: typeof process !== "undefined" ? process.version : "unknown",
      userAgent: hasWindow ? (navigator as any).userAgent : "headless-node",
    }),
  });
}

export interface SyntheticThreeCallRecord {
  readonly method: string;
  readonly args: readonly unknown[];
  readonly timestampMs: number;
}

export interface SyntheticThreeEnvironment {
  readonly three: ThreeJsShim;
  readonly calls: readonly SyntheticThreeCallRecord[];
  readonly sceneInstances: readonly any[];
  readonly cameraInstances: readonly any[];
  readonly rendererInstances: readonly any[];
  readonly meshInstances: readonly any[];
  readonly geometryInstances: readonly any[];
  readonly materialInstances: readonly any[];
  readonly scene?: any;
  readonly camera?: any;
  readonly renderer?: any;
}

/**
 * Creates a deterministic, fully compliant Three.js test double for Node.js / CI testing.
 */
export function createSyntheticThreeEnvironment(): SyntheticThreeEnvironment {
  const calls: SyntheticThreeCallRecord[] = [];
  const sceneInstances: any[] = [];
  const cameraInstances: any[] = [];
  const rendererInstances: any[] = [];
  const meshInstances: any[] = [];
  const geometryInstances: any[] = [];
  const materialInstances: any[] = [];

  const recordCall = (method: string, args: unknown[]) => {
    calls.push({ method, args, timestampMs: Date.now() });
  };

  class MockScene {
    public children: any[] = [];
    constructor() {
      sceneInstances.push(this);
      recordCall("Scene.constructor", []);
    }
    public add(obj: any) {
      this.children.push(obj);
      recordCall("Scene.add", [obj]);
    }
    public remove(obj: any) {
      const idx = this.children.indexOf(obj);
      if (idx !== -1) this.children.splice(idx, 1);
      recordCall("Scene.remove", [obj]);
    }
  }

  class MockPerspectiveCamera {
    public fov: number;
    public aspect: number;
    public near: number;
    public far: number;
    public position = { x: 0, y: 0, z: 0 };
    constructor(fov: number, aspect: number, near: number, far: number) {
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
      cameraInstances.push(this);
      recordCall("PerspectiveCamera.constructor", [fov, aspect, near, far]);
    }
    public updateProjectionMatrix() {
      recordCall("PerspectiveCamera.updateProjectionMatrix", []);
    }
    public lookAt(x: number, y: number, z: number) {
      recordCall("PerspectiveCamera.lookAt", [x, y, z]);
    }
  }

  class MockWebGLRenderer {
    public domElement: any;
    public width: number = 0;
    public height: number = 0;
    public pixelRatio: number = 1;
    public renderCallsCount: number = 0;
    constructor(options?: any) {
      this.domElement = options?.canvas ?? { width: 0, height: 0 };
      rendererInstances.push(this);
      recordCall("WebGLRenderer.constructor", [options]);
    }
    public setSize(w: number, h: number, _updateStyle?: boolean) {
      this.width = w;
      this.height = h;
      recordCall("WebGLRenderer.setSize", [w, h]);
    }
    public setPixelRatio(r: number) {
      this.pixelRatio = r;
      recordCall("WebGLRenderer.setPixelRatio", [r]);
    }
    public render(scene: any, camera: any) {
      this.renderCallsCount++;
      recordCall("WebGLRenderer.render", [scene, camera]);
    }
    public disposed: boolean = false;
    public get renderCalls(): number {
      return this.renderCallsCount;
    }
    public dispose() {
      this.disposed = true;
      recordCall("WebGLRenderer.dispose", []);
    }
  }

  class MockBufferAttribute {
    public array: ArrayLike<number>;
    public itemSize: number;
    public needsUpdate: boolean = false;
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }

  class MockBufferGeometry {
    public attributes: Record<string, MockBufferAttribute> = {};
    public index: MockBufferAttribute | null = null;
    public isDisposed: boolean = false;
    constructor() {
      geometryInstances.push(this);
      recordCall("BufferGeometry.constructor", []);
    }
    public setAttribute(name: string, attr: MockBufferAttribute) {
      this.attributes[name] = attr;
      recordCall("BufferGeometry.setAttribute", [name, attr]);
      return this;
    }
    public getAttribute(name: string): MockBufferAttribute | undefined {
      return this.attributes[name];
    }
    public setIndex(attr: MockBufferAttribute) {
      this.index = attr;
      recordCall("BufferGeometry.setIndex", [attr]);
      return this;
    }
    public dispose() {
      this.isDisposed = true;
      recordCall("BufferGeometry.dispose", []);
    }
  }

  class MockMeshPhysicalMaterial {
    public opacity: number;
    public transparent: boolean;
    public wireframe: boolean;
    public roughness: number;
    public metalness: number;
    public sheen: number;
    public clearcoat: number;
    public isDisposed: boolean = false;
    constructor(params?: any) {
      this.opacity = params?.opacity ?? 1.0;
      this.transparent = params?.transparent ?? false;
      this.wireframe = params?.wireframe ?? false;
      this.roughness = params?.roughness ?? 0.5;
      this.metalness = params?.metalness ?? 0.0;
      this.sheen = params?.sheen ?? 0.0;
      this.clearcoat = params?.clearcoat ?? 0.0;
      materialInstances.push(this);
      recordCall("MeshPhysicalMaterial.constructor", [params]);
    }
    public dispose() {
      this.isDisposed = true;
      recordCall("MeshPhysicalMaterial.dispose", []);
    }
  }

  class MockMeshBasicMaterial {
    public opacity: number;
    public transparent: boolean;
    public wireframe: boolean;
    public isDisposed: boolean = false;
    constructor(params?: any) {
      this.opacity = params?.opacity ?? 1.0;
      this.transparent = params?.transparent ?? false;
      this.wireframe = params?.wireframe ?? false;
      materialInstances.push(this);
      recordCall("MeshBasicMaterial.constructor", [params]);
    }
    public dispose() {
      this.isDisposed = true;
      recordCall("MeshBasicMaterial.dispose", []);
    }
  }

  class MockMesh {
    public geometry: any;
    public material: any;
    public visible: boolean = true;
    public position = { x: 0, y: 0, z: 0 };
    constructor(geometry?: any, material?: any) {
      this.geometry = geometry;
      this.material = material;
      meshInstances.push(this);
      recordCall("Mesh.constructor", [geometry, material]);
    }
  }

  class MockAmbientLight {
    constructor(color?: any, intensity?: number) {
      recordCall("AmbientLight.constructor", [color, intensity]);
    }
  }

  class MockDirectionalLight {
    constructor(color?: any, intensity?: number) {
      recordCall("DirectionalLight.constructor", [color, intensity]);
    }
  }

  class MockColor {
    constructor(color?: any) {
      recordCall("Color.constructor", [color]);
    }
  }

  class MockVector3 {
    public x: number;
    public y: number;
    public z: number;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }

  const three: ThreeJsShim = {
    Scene: MockScene as any,
    PerspectiveCamera: MockPerspectiveCamera as any,
    WebGLRenderer: MockWebGLRenderer as any,
    BufferGeometry: MockBufferGeometry as any,
    BufferAttribute: MockBufferAttribute as any,
    MeshPhysicalMaterial: MockMeshPhysicalMaterial as any,
    MeshBasicMaterial: MockMeshBasicMaterial as any,
    Mesh: MockMesh as any,
    AmbientLight: MockAmbientLight as any,
    DirectionalLight: MockDirectionalLight as any,
    Color: MockColor as any,
    Vector3: MockVector3 as any,
  };

  return {
    three,
    calls,
    sceneInstances,
    cameraInstances,
    rendererInstances,
    meshInstances,
    geometryInstances,
    materialInstances,
    get scene(): any {
      return sceneInstances[0];
    },
    get camera(): any {
      return cameraInstances[0];
    },
    get renderer(): any {
      return rendererInstances[0];
    },
  };
}

/**
 * Creates a synthetic HTMLCanvasElement test double for simulated WebGL rendering.
 */
export function createSyntheticCanvas(width = 1280, height = 720): any {
  const glMock = {
    clearColor: () => {},
    clear: () => {},
    viewport: () => {},
  };

  return {
    width,
    height,
    getContext: (contextType: string) => {
      if (contextType === "webgl2" || contextType === "webgl") {
        return glMock;
      }
      return null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
