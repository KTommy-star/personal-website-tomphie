import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { resolveDeployment } from "./src/lib/deployment.js";

const deployment = resolveDeployment(process.env);

export default defineConfig({
  ...deployment,
  output: "static",
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Retain WebKit glass declarations as well as the standard property.
      cssTarget: ["chrome111", "firefox128", "safari16.4", "ios16.4"],
    },
  },
});
