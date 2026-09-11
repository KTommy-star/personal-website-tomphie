import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { resolveDeployment } from "./src/lib/deployment.js";

const deployment = resolveDeployment(process.env);

export default defineConfig({
  ...deployment,
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
});
