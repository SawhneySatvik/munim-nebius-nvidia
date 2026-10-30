import { Icon } from "./Icon.tsx";

export function ContactCard({ email }: { email: string | null }) {
  if (!email)
    return (
      <div className="contact-card">
        <Icon name="mail" size={28} />
        <p className="contact-email">Contact details coming soon</p>
        <p className="muted">We're setting up our inbox. Please check back shortly.</p>
      </div>
    );
  const subject = encodeURIComponent("Munim — I'd like to talk");
  return (
    <div className="contact-card">
      <Icon name="mail" size={28} />
      <p className="contact-email">{email}</p>
      <div className="cta-row" style={{ marginBottom: 0 }}>
        <a className="btn btn-primary" href={`mailto:${email}?subject=${subject}`}>
          Email us
        </a>
      </div>
    </div>
  );
}
