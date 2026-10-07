import type { UnifiedProcessorOptions } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// Sanitize authored content first; only the trusted math renderer adds markup.
export const publicMarkdown: UnifiedProcessorOptions = {
  remarkPlugins: [remarkMath],
  rehypePlugins: [
    [rehypeSanitize, { ...defaultSchema, attributes: { ...defaultSchema.attributes, code: [["className", /^language-./, "math-inline", "math-display"]] } }],
    [rehypeKatex, { trust: false, throwOnError: false, maxExpand: 1000, maxSize: 20 }],
  ],
};
