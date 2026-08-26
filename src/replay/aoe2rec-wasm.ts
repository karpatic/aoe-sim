import * as aoe2recBindings from "aoe2rec-js/aoe2rec_js_bg.js";
import wasmUrl from "aoe2rec-js/aoe2rec_js_bg.wasm?url";

export interface Aoe2recWasmModule {
  readonly parse_rec: (buffer: ArrayBuffer) => unknown;
  readonly parse_rec_summary: (buffer: ArrayBuffer) => {
    readonly duration: number;
    readonly teams: readonly unknown[];
    readonly header: unknown;
    free(): void;
  };
}

type Aoe2recWasmBindings = Aoe2recWasmModule & {
  readonly __wbg_set_wasm: (wasm: WebAssembly.Exports) => void;
};

type Aoe2recWasmExports = WebAssembly.Exports & {
  readonly __wbindgen_start?: () => void;
};

let modulePromise: Promise<Aoe2recWasmModule> | undefined;

export function loadAoe2recWasm(): Promise<Aoe2recWasmModule> {
  modulePromise ??= initializeAoe2recWasm().catch((error: unknown) => {
    modulePromise = undefined;
    throw error;
  });
  return modulePromise;
}

async function initializeAoe2recWasm(): Promise<Aoe2recWasmModule> {
  const bindings = aoe2recBindings as unknown as Aoe2recWasmBindings;
  const imports: WebAssembly.Imports = {
    "./aoe2rec_js_bg.js": bindings as unknown as WebAssembly.ModuleImports
  };
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to load aoe2rec WASM asset: ${response.status}`);
  }

  const instance = await instantiateWasm(response, imports);
  const exports = instance.exports as Aoe2recWasmExports;
  bindings.__wbg_set_wasm(exports);
  if (typeof exports.__wbindgen_start !== "function") {
    throw new Error("aoe2rec WASM did not expose __wbindgen_start.");
  }
  exports.__wbindgen_start();

  return {
    parse_rec: bindings.parse_rec,
    parse_rec_summary: bindings.parse_rec_summary
  };
}

async function instantiateWasm(
  response: Response,
  imports: WebAssembly.Imports
): Promise<WebAssembly.Instance> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (typeof WebAssembly.instantiateStreaming === "function" && contentType.includes("application/wasm")) {
    const result = await WebAssembly.instantiateStreaming(response, imports);
    return result.instance;
  }

  const bytes = await response.arrayBuffer();
  const result = await WebAssembly.instantiate(bytes, imports);
  return result.instance;
}
