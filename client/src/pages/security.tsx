import { LegalPage, LegalSection, Pending } from "@/components/legal-page";
import {
  NO_FUND_MOVEMENT,
  PAPER_DEFAULT,
  DATA_TO_AI_PROVIDERS,
} from "@shared/disclosures";

export default function SecurityPage() {
  return (
    <LegalPage
      path="/security"
      title="Security"
      intro="How Fincai connects to your brokerage account, what it can and cannot do, and how your data is handled."
    >
      <LegalSection heading="What Fincai cannot do">
        <p data-testid="text-no-fund-movement">{NO_FUND_MOVEMENT}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Fincai cannot withdraw funds from your brokerage account.</li>
          <li>Fincai cannot deposit or transfer funds or securities out of your account.</li>
          <li>
            Fincai never sees or stores your Robinhood username or password — you
            sign in on Robinhood's own website.
          </li>
          <li>
            Fincai's integration is limited to Robinhood's official Trading API;
            it implements no funds-transfer, withdrawal, or bank-link
            functionality.
          </li>
        </ul>
        <p>
          The exact set of permissions requested during authorization is{" "}
          <Pending label="Robinhood OAuth scope list — HD-08" />. We will
          enumerate each granted scope, and the feature that requires it, here.
        </p>
      </LegalSection>

      <LegalSection heading="How the connection works">
        <p>
          Fincai connects to Robinhood using the OAuth 2.1 authorization-code
          flow with PKCE. You authorize the connection on Robinhood's own domain,
          not inside Fincai. Fincai requests only the standard authorization-code
          and refresh-token grants and communicates with Robinhood exclusively
          through Robinhood's official Trading endpoint.
        </p>
        <p>
          A plain-language description of each requested permission, one line per
          scope with the feature it enables, is{" "}
          <Pending label="Robinhood OAuth scope list — HD-08" />.
        </p>
      </LegalSection>

      <LegalSection heading="How to revoke access">
        <p>
          You can disconnect Fincai at any time. Disconnecting from within Fincai
          immediately deletes the stored authorization and tokens for your
          session.
        </p>
        <p>
          To fully revoke access from the Robinhood side, sign in to your
          Robinhood account and remove Fincai from your connected or authorized
          third-party applications. The exact location of that setting in the
          Robinhood interface is{" "}
          <Pending label="Robinhood revocation steps — verify" />.
        </p>
      </LegalSection>

      <LegalSection heading="Token storage">
        <p>
          When you connect, Fincai stores the OAuth client registration and the
          access and refresh tokens encrypted at rest using AES-256-GCM. The
          encryption key is derived from a server secret and is never stored
          alongside the encrypted data.
        </p>
        <p>
          Tokens are held in a dedicated database table keyed to your session
          cookie, and are deleted when you disconnect or when they can no longer
          be refreshed.
        </p>
      </LegalSection>

      <LegalSection heading="Where your data goes">
        <p data-testid="text-data-to-ai-providers">{DATA_TO_AI_PROVIDERS}</p>
        <p>
          A complete list of the third parties that receive data, and the data
          categories each one receives, is{" "}
          <Pending label="subprocessor list — HD-06" />.
        </p>
      </LegalSection>

      <LegalSection heading="Paper trading by default">
        <p>{PAPER_DEFAULT}</p>
        <p>
          Anonymous sessions are paper-only. Live autonomous trading requires a
          connected Robinhood account and an explicit, per-strategy opt-in, and
          is long-only in the current version. You can pause or stop any running
          strategy at any time.
        </p>
      </LegalSection>

      <LegalSection heading="Reporting a vulnerability">
        <p>
          We welcome good-faith security research. If you believe you have found a
          vulnerability, please report it to{" "}
          <Pending label="security contact email — HD-04" /> so we can
          investigate and respond. Our target initial response window is{" "}
          <Pending label="response window — HD-04" />.
        </p>
        <p>
          We will not pursue legal action against researchers who act in good
          faith, avoid privacy violations and service disruption, and give us a
          reasonable opportunity to remediate before any public disclosure.
        </p>
      </LegalSection>

      <LegalSection heading="What we do not claim">
        <p>
          Fincai does not hold any third-party security certification (such as
          SOC 2 or ISO 27001) at this time. We would rather state that plainly
          than imply a certification we do not have.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
