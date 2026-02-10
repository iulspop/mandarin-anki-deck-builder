import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import devtoolsJson from "vite-plugin-devtools-json";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(Date.now().toString(36)),
  },
  plugins: [
    tailwindcss(),
    !process.env.VITEST && reactRouter(),
    tsconfigPaths(),
    devtoolsJson(),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          include: ["app/**/*.test.ts"],
          name: "unit-tests",
        },
      },
      {
        extends: true,
        test: {
          environment: "happy-dom",
          include: ["app/**/*.test.tsx"],
          name: "react-happy-dom-tests",
        },
      },
    ],
  },
});
