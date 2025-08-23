import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/route": "http://localhost:3001",
      "/data": "http://localhost:3001"
    }
  }
});
