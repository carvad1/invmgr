import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const path = id.replaceAll("\\", "/");
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(path))
            return "react";
          if (path.includes("/node_modules/recharts/")) return "charts";
        },
      },
    },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
