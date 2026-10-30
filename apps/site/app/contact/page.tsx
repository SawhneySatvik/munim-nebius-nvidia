import type { Metadata } from "next";
import Link from "next/link";
import { ContactCard } from "../../components/ContactCard.tsx";
import { contactEmail } from "../../lib/contact.ts";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Talk to the Munim team about the AI back office for restaurants and shops.",
};

export default function ContactPage() {
  return (
    <div className="wrap">
      <header className="page-head ruled margin-line">
        <p className="eyebrow">Contact us</p>
        <h1 className="display">Let's talk about your business.</h1>
        <p className="lede">
          Tell us how many outlets or brands you run and what you use today. We'll walk you through Munim on a synthetic business like yours.
        </p>
      </header>
      <ContactCard email={contactEmail()} />
      <p className="muted" style={{ marginTop: 24 }}>
        Building a storefront? Start with the <Link href="/developers">developer portal</Link>.
      </p>
    </div>
  );
}
