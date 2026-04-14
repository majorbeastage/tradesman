import type { CSSProperties, ReactNode } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import { PRODUCT_PACKAGES, type ProductPackageId } from "../../lib/productPackages"

type Props = {
  onBack: () => void
  /** Opens signup with the selected package id stored for the form. */
  onSignupWithPackage: (packageId: ProductPackageId) => void
}

const cardStyle: CSSProperties = {
  marginBottom: 28,
  padding: 20,
  borderRadius: 14,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
}

const h2Style: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
  color: theme.charcoal,
  fontWeight: 800,
}

const ulStyle: CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 22,
  lineHeight: 1.55,
  fontSize: 14,
  color: theme.text,
}

const btnPrimary: CSSProperties = {
  marginTop: 14,
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
}

function PackageCard({
  title,
  priceLine,
  children,
  packageId,
  onSignup,
}: {
  title: string
  priceLine: string
  children: ReactNode
  packageId: ProductPackageId
  onSignup: (id: ProductPackageId) => void
}) {
  return (
    <div style={cardStyle}>
      <h2 style={h2Style}>{title}</h2>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.text }}>{priceLine}</p>
      <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: theme.charcoal }}>Includes:</p>
      {children}
      <button type="button" onClick={() => onSignup(packageId)} style={btnPrimary}>
        Sign up — {title}
      </button>
    </div>
  )
}

export default function PricingPage({ onBack, onSignupWithPackage }: Props) {
  return (
    <div style={{ minHeight: "100vh", background: theme.background }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 18px 48px" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            marginBottom: 20,
            padding: "10px 16px",
            background: "transparent",
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            color: theme.text,
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ← Back
        </button>

        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 900, color: theme.charcoal }}>Pricing</h1>
        <p style={{ margin: "0 0 24px", fontSize: 15, lineHeight: 1.6, color: theme.text, maxWidth: 720 }}>
          <strong>Pricing packages</strong> – We will work with you for specific requirements. Please contact us if you require features or
          functionality not included in the packages below.
        </p>

        {PRODUCT_PACKAGES.map((pkg) => {
          if (pkg.id === "base") {
            return (
              <PackageCard key={pkg.id} title={pkg.title} priceLine={pkg.priceLine} packageId={pkg.id} onSignup={onSignupWithPackage}>
                <ul style={ulStyle}>
                  <li>
                    Soft Lead Capturing Service
                    <ul style={{ marginTop: 6 }}>
                      <li>Limited to 5 Paid Qualified Leads per month**</li>
                    </ul>
                  </li>
                  <li>1 User Sign-In</li>
                  <li>
                    Customer Conversations Module
                    <ul style={{ marginTop: 6 }}>
                      <li>Limited to 1000 Voice Minutes and 500 SMS Messages per month***</li>
                    </ul>
                  </li>
                  <li>
                    Estimates Module
                    <ul style={{ marginTop: 6 }}>
                      <li>Custom Quote Attachment for sending to customers</li>
                    </ul>
                  </li>
                  <li>
                    Calendar Module
                    <ul style={{ marginTop: 6 }}>
                      <li>Receipt option for customer delivery and database storage</li>
                    </ul>
                  </li>
                </ul>
              </PackageCard>
            )
          }
          if (pkg.id === "office_manager_entry") {
            return (
              <PackageCard key={pkg.id} title={pkg.title} priceLine={pkg.priceLine} packageId={pkg.id} onSignup={onSignupWithPackage}>
                <ul style={ulStyle}>
                  <li>
                    Soft Lead Capturing Service
                    <ul style={{ marginTop: 6 }}>
                      <li>Limited to 5 Paid Qualified Leads per month**</li>
                    </ul>
                  </li>
                  <li>
                    1 Office Manager Sign-In and 1 User Sign-In
                    <ul style={{ marginTop: 6 }}>
                      <li>Management customization for user view</li>
                    </ul>
                  </li>
                  <li>
                    Customer Conversations Module
                    <ul style={{ marginTop: 6 }}>
                      <li>Limited to 1000 Voice Minutes and 500 SMS Messages per month***</li>
                      <li>Internal Conversations Module</li>
                    </ul>
                  </li>
                  <li>
                    Estimates Module
                    <ul style={{ marginTop: 6 }}>
                      <li>Custom Quote Attachment for sending to customers</li>
                    </ul>
                  </li>
                  <li>
                    Calendar Module
                    <ul style={{ marginTop: 6 }}>
                      <li>Control of all user calendars and map view module*</li>
                      <li>Receipt option for customer delivery and database storage</li>
                    </ul>
                  </li>
                </ul>
              </PackageCard>
            )
          }
          if (pkg.id === "office_manager_pro") {
            return (
              <PackageCard key={pkg.id} title={pkg.title} priceLine={pkg.priceLine} packageId={pkg.id} onSignup={onSignupWithPackage}>
                <ul style={ulStyle}>
                  <li>
                    Mid Tier Lead Capturing
                    <ul style={{ marginTop: 6 }}>
                      <li>Limited to 10 Paid Qualified Leads per month**</li>
                    </ul>
                  </li>
                  <li>
                    1 Office Manager Sign-In and 4 User Sign-Ins
                    <ul style={{ marginTop: 6 }}>
                      <li>Management customization for user views</li>
                    </ul>
                  </li>
                  <li>
                    Customer Conversations Module
                    <ul style={{ marginTop: 6 }}>
                      <li>Limited to 1000 Voice Minutes and 500 SMS Messages per month for Office Manager***</li>
                      <li>Limited to 200 Voice Minutes and 200 SMS Messages per month per user***</li>
                      <li>Internal Conversations Module</li>
                    </ul>
                  </li>
                  <li>
                    Estimates Module
                    <ul style={{ marginTop: 6 }}>
                      <li>Custom Quote Attachment for sending to customers</li>
                    </ul>
                  </li>
                  <li>
                    Calendar Module
                    <ul style={{ marginTop: 6 }}>
                      <li>Control of all user calendars and map view module</li>
                      <li>Receipt option for customer delivery and database storage</li>
                    </ul>
                  </li>
                  <li>Customer Database</li>
                </ul>
              </PackageCard>
            )
          }
          return (
            <PackageCard key={pkg.id} title={pkg.title} priceLine={pkg.priceLine} packageId={pkg.id} onSignup={onSignupWithPackage}>
              <ul style={ulStyle}>
                <li>
                  Max Tier Lead Capturing
                  <ul style={{ marginTop: 6 }}>
                    <li>Limited to 25 Paid Qualified Leads per month**</li>
                  </ul>
                </li>
                <li>
                  2 Office Manager Sign-Ins and 8 User Sign-Ins
                  <ul style={{ marginTop: 6 }}>
                    <li>Management customization for user views</li>
                  </ul>
                </li>
                <li>
                  Customer Conversations Module
                  <ul style={{ marginTop: 6 }}>
                    <li>Limited to 1000 Voice Minutes and 500 SMS Messages per month for Office Manager***</li>
                    <li>Limited to 200 Voice Minutes and 200 SMS Messages per month per user***</li>
                    <li>Internal Conversations Module</li>
                  </ul>
                </li>
                <li>
                  Estimates Module
                  <ul style={{ marginTop: 6 }}>
                    <li>Custom Quote Attachment for sending to customers</li>
                  </ul>
                </li>
                <li>
                  Calendar Module
                  <ul style={{ marginTop: 6 }}>
                    <li>Control of all user calendars and map view module*</li>
                    <li>Receipt option for customer delivery and database storage</li>
                  </ul>
                </li>
                <li>Customer Database</li>
              </ul>
            </PackageCard>
          )
        })}

        <div style={cardStyle}>
          <h2 style={h2Style}>Additional Users &amp; Office Managers</h2>
          <ul style={ulStyle}>
            <li>1 Additional Office Manager Login – $49.99/month</li>
            <li>1 Additional User Login – $39.99/month</li>
          </ul>
        </div>

        <div style={{ ...cardStyle, background: "#fafafa" }}>
          <h2 style={{ ...h2Style, fontSize: 17 }}>* Additional Fees, Usage, and Overage Information</h2>

          <p style={{ margin: "12px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Payment Processing Fees:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            All payments are subject to third-party processing fees. These fees are determined by the payment processor and may vary based on
            payment method, card type, and issuing bank. Tradesman Systems does not control these fees and they may be passed through where
            applicable.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Taxes:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Applicable sales tax may be added based on the customer&apos;s billing location and local or state regulations. Tax rates vary by
            jurisdiction and are not controlled by Tradesman Systems.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Communication Usage &amp; Overage Fees:</p>
          <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Each package includes a monthly allocation of voice minutes and SMS messages. Any usage exceeding the included limits will be billed
            as follows:
          </p>
          <ul style={ulStyle}>
            <li>SMS Messages: $0.03 per message</li>
            <li>Voice Usage: $0.05 per minute</li>
          </ul>

          <p style={{ margin: "14px 0 8px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Estimated Cost Breakdown (for transparency):</p>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                border: `1px solid ${theme.border}`,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: `1px solid ${theme.border}` }}>Type</th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: `1px solid ${theme.border}` }}>Estimated Cost</th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: `1px solid ${theme.border}` }}>Customer Charge</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: 10, borderBottom: `1px solid ${theme.border}` }}>SMS</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${theme.border}` }}>~$0.007</td>
                  <td style={{ padding: 10, borderBottom: `1px solid ${theme.border}` }}>$0.02–$0.03</td>
                </tr>
                <tr>
                  <td style={{ padding: 10 }}>Voice</td>
                  <td style={{ padding: 10 }}>~$0.015</td>
                  <td style={{ padding: 10 }}>$0.04–$0.06</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: theme.text, opacity: 0.9 }}>
            Overage usage is billed monthly and is subject to change based on third-party provider rates.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Lead Allocation &amp; Overage Fees:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Each package includes a set number of qualified leads per month. Additional leads beyond the included allocation may be provided and
            billed based on service type, geographic location, and demand. Typical overage pricing ranges from $25 to $60 per qualified lead.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Carrier &amp; Bank Fees:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Additional charges may apply from mobile carriers or financial institutions, including SMS delivery fees or bank-related charges. These
            fees are determined by third parties and are outside the control of Tradesman Systems.
          </p>

          <p style={{ margin: "14px 0 6px", fontWeight: 700, fontSize: 14, color: theme.charcoal }}>Lead Qualification Disclaimer:</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.text }}>
            Tradesman Systems utilizes AI-assisted filtering to qualify leads based on user-defined preferences. While efforts are made to provide
            high-quality, relevant leads, conversion is not guaranteed and results may vary based on response time, service offerings, market
            conditions, and customer intent.
          </p>
        </div>

        <CopyrightVersionFooter variant="default" style={{ marginTop: 28 }} />
      </div>
    </div>
  )
}
