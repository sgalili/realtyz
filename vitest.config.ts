import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: [
      { find: /^lucide-react$/, replacement: path.resolve(__dirname, './src/lib/loading-icons.tsx') },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
});
