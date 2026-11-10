import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwind()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          query: ["@tanstack/react-query"],
          motion: ["motion/react"],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/media": "http://localhost:8787",
    },
  },
});
