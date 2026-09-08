import { createHash } from "node:crypto";

export function renderShimmerCheck(html, css) {
  const revision = createHash("sha256").update(css).digest("hex").slice(0, 12);
  return html
    .replace("<head>", '<head>\n    <meta name="robots" content="noindex, nofollow" />')
    .replace("</head>", `  <link rel="stylesheet" href="./diagnostics/shimmer.css?v=${revision}" />\n  </head>`);
}
