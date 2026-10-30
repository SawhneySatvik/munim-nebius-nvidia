// The Snacky Shack's display face, a heavy, loud poster face (SIL OFL, downloaded at build time by next/font and served from this
// site), and its colour tokens. next.config.ts points @/lib/businesses/fonts here; only app/fonts.ts imports it.
import { Bowlby_One } from "next/font/google";
import "./theme.css";

export const display = Bowlby_One({ subsets: ["latin"], weight: "400", variable: "--font-display-face", display: "swap" });
