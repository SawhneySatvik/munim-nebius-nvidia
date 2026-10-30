import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import CaresPage from "../app/cares/page.tsx";
import Home from "../app/page.tsx";
import { ContactCard } from "../components/ContactCard.tsx";
import { SimulationStrip } from "../components/Labels.tsx";
import { contactEmail } from "../lib/contact.ts";

// Text as a reader sees it (tags dropped, entities decoded) so a label split by markup still matches.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&");

describe("simulation labels (hard rule 5)", () => {
  test("the site-wide strip names simulated suppliers and recipients, synthetic data and recorded payments", () => {
    const t = text(renderToStaticMarkup(<SimulationStrip />));
    expect(t).toContain("Suppliers and food-donation recipients are simulated");
    expect(t).toContain("all business data is synthetic");
    expect(t).toContain("payments are recorded — never processed");
  });

  test("/cares carries the Cares labels literally", () => {
    const t = text(renderToStaticMarkup(<CaresPage />));
    for (const label of [
      "Simulated recipient",
      "Recorded, never processed",
      "Measured on synthetic data",
      "to simulated recipients",
      "Check your local food-donation rules",
    ])
      expect(t).toContain(label);
    expect(t).not.toMatch(/\bcompliant\b|\bprotected\b/i);
  });

  test("the landing page labels the guarantee, statuses and the simulated recipient, and shows no money figures", () => {
    const t = text(renderToStaticMarkup(<Home />));
    expect(t).toContain("Nothing changes your books without your approval");
    expect(t).toContain("Every number traces to your records");
    for (const s of ["In the demo", "Built", "In progress", "On the roadmap"]) expect(t).toContain(s);
    // T-128: the staff screens are built, so no feature says they are still coming.
    expect(t).not.toMatch(/screens in progress|being built|Not started/);
    expect(t).toContain("Simulated recipient");
    expect(t).toContain("Contact us");
    // No ₹/A$ amounts or percentages: the site has no CI-measured figure to show.
    expect(t).not.toMatch(/[₹$]\s?\d|\d\s?%/);
  });
});

describe("status and country copy is honest (checked against the code, 16 Oct 2026)", () => {
  test("country is fixed at onboarding: no 'flip' or 'switching' language on the landing page, Cares page or layout", () => {
    const layout = readFileSync(join(__dirname, "../app/layout.tsx"), "utf8"); // next/font cannot load under vitest
    const t = text(renderToStaticMarkup(<Home />)) + text(renderToStaticMarkup(<CaresPage />)) + layout;
    // No \b: stripping tags glues neighbouring words together ("flip2 to 5 outlets").
    expect(t).not.toMatch(/flip|switching a business/i);
    expect(text(renderToStaticMarkup(<Home />))).toContain("A business in Australia runs on the AU pack");
  });

  test("Cares is 'Built' with the database, API, AI and screens built (T-128)", () => {
    const cares = text(renderToStaticMarkup(<CaresPage />));
    expect(cares).toContain("Built");
    expect(cares).toContain("Database, API, AI and screens built.");
    expect(cares).not.toMatch(/screens are being built|screens in progress|API contract built/);
    expect(text(renderToStaticMarkup(<Home />))).toContain("Database, API, AI and screens built. Recipients are simulated.");
  });

  test("the page builder and the AU pack say exactly what is true (T-128, R67 W-2, W-3)", () => {
    const t = text(renderToStaticMarkup(<Home />));
    expect(t).toContain("Publishing is switched off on the shared demo business.");
    expect(t).toContain("The live demo business is in India.");
  });

  test("the Cares illustration: nothing expiring today, no AI-drafted cooked food, the cooked line is the owner's own", () => {
    const t = text(renderToStaticMarkup(<CaresPage />));
    expect(t).not.toMatch(/best before today/i);
    expect(t).toContain("best before in 3 days");
    expect(t).toContain("Drafted by the AI, approved by the owner.");
    expect(t).toContain("Cooked food, such as dal makhani, is a separate line the owner lists by their own hand.");
    expect(text(renderToStaticMarkup(<Home />))).not.toContain("Veg biryani, packed");
  });
});

describe("contact address only from NEXT_PUBLIC_CONTACT_EMAIL", () => {
  test("unset or malformed → no address", () => {
    expect(contactEmail(undefined)).toBeNull();
    expect(contactEmail("")).toBeNull();
    expect(contactEmail("not an email")).toBeNull();
    expect(contactEmail("a@b.co?bcc=x@y.z")).toBeNull();
    expect(contactEmail(" hello@munim.example ")).toBe("hello@munim.example");
  });

  test("no address → 'Contact details coming soon' and no mailto", () => {
    const html = renderToStaticMarkup(<ContactCard email={null} />);
    expect(html).toContain("Contact details coming soon");
    expect(html).not.toContain("mailto:");
  });

  test("an address → a mailto link to it", () => {
    const html = renderToStaticMarkup(<ContactCard email="hello@munim.example" />);
    expect(html).toContain('href="mailto:hello@munim.example?subject=');
    expect(html).not.toContain("Contact details coming soon");
  });
});
