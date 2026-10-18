import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

// self-hosted: builds work offline and no request goes to Google at runtime
const sans = localFont({
  src: "./fonts/PlusJakartaSans-Variable.woff2",
  variable: "--font-sans-app",
  weight: "200 800",
  display: "swap",
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "FlyPool - Share the cab from the airport", template: "%s - FlyPool" },
  description: "Landed? Match with travellers from your flight window who are heading the same way, and split the cab fare.",
  applicationName: "FlyPool",
  openGraph: {
    title: "FlyPool - Share the cab from the airport",
    description: "Match with travellers landing around the same time and heading your way. Split the cab, not the safety.",
    type: "website",
    siteName: "FlyPool",
  },
  appleWebApp: { capable: true, title: "FlyPool", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5fd" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1124" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
