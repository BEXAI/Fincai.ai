import { LegalPage, LegalSection, Pending } from "@/components/legal-page";
import { DATA_TO_AI_PROVIDERS } from "@shared/disclosures";

export default function PrivacyPage() {
  return (
    <LegalPage
      path="/privacy"
      title="Privacy Policy"
      intro="What data Fincai collects, why, who it is shared with, and the choices you have."
    >
      <LegalSection heading="Who we are">
        <p>
          Fincai is operated by <Pending label="legal entity name — HD-01" />.
          For privacy questions or requests, contact us at{" "}
          <Pending label="privacy contact email — HD-04" />.
        </p>
      </LegalSection>

      <LegalSection heading="Data we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-foreground">Account and identity data</span> —
            the details you provide when you sign in or create an account.
          </li>
          <li>
            <span className="text-foreground">Brokerage data received via API</span>{" "}
            — positions, orders, balances, and related data returned by your
            connected brokerage when you authorize a connection.
          </li>
          <li>
            <span className="text-foreground">Chat and prompt content</span> — the
            messages, symbols, watchlists, and questions you send to Fincai's AI
            features.
          </li>
          <li>
            <span className="text-foreground">Usage telemetry</span> — how you
            interact with the product, to operate and improve it.
          </li>
          <li>
            <span className="text-foreground">Device and log data</span> — standard
            technical data such as IP address, browser type, and timestamps.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Why we use it">
        <p>
          We use each category of data to provide the service you request:
          authenticating you, connecting to and displaying your brokerage account,
          generating AI analysis, operating and securing the product, and meeting
          legal obligations. The specific legal basis that applies to each
          category, where a legal-basis framework governs you, is{" "}
          <Pending label="legal basis per data category — counsel review" />.
        </p>
      </LegalSection>

      <LegalSection heading="Third parties who receive data">
        <p>
          Fincai relies on third-party providers to operate — including AI model
          providers, market-data vendors, hosting, and error monitoring. The full
          list of these providers, and the data categories each one receives, is{" "}
          <Pending label="subprocessor table — HD-06" />.
        </p>
      </LegalSection>

      <LegalSection heading="AI provider disclosure">
        <p data-testid="text-data-to-ai-providers">{DATA_TO_AI_PROVIDERS}</p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          Retention periods for each data class — account data, chat and prompt
          history, order history, OAuth tokens after disconnect, and logs — are{" "}
          <Pending label="retention schedule — HD-07" />. Where no fixed schedule
          applies, data is retained until you delete your account, except where we
          must keep it longer to meet a legal obligation.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Depending on where you live, you may have rights to access, correct,
          delete, or export your personal data. The mechanism and timeline for
          exercising each right is{" "}
          <Pending label="rights request process — counsel review" />. To make a
          request, contact <Pending label="privacy contact email — HD-04" />.
        </p>
      </LegalSection>

      <LegalSection heading="Account deletion">
        <p>
          When you disconnect your brokerage, the stored OAuth tokens for that
          connection are deleted. When you delete your account, we remove your
          account and associated data, except for anything we are required to
          retain by law. The precise list of what is deleted versus retained is{" "}
          <Pending label="deletion/retention detail — HD-07" />.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and analytics">
        <p>
          Fincai uses cookies necessary to keep you signed in and to maintain your
          session. Any additional analytics or measurement providers are covered
          by the subprocessor list referenced above (
          <Pending label="subprocessor table — HD-06" />
          ).
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          Fincai is not directed to, and is not intended for use by, anyone under
          18 years of age. We do not knowingly collect personal data from children.
        </p>
      </LegalSection>

      <LegalSection heading="International transfers">
        <p>
          If your data is transferred or processed outside your country, the
          safeguards that apply to those transfers are{" "}
          <Pending label="international transfer mechanism — counsel review" />.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we will revise
          the version and effective date shown at the top of this page and, where
          appropriate, notify you in the product.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
