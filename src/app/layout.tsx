import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Urban Alchemist",
  description: "An immersive scavenger hunt that turns real-world photos into theatrical lore",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
