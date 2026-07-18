// scripts/gen-logo.mjs
// Generates components/Logo.tsx from the root logo.svg and moves the original
// into public/ as a static fallback asset.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "logo.svg");
const svg = fs.readFileSync(src, "utf8");

// Extract the inner markup (between the opening <svg ...> and the closing </svg>).
// The opening <svg> tag may span multiple lines and contain several `>`-like
// sequences, so we locate the real tag close: the last `>` that appears
// before the first content element (`<g`).
const openStart = svg.indexOf("<svg");
const contentStart = svg.indexOf("<g", openStart);
if (openStart === -1 || contentStart === -1) {
  throw new Error("Could not find <svg>/<g> tags in logo.svg");
}
const tagEnd = svg.lastIndexOf(">", contentStart);
const openTag = svg.slice(openStart, tagEnd + 1);
const inner = svg.slice(tagEnd + 1, svg.lastIndexOf("</svg>"));

// Tint the artwork with currentColor so Tailwind text-* classes control color.
const innerMod = inner.replace(/fill="#000000"/g, 'fill="currentColor"');

const newOpen = `<svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 2400 2040"
    fill="currentColor"
    className={className}
    role="img"
    aria-label="Voicerely"
    {...props}`;

const comp = `// components/Logo.tsx
//
// Official Voicerely logo as an inline, theme-aware SVG. Accepts a Tailwind
// \`className\` (e.g. "h-8 w-auto") to control height/width, and inherits the
// surrounding text color via \`currentColor\` so it tints to the accent or
// foreground automatically. The original asset lives at /public/logo.svg as a
// static fallback.

import type { SVGProps } from "react";

export function Logo({ className = "h-8 w-auto", ...props }: SVGProps<SVGSVGElement>) {
  return (
    ${newOpen}
  >
      ${innerMod}
    </svg>
  );
}
`;

fs.writeFileSync(path.join(root, "components", "Logo.tsx"), comp);

// Move original into public/ as a static fallback.
fs.copyFileSync(src, path.join(root, "public", "logo.svg"));
fs.unlinkSync(src);

console.log("Logo.tsx generated; logo.svg moved to public/");