/// <reference types="vite/client" />

declare module "aoe2rec-js/aoe2rec_js_bg.js" {
  export * from "aoe2rec-js";
  export function __wbg_set_wasm(wasm: WebAssembly.Exports): void;
}

interface FileSystemHandlePermissionDescriptor {
  readonly mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker?(options?: {
    readonly id?: string;
    readonly mode?: "read" | "readwrite";
    readonly startIn?:
      | "desktop"
      | "documents"
      | "downloads"
      | "music"
      | "pictures"
      | "videos"
      | FileSystemHandle;
  }): Promise<FileSystemDirectoryHandle>;
}
