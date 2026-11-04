import type { Metadata } from "next";
import { VerifyEmailScreen } from "@/components/auth/VerifyEmailScreen";
import { brand } from "@/lib/branding";

export const metadata: Metadata = {
  title: `Verify your email | ${brand.name}`,
  description: "Confirm your email address or request a new verification link.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return <VerifyEmailScreen />;
}
