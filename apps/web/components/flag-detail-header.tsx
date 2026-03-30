import Link from "next/link";

interface FlagDetailHeaderProps {
  backHref: string;
  errorMessage: string | null;
  name: string;
  noticeMessage: string | null;
}

export default function FlagDetailHeader(input: FlagDetailHeaderProps) {
  return (
    <>
      <section className="detail-header">
        <div>
          <h1>{input.name}</h1>
          <p className="hero-copy">
            Metadata, archive controls, variants, and environment settings are live from the admin
            API on the same page.
          </p>
        </div>
        <div className="detail-actions">
          <Link className="secondary-button detail-back-link" href={input.backHref}>
            Back to console
          </Link>
        </div>
      </section>

      {input.noticeMessage ? (
        <p className="detail-feedback detail-feedback-success">{input.noticeMessage}</p>
      ) : null}
      {input.errorMessage ? (
        <p className="detail-feedback detail-feedback-error">{input.errorMessage}</p>
      ) : null}
    </>
  );
}
