import { defineConfig } from "vite";

const htmlEntry = (name: string): string => new URL(name, import.meta.url).pathname;

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        index: htmlEntry("index.html"),
        dataview: htmlEntry("dataview.html"),
        dataviewViewer: htmlEntry("dataview-viewer.html"),
        dataviewData: htmlEntry("dataview-data.html"),
        dataviewDataViewer: htmlEntry("dataview-data-viewer.html")
      }
    }
  },
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
