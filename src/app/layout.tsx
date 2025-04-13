import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner"
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DLSU GPA Calculator | De La Salle University Grade Calculator",
  description: "Calculate your DLSU GPA with ease. Free, accurate De La Salle University grade calculator for students. Convert your DLSU grades to GPA instantly.",
  keywords: ["DLSU GPA calculator", "DLSU grade calculator", "De La Salle University GPA", "DLSU grade computation", "La Salle grade calculator"],
  openGraph: {
    title: "DLSU GPA Calculator | De La Salle University Grade Calculator",
    description: "Calculate your DLSU GPA with ease. Free, accurate De La Salle University grade calculator for students.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "DLSU GPA Calculator | De La Salle University Grade Calculator",
    description: "Calculate your DLSU GPA with ease. Free, accurate De La Salle University grade calculator for students.",
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="index, follow" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster position="top-right" expand={true} richColors />
      </body>
    </html>
  );
}
