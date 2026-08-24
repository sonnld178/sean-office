import { Plus_Jakarta_Sans } from "next/font/google";

export const fontEn = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export function localeFontClass(): string {
  return fontEn.className;
}
