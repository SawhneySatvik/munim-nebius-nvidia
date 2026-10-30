import type { Metadata, Viewport } from "next";
import { BUSINESS, SITE_ATTR } from "@/lib/businesses";
import { fontClasses } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BUSINESS.meta.title, template: BUSINESS.meta.template },
  description: BUSINESS.meta.description,
};

export const viewport: Viewport = { themeColor: BUSINESS.meta.themeColor };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={BUSINESS.lang} className={fontClasses} {...SITE_ATTR}>
      <body className="flex min-h-dvh flex-col">
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
