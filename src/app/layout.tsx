import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Patron Hub — Your Content Library",
  description: "Track, organize, and archive content from your paid creator subscriptions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
