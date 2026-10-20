import assert from "node:assert/strict"
import {
  assertAttributionPayload,
  businessActivationGaps,
  collectForbiddenPiiPaths,
  soleWholesaleFeeCents,
  spendPermissionGaps,
} from "./enforcement.ts"

const zero = soleWholesaleFeeCents(0)
assert.equal(zero, 0, "no fee when spend is zero")
assert.equal(soleWholesaleFeeCents(-100), 0)
assert.equal(soleWholesaleFeeCents(1000), 1500, "$10 spend still owes the $15 monthly minimum")
assert.equal(soleWholesaleFeeCents(100_000), 3000, "$1000 spend owes 3%")

assert.deepEqual(businessActivationGaps([]).sort(), ["advertising-authorization", "crm-data-sharing", "privacy", "terms"].sort())
assert.deepEqual(
  businessActivationGaps([
    { documentSlug: "terms", documentVersion: "2026-10-20.1" },
    { documentSlug: "privacy", documentVersion: "2026-10-20.1" },
    { documentSlug: "advertising-authorization", documentVersion: "2026-10-20.1" },
    { documentSlug: "crm-data-sharing", documentVersion: "2026-10-20.1" },
  ]),
  [],
)
assert.ok(
  businessActivationGaps([{ documentSlug: "terms", documentVersion: "1999-01-01.0" }]).includes("terms"),
  "an old version does not satisfy the current draft",
)

const spendGaps = spendPermissionGaps(
  [
    { documentSlug: "terms", documentVersion: "2026-10-20.1" },
    { documentSlug: "privacy", documentVersion: "2026-10-20.1" },
    { documentSlug: "advertising-authorization", documentVersion: "2026-10-20.1" },
    { documentSlug: "crm-data-sharing", documentVersion: "2026-10-20.1" },
    { documentSlug: "billing-disclosure", documentVersion: "2026-10-20.1" },
  ],
  {
    platforms: ["google_ads"],
    budgetCents: 5000,
    cadence: "monthly",
    automationMode: "manual",
    status: "recorded_not_charged",
  },
)
assert.deepEqual(spendGaps, [], "manual authorization with documents has no spend-permission gap")

assert.ok(
  spendPermissionGaps([], null).includes("spending-authorization"),
)

assert.ok(collectForbiddenPiiPaths({ lead: { email: "a@b.c" } }).includes("lead.email"))
assert.throws(() => assertAttributionPayload({ customer_phone: "555" }), /customer identity/)
assert.doesNotThrow(() =>
  assertAttributionPayload({
    schemaVersion: 1,
    eventId: "evt_1",
    leadRef: "opp_9",
    eventType: "lead.created",
    serviceCategory: "hvac",
  }),
)

console.log("sole enforcement tests passed")
