/// <reference types="vite/client" />

declare module "aoe2rec-js/aoe2rec_js_bg.js" {
  export * from "aoe2rec-js";
  export function __wbg_set_wasm(wasm: WebAssembly.Exports): void;
}
