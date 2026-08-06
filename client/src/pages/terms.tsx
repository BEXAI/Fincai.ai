import { LegalPage, LegalSection, Pending } from "@/components/legal-page";
import {
  NOT_ADVICE,
  USER_RESPONSIBILITY,
  AI_LIMITATIONS,
  RISK_GENERAL,
  RISK_AUTONOMOUS,
  TRADEMARK_ROBINHOOD,
} from "@shared/disclosures";

export default function TermsPage() {
  return (
    <LegalPage
      path="/terms"
      title="Terms of Service"
      intro="The agreement between you and Fincai governing your use of the product."
    >
      <ol className="list-decimal space-y-6 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>
          <span className="text-foreground">Contracting entity and acceptance.</span>{" "}
          These Terms are an agreement between you and{" "}
          <Pending label="legal entity name — HD-01" />. By using Fincai, you
          agree to these Terms. If you do not agree, do not use the product.
        </li>

        <li>
          <span className="text-foreground">Eligibility.</span> You must be at
          least 18 years old, own the brokerage account you connect, and have the
          authority to connect it.
        </li>

        <li>
          <span className="text-foreground">Description of service.</span> Fincai
          is a software tool for market analysis and order entry. It provides
          AI-generated analysis and a conversational assistant, and it can place
          and manage trades through your connected brokerage. Fincai also includes
          an autonomous strategy runner: once you arm a strategy in live mode, it
          can place and close orders automatically within the limits you set,
          without a separate confirmation for each order. Autonomous strategies
          run in paper (simulated) mode by default and are long-only in the
          current version.
        </li>

        <li>
          <span className="text-foreground">Not investment advice.</span>{" "}
          {NOT_ADVICE}
        </li>

        <li>
          <span className="text-foreground">No fiduciary relationship.</span> Using
          Fincai does not create a fiduciary, advisory, or brokerage relationship
          between you and Fincai.
        </li>

        <li>
          <span className="text-foreground">Your responsibilities.</span>{" "}
          {USER_RESPONSIBILITY} You are responsible for the accuracy of the account
          you connect and for complying with your brokerage's own terms.
        </li>

        <li>
          <span className="text-foreground">Third-party services.</span> Fincai
          depends on third-party brokerage and market-data providers. {TRADEMARK_ROBINHOOD}{" "}
          Fincai is not responsible for outages, errors, or actions of these
          third parties.
        </li>

        <li>
          <span className="text-foreground">AI output limitations.</span>{" "}
          {AI_LIMITATIONS}
        </li>

        <li>
          <span className="text-foreground">Risk acknowledgment.</span> {RISK_GENERAL}{" "}
          {RISK_AUTONOMOUS}
        </li>

        <li>
          <span className="text-foreground">Fees and billing.</span> Any fees for
          paid features, and the billing terms that apply to them, are{" "}
          <Pending label="fees and billing terms — if applicable" />.
        </li>

        <li>
          <span className="text-foreground">Acceptable use.</span> You agree not to
          use Fincai for market manipulation, to scrape or reverse-engineer the
          service, to resell its outputs, or to circumvent rate limits or access
          controls.
        </li>

        <li>
          <span className="text-foreground">Intellectual property.</span> Fincai and
          its content are owned by Fincai and its licensors. These Terms grant you
          a limited, revocable, non-transferable license to use the product.
        </li>

        <li>
          <span className="text-foreground">Disclaimer of warranties.</span> The
          service is provided "as is" without warranties of any kind. The full
          disclaimer language is{" "}
          <Pending label="attorney-drafted warranty disclaimer — HD-10" />.
        </li>

        <li>
          <span className="text-foreground">Limitation of liability.</span> To the
          extent permitted by law, Fincai's liability is limited. The binding
          limitation-of-liability language is{" "}
          <Pending label="attorney-drafted liability cap — HD-10" />.
        </li>

        <li>
          <span className="text-foreground">Indemnification.</span> The
          indemnification terms are{" "}
          <Pending label="attorney-drafted indemnification clause — HD-10" />.
        </li>

        <li>
          <span className="text-foreground">Termination and suspension.</span> You
          may stop using Fincai at any time. We may suspend or terminate access if
          you violate these Terms or to protect the service and its users.
        </li>

        <li>
          <span className="text-foreground">Dispute resolution and governing law.</span>{" "}
          These Terms are governed by the laws of{" "}
          <Pending label="governing law / venue — HD-03" />. Any arbitration and
          class-action-waiver provisions are{" "}
          <Pending label="attorney-drafted dispute-resolution clause — HD-10" />.
        </li>

        <li>
          <span className="text-foreground">Modifications and notice.</span> We may
          update these Terms. When we do, we will revise the version and effective
          date at the top of this page and, where appropriate, notify you in the
          product. Legal notices to Fincai may be sent to{" "}
          <Pending label="legal notice address — HD-02" />.
        </li>
      </ol>
    </LegalPage>
  );
}
