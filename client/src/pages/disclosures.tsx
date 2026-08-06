import { LegalPage, LegalSection } from "@/components/legal-page";
import {
  NOT_ADVICE,
  RISK_GENERAL,
  RISK_AUTONOMOUS,
  AI_LIMITATIONS,
  NO_PERFORMANCE,
  TRADEMARK_ROBINHOOD,
  OCC_ODD_URL,
} from "@shared/disclosures";

export default function DisclosuresPage() {
  return (
    <LegalPage
      path="/disclosures"
      title="Disclosures"
      intro="The full text of every disclosure referenced across Fincai, in one place."
    >
      <LegalSection heading="Not investment advice">
        <p data-testid="text-not-advice">{NOT_ADVICE}</p>
      </LegalSection>

      <LegalSection heading="Trading and options risk">
        <p data-testid="text-risk-general">{RISK_GENERAL}</p>
        <p>
          Read the OCC's{" "}
          <a
            href={OCC_ODD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2"
            data-testid="link-occ-odd"
          >
            Characteristics and Risks of Standardized Options
          </a>{" "}
          before trading options.
        </p>
      </LegalSection>

      <LegalSection heading="Automated strategy risk">
        <p data-testid="text-risk-autonomous">{RISK_AUTONOMOUS}</p>
      </LegalSection>

      <LegalSection heading="AI limitations">
        <p data-testid="text-ai-limitations">{AI_LIMITATIONS}</p>
      </LegalSection>

      <LegalSection heading="No performance representations">
        <p data-testid="text-no-performance">{NO_PERFORMANCE}</p>
      </LegalSection>

      <LegalSection heading="Third-party trademarks">
        <p data-testid="text-trademark-robinhood">{TRADEMARK_ROBINHOOD}</p>
      </LegalSection>

      <LegalSection heading="Conflicts of interest">
        <p>
          Fincai does not currently have any affiliate or referral arrangements,
          payment-for-order-flow relationships, or operator-held positions in the
          securities it surfaces. If any such conflict arises, it will be
          disclosed here.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
