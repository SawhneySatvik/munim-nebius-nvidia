// Every family is SIL OFL, downloaded at build time by next/font and served from this site (works on any host).
// Inter's latin-ext subset carries the rupee sign (U+20B9) and tabular figures; money never uses a display face.
// The display face is the business's own (lib/businesses/<id>/fonts.ts, with its colour tokens), so a build carries only its own.
import { display } from "@/lib/businesses/fonts";
import { Inter } from "next/font/google";

export const body = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-body-face", display: "swap" });

/** The font classes for <html>: the business's display face and Inter. */
export const fontClasses = `${display.variable} ${body.variable}`;
