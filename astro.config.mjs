import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { resolveDeployment } from "./src/lib/deployment.js";
import { unified } from "@astrojs/markdown-remark";
import { publicMarkdown } from "./src/lib/public-markdown.ts";

const deployment = resolveDeployment(process.env);

export default defineConfig({
  ...deployment,
  output: "static",
  markdown: {
    processor: unified(publicMarkdown),
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Retain WebKit glass declarations as well as the standard property.
      cssTarget: ["chrome111", "firefox128", "safari16.4", "ios16.4"],
    },
  },
});
