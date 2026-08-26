import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  worker: {
    format: "es"
  },
  server: {
    host: "0.0.0.0"
  },
  preview: {
    host: "0.0.0.0"
  }
});
