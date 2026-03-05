import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "capacitor-native-biometric": path.resolve(
        __dirname,
        "./src/shims/capacitor-native-biometric.ts",
      ),
      "capacitor-health": path.resolve(__dirname, "./src/shims/capacitor-health.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      external: [
        'capacitor-native-biometric',
        'capacitor-health',
      ],
    },
  },
}));
