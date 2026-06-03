import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { ToastProvider } from "@/components/ui/toast";
import { PageTracker } from "@/components/page-tracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Product OS",
  description: "AI-Powered local software engineering workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full bg-slate-950 text-slate-100 antialiased overflow-hidden font-sans" suppressHydrationWarning>
        <ToastProvider>
          <PageTracker />
          <div className="flex h-full w-full">
            {/* Sidebar Navigation */}
            <Sidebar />

            {/* Main Layout Area */}
            <div className="flex flex-1 flex-col pl-64">
              {/* Top Bar Header */}
              <Header />

              {/* Content Container */}
              <main className="flex-1 overflow-y-auto bg-slate-950 p-8">
                {children}
              </main>
            </div>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
