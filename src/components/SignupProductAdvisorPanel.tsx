import { useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { theme } from "../styles/theme"
import { labelForProductPackageId, type ProductPackageId } from "../lib/productPackages"
import {
  defaultSignupAdvisorAnswers,
  recommendSignupProducts,
  SIGNUP_ADVISOR_MODULE_LABELS,
  serializeSignupAdvisorPayload,
  type SignupAdvisorAnswers,
} from "../lib/signupProductAdvisor"

type Props = {
  onApply: (packageId: ProductPackageId, advisorJson: string) => void
  onClose: () => void
}

const STEPS = [
  "departments",
  "employees",
  "phones",
  "parts",
  "result",
] as const

export default function SignupProductAdvisorPanel({ onApply, onClose }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const [answers, setAnswers] = useState<SignupAdvisorAnswers>(() => defaultSignupAdvisorAnswers())

  const recommendation = useMemo(() => recommendSignupProducts(answers), [answers])
  const step = STEPS[stepIdx]

  function patch(p: Partial<SignupAdvisorAnswers>) {
    setAnswers((prev) => ({ ...prev, ...p }))
  }

  function next() {
    setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))
  }

  function back() {
    setStepIdx((i) => Math.max(0, i - 1))
  }

  return (
    <div
      role="dialog"
      aria-labelledby="signup-advisor-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          padding: "20px 22px 22px",
          boxShadow: "0 24px 48px rgba(15,23,42,0.18)",
        }}
      >
        <h2 id="signup-advisor-title" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>
          I need help deciding product
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b", lineHeight: 1.55 }}>
          Answer a few questions about departments, employees, and phone users — we&apos;ll recommend the best Tradesman
          package and modules for your company.
        </p>

        {step === "departments" ? (
          <StepBlock title="Departments">
            <YesNo
              label="Do you have multiple departments?"
              value={answers.multipleDepartments}
              onChange={(v) => patch({ multipleDepartments: v, departmentCount: v ? Math.max(2, answers.departmentCount) : 1 })}
            />
            <NumField label="How many departments?" value={answers.departmentCount} min={1} onChange={(v) => patch({ departmentCount: v })} />
            <NumField
              label="How many departments will use Tradesman logins?"
              value={answers.departmentsUsingTradesman}
              min={1}
              max={answers.departmentCount}
              onChange={(v) => patch({ departmentsUsingTradesman: v })}
            />
          </StepBlock>
        ) : null}

        {step === "employees" ? (
          <StepBlock title="Employees">
            <NumField label="How many employees do you have?" value={answers.employeeCount} min={1} onChange={(v) => patch({ employeeCount: v })} />
            <NumField
              label="How many employees will use Tradesman logins?"
              value={answers.employeesUsingTradesman}
              min={1}
              max={answers.employeeCount}
              onChange={(v) => patch({ employeesUsingTradesman: v })}
            />
          </StepBlock>
        ) : null}

        {step === "phones" ? (
          <StepBlock title="External calling">
            <NumField
              label="How many users need to call out from Tradesman phone numbers externally?"
              value={answers.externalPhoneUsers}
              min={0}
              onChange={(v) => patch({ externalPhoneUsers: v })}
            />
          </StepBlock>
        ) : null}

        {step === "parts" ? (
          <StepBlock title="Parts department">
            <YesNo
              label="Do you have a parts department that will use Tradesman?"
              value={answers.hasPartsDepartment}
              onChange={(v) => patch({ hasPartsDepartment: v })}
            />
          </StepBlock>
        ) : null}

        {step === "result" ? (
          <StepBlock title="Recommendation">
            <div style={{ padding: 14, borderRadius: 10, background: "#f0fdf4", border: "1px solid #86efac" }}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>
                {recommendation.packageId ? labelForProductPackageId(recommendation.packageId) : "Custom follow-up"}
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.55 }}>{recommendation.summary}</p>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Suggested modules</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55, fontSize: 13 }}>
                {recommendation.modules.map((m) => (
                  <li key={m}>{SIGNUP_ADVISOR_MODULE_LABELS[m]}</li>
                ))}
              </ul>
              {recommendation.bullets.length ? (
                <ul style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.55, fontSize: 13, color: "#475569" }}>
                  {recommendation.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </StepBlock>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
          {stepIdx > 0 ? (
            <button type="button" onClick={back} style={secondaryBtn}>
              Back
            </button>
          ) : (
            <button type="button" onClick={onClose} style={secondaryBtn}>
              Cancel
            </button>
          )}
          {step !== "result" ? (
            <button type="button" onClick={next} style={primaryBtn}>
              Next
            </button>
          ) : recommendation.packageId ? (
            <button
              type="button"
              onClick={() => onApply(recommendation.packageId!, serializeSignupAdvisorPayload(answers, recommendation))}
              style={primaryBtn}
            >
              Use this recommendation
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StepBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{title}</h3>
      {children}
    </div>
  )
}

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
      <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{label}</legend>
      <div style={{ display: "flex", gap: 10 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          <input type="radio" checked={value} onChange={() => onChange(true)} /> Yes
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          <input type="radio" checked={!value} onChange={() => onChange(false)} /> No
        </label>
      </div>
    </fieldset>
  )
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 14, fontWeight: 600 }}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          let v = Number(e.target.value)
          if (!Number.isFinite(v)) v = min ?? 0
          if (max != null) v = Math.min(max, v)
          if (min != null) v = Math.max(min, v)
          onChange(v)
        }}
        style={{ ...theme.formInput, maxWidth: 120 }}
      />
    </label>
  )
}

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
}

const secondaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer",
}
