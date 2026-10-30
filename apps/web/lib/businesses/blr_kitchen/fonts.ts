// Kosambari Kitchens' display face, a rounded face that also sets Kannada (SIL OFL, downloaded at build time by next/font and served
// from this site), and its colour tokens. next.config.ts points @/lib/businesses/fonts here; only app/fonts.ts imports it.
import { Baloo_Tamma_2 } from "next/font/google";
import "./theme.css";

export const display = Baloo_Tamma_2({ subsets: ["latin", "kannada"], weight: ["600", "700"], variable: "--font-display-face", display: "swap" });
