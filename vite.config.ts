import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: ".",
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "main.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (asset) =>
          asset.name?.endsWith(".css") ? "styles.css" : (asset.name ?? "asset"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
