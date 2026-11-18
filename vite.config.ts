import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { localApi } from "./server/vite-api";
export default defineConfig({
  plugins: [react(), localApi()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.data/**", "**/.sites-runtime/**", "**/*.sqlite*", "**/*.db"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL("./index.html", import.meta.url)),
        design: fileURLToPath(new URL("./design.html", import.meta.url)),
      },
      output: {
        manualChunks: {
          react: ["react", "react-dom", "zustand"],
          motion: ["framer-motion"],
          drag: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
        },
      },
    },
  },
});
