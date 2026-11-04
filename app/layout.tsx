import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AuthProvider } from "../lib/auth/AuthContext";
import { LocaleProvider } from "../lib/i18n/LocaleProvider";
import { DEFAULT_LOCALE, dirForLocale, isLocale, LOCALE_COOKIE } from "../lib/i18n/locale";
import { brand } from "../lib/branding";
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
  title: brand.title,
  description: brand.description,
  icons: {
    icon: brand.icon,
    shortcut: brand.icon,
    apple: brand.icon,
  },
};

// Without this, mobile browsers render the page at a virtual desktop width
// (~980px) and zoom out to fit, so every `@media (max-width: ...)` rule in
// globals.css never actually triggers on a real phone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const cookieLocale = jar.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return (
    <html lang={locale} dir={dirForLocale(locale)} data-brand={brand.id}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LocaleProvider initialLocale={locale}>
          <AuthProvider>{children}</AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
