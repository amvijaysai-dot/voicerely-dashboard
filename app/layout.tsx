import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voicerely Dashboard",
  description: "Voice agent analytics & admin console",
};

// Runs before paint to set the theme class from localStorage / system pref,
// preventing a flash of the wrong theme. Kept inline + dependency-free.
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("voicerely-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = stored ? stored === "dark" : prefersDark;
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();
`;

// Paddle.js SDK initialization script
const paddleScript = `
(function () {
  try {
    var env = "${process.env.PADDLE_ENV || "sandbox"}";
    var vendorId = "${process.env.PADDLE_VENDOR_ID || ""}";
    var script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = function () {
      if (window.Paddle) {
        window.Paddle.Environment.set(env);
        if (vendorId) {
          window.Paddle.Setup({ vendor: parseInt(vendorId) });
        }
      }
    };
    document.head.appendChild(script);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: paddleScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
