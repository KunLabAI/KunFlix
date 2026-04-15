import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import I18nProvider from "@/i18n/I18nProvider";
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
  title: "KunFlix",
  description: "An AI-powered infinite narrative theater",
  icons: {
    icon: "/KunFlix_logo.png",
    shortcut: "/KunFlix_logo.png",
    apple: "/KunFlix_logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AntdRegistry>
          <I18nProvider>
            <AuthProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </AuthProvider>
          </I18nProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
