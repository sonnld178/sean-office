import { describe, it, expect } from "vitest";
import {
  detectReviewRules,
  runReviewChecks,
  countIssuesByRule,
  deterministicFixes,
  validatePhoneDetail,
  validateEmailDetail,
  isValidPhone,
} from "@/lib/sheets-processor";

const rows = [
  { "Ho Ten": "Nguyen Van A", Email: "a@test.com", SDT: "0901234567", Passcode: "123456" },
  { "Ho Ten": "Tran B", Email: "not-an-email", SDT: "123", Passcode: "123456" },
  { "Ho Ten": "", Email: "c@test.com", SDT: "+84901234567", Passcode: "999999" },
];

describe("detectReviewRules (header-first, type-wide)", () => {
  it("detects email/phone rules from VI+EN headers", () => {
    const { rules } = detectReviewRules(
      ["Ho Ten", "Email", "SDT", "Passcode"],
      rows
    );
    const byId = Object.fromEntries(rules.map((r) => [r.id, r]));
    expect(byId["email"]).toMatchObject({
      confidence: "high",
      source: "header",
      enabled: true,
    });
    expect((byId["email"] as unknown as { columns: string[] }).columns).toEqual(expect.arrayContaining(["Email"]));
    expect(byId["phone"]).toMatchObject({
      confidence: "high",
      source: "header",
      enabled: true,
    });
    expect((byId["phone"] as unknown as { columns: string[] }).columns).toEqual(expect.arrayContaining(["SDT"]));
  });

  it("never creates phone rules for passcode-like headers", () => {
    const { rules } = detectReviewRules(
      ["Ho Ten", "Email", "SDT", "Passcode"],
      rows
    );
    const phone = rules.find((r) => r.type === "phone");
    const cols = (phone as unknown as { columns: string[] } | undefined)?.columns ?? [];
    expect(cols).not.toContain("Passcode");
    // also no per-column phone rule that points to Passcode
    expect(rules.filter((r) => r.type === "phone" && (r as unknown as { columns: string[] }).columns?.includes("Passcode"))).toHaveLength(0);
  });

  it("flags content-guessed rules as low confidence and disabled", () => {
    const { rules } = detectReviewRules(
      ["note"],
      [
        { note: "a@test.com" },
        { note: "b@test.com" },
        { note: "c@test.com" },
        { note: "d@test.com" },
      ]
    );
    const email = rules.find((r) => r.type === "email");
    expect(email).toMatchObject({ confidence: "low", source: "content", enabled: false });
  });
});

describe("runReviewChecks", () => {
  it("reports invalid email/phone, missing values and duplicates", () => {
    const { rules } = detectReviewRules(
      ["Ho Ten", "Email", "SDT", "Passcode"],
      rows
    );
    // type-wide: empty covers Ho Ten + 3 columns fully-filled => overall high
    const emptyRule = rules.find((r) => r.id === "empty");
    expect(emptyRule).toMatchObject({ confidence: "high", enabled: true });
    expect((emptyRule as unknown as { columns: string[] }).columns).toEqual(expect.arrayContaining(["Ho Ten"]));
    const issues = runReviewChecks(rows, rules);
    const counts = countIssuesByRule(issues);
    expect(counts["email"]).toBe(1);
    expect(counts["phone"]).toBe(1);
    // rowIndex is 0-based into the data array
    expect(issues.find((i) => i.ruleId === "email")?.rowIndex).toBe(1);
    expect(issues.filter((i) => i.column === "Ho Ten" && i.ruleId === "empty")).toHaveLength(1);
  });
});

describe("deterministicFixes", () => {
  it("(a) normalizes email with trim + lowercase", () => {
    const rows = [{ Email: "  A@X.COM " }];
    const rules = [
      {
        id: "email:Email",
        type: "email" as const,
        column: "Email",
        label: "Email: invalid email format",
        confidence: "high" as const,
        source: "header" as const,
        enabled: true,
      },
    ];
    const issues = [
      {
        rowIndex: 0,
        column: "Email",
        ruleId: "email:Email",
        severity: "warning" as const,
        message: "Invalid email",
        value: "  A@X.COM ",
      },
    ];
    const fixes = deterministicFixes(rows, issues, rules);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({
      rowIndex: 0,
      column: "Email",
      action: "set",
      newValue: "a@x.com",
    });
  });

  it("(b) normalizes VN phone +84 prefix to 0", () => {
    const rows = [{ SDT: "+84 901 234 567" }];
    const rules = [
      {
        id: "phone:SDT",
        type: "phone" as const,
        column: "SDT",
        label: "SDT: invalid phone number",
        confidence: "high" as const,
        source: "header" as const,
        enabled: true,
      },
    ];
    const issues = [
      {
        rowIndex: 0,
        column: "SDT",
        ruleId: "phone:SDT",
        severity: "warning" as const,
        message: "Invalid phone",
        value: "+84 901 234 567",
      },
    ];
    const fixes = deterministicFixes(rows, issues, rules);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({
      rowIndex: 0,
      column: "SDT",
      action: "set",
      newValue: "0901234567",
    });
  });

  it("(c) skips unfixable email", () => {
    const rows = [{ Email: "not-an-email" }];
    const rules = [
      {
        id: "email:Email",
        type: "email" as const,
        column: "Email",
        label: "Email: invalid email format",
        confidence: "high" as const,
        source: "header" as const,
        enabled: true,
      },
    ];
    const issues = [
      {
        rowIndex: 0,
        column: "Email",
        ruleId: "email:Email",
        severity: "warning" as const,
        message: "Invalid email",
        value: "not-an-email",
      },
    ];
    expect(deterministicFixes(rows, issues, rules)).toHaveLength(0);
  });

  it("(d) ignores issues whose rule is disabled", () => {
    const rows = [{ Passcode: "123456" }];
    const rules = [
      {
        id: "phone:Passcode",
        type: "phone" as const,
        column: "Passcode",
        label: "Passcode: invalid phone number",
        confidence: "low" as const,
        source: "content" as const,
        enabled: false,
      },
    ];
    const issues = [
      {
        rowIndex: 0,
        column: "Passcode",
        ruleId: "phone:Passcode",
        severity: "warning" as const,
        message: "Invalid phone",
        value: "123456",
      },
    ];
    expect(deterministicFixes(rows, issues, rules)).toHaveLength(0);
  });

  it("(e) caps output at 200 fixes", () => {
    const rules = [
      {
        id: "email:Email",
        type: "email" as const,
        column: "Email",
        label: "Email: invalid email format",
        confidence: "high" as const,
        source: "header" as const,
        enabled: true,
      },
    ];
    const rows = Array.from({ length: 250 }, (_, i) => ({
      Email: `  USER${i}@X.COM `,
    }));
    const issues = rows.map((r, i) => ({
      rowIndex: i,
      column: "Email",
      ruleId: "email:Email",
      severity: "warning" as const,
      message: "Invalid email",
      value: r.Email,
    }));
    const fixes = deterministicFixes(rows, issues, rules);
    expect(fixes).toHaveLength(200);
  });
});

describe("validatePhoneDetail / validateEmailDetail (relaxed spec)", () => {
  it("phone (+1) 555-123-4567 with header Phone Number should be valid (no issue)", () => {
    const rows = [{ "Phone Number": "(+1) 555-123-4567" }];
    const { rules } = detectReviewRules(["Phone Number"], rows);
    const enabled = rules.filter((r) => r.enabled);
    const issues = runReviewChecks(rows, enabled);
    expect(issues.filter((i) => i.column === "Phone Number")).toHaveLength(0);
    expect(isValidPhone("(+1) 555-123-4567")).toBe(true);
    expect(validatePhoneDetail("(+1) 555-123-4567")).toMatchObject({ valid: true, reason: "valid" });
  });

  it("phone 123/456 should be forbidden char slash", () => {
    const detail = validatePhoneDetail("123/456");
    expect(detail.valid).toBe(false);
    expect(detail.reason).toBe('contains forbidden character "/"');
    const rows = [{ "Phone Number": "123/456" }];
    const { rules } = detectReviewRules(["Phone Number"], rows);
    const enabled = rules.filter((r) => r.enabled);
    const issues = runReviewChecks(rows, enabled);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('contains forbidden character "/"');
    expect(issues[0].message).toContain("Phone");
  });

  it("phone SDT=123 should be too short and still flagged as 1 issue", () => {
    const detail = validatePhoneDetail("123");
    expect(detail.valid).toBe(false);
    expect(detail.reason).toBe("too short (3 digits)");
    const rows = [{ SDT: "123" }];
    const { rules } = detectReviewRules(["SDT"], rows);
    const enabled = rules.filter((r) => r.enabled);
    const issues = runReviewChecks(rows, enabled);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("too short");
  });

  it("phone contains letters should be flagged", () => {
    const detail = validatePhoneDetail("090-abc-1234");
    expect(detail.valid).toBe(false);
    expect(detail.reason).toBe("contains letters");
  });

  it("email a@b should be missing dot in domain", () => {
    const detail = validateEmailDetail("a@b");
    expect(detail.valid).toBe(false);
    expect(detail.reason).toBe("missing dot in domain");
    const rows = [{ Email: "a@b" }];
    const { rules } = detectReviewRules(["Email"], rows);
    const enabled = rules.filter((r) => r.enabled);
    const issues = runReviewChecks(rows, enabled);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("missing dot in domain");
  });
});
