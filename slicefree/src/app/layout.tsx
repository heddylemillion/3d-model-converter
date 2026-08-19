import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SliceFree — Free 3D Model to G-code Converter",
  description:
    "Convert STL, OBJ, and 3MF files to G-code for 3D printing — completely free, right in your browser. No uploads, no accounts, no limits.",
  keywords: [
    "3D printing",
    "slicer",
    "gcode",
    "STL to gcode",
    "free slicer",
    "browser slicer",
    "3MF",
    "OBJ",
  ],
  authors: [{ name: "SliceFree" }],
  openGraph: {
    title: "SliceFree — Free 3D Model to G-code Converter",
    description:
      "Convert STL, OBJ, and 3MF files to G-code for 3D printing — completely free, right in your browser.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
