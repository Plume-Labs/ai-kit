const assert = require("node:assert/strict");

const { SecurityToolService } = require("../dist/security/security-tool.service.js");

class FakeMcpService {
  constructor() {
    this.tools = new Map();
  }

  registerTool(id, tool) {
    this.tools.set(id, tool);
  }
}

test("SecurityToolService registers configured presets and forwards them to McpService", () => {
  const fakeMcp = new FakeMcpService();
  const svc = new SecurityToolService(
    {
      securityTools: [
        { id: "guard", preset: "prompt-injection-guard" },
        { id: "pii", preset: "pii-redactor" },
      ],
    },
    fakeMcp,
  );

  svc.onModuleInit();

  assert.deepEqual(
    svc.listTools().map((tool) => tool.id).sort(),
    ["guard", "pii"],
  );
  assert.equal(fakeMcp.tools.has("guard"), true);
  assert.equal(fakeMcp.tools.has("pii"), true);
});

test("SecurityToolService throws explicit AiKit error for unknown id", () => {
  const svc = new SecurityToolService({}, new FakeMcpService());

  assert.throws(() => svc.getTool("missing"), /\[AiKit\] Outil de sécurité introuvable : missing/);
});

test("pii-redactor preset redacts sensitive data", async () => {
  const svc = new SecurityToolService({}, new FakeMcpService());
  const tool = svc.registerTool({ id: "pii", preset: "pii-redactor" });

  const out = await tool.invoke({ text: "Contact: john.doe@example.com / +33 6 12 34 56 78" });
  const parsed = JSON.parse(out);

  assert.match(parsed.redactedText, /\[REDACTED\]/);
  assert.doesNotMatch(parsed.redactedText, /john\.doe@example\.com/);
});
