import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hazem Daily Dashboard",
  description: "A private daily workspace for calendar events, tasks, notes, and progress.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
