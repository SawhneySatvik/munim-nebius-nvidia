// Cobnut Bakehouse's display face (SIL OFL, downloaded at build time by next/font and served from this site). next.config.ts points
// @/lib/businesses/fonts here; only app/fonts.ts imports it.
import { Fraunces } from "next/font/google";

export const display = Fraunces({ subsets: ["latin"], weight: ["600"], style: ["normal", "italic"], variable: "--font-display-face", display: "swap" });
