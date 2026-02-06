import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import devtoolsJson from 'vite-plugin-devtools-json';

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(Date.now().toString(36)),
  },
  plugins: [devtoolsJson(), tailwindcss(), reactRouter(), tsconfigPaths()],
});
