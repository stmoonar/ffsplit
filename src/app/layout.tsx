import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FairSplit — AI Agent Fair Revenue Splitting",
  description:
    "Fair revenue-splitting protocol for AI Agent collaboration economies, based on game theory's Shapley Value.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* Ambient glow */}
        <div
          className="pointer-events-none fixed left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "800px",
            height: "800px",
            borderRadius: "50%",
            background: "var(--accent)",
            opacity: 0.02,
            filter: "blur(120px)",
          }}
        />
        {children}
      </body>
    </html>
  );
}
