const assert = require("node:assert/strict");

const {
  AgentDefinition,
  UsesSubAgents,
  resolveAgentDefinitionInput,
} = require("../dist/agents/agent.definition.js");
const { SubAgentDefinition } = require("../dist/agents/sub-agent.definition.js");

test("resolveAgentDefinitionInput keeps legacy object configs", () => {
  const cfg = {
    id: "support",
    systemPrompt: "Be helpful",
  };

  const resolved = resolveAgentDefinitionInput(cfg);
  assert.deepEqual(resolved, cfg);
});

test("AgentDefinition + UsesSubAgents supports class-based relations", () => {
  class BillingSubAgent {}
  SubAgentDefinition({
    name: "billing",
    description: "Handles billing requests",
  })(BillingSubAgent);

  class SupportAgent {}
  AgentDefinition({
    id: "support",
    systemPrompt: "Route user requests",
  })(SupportAgent);
  UsesSubAgents([BillingSubAgent])(SupportAgent);

  const resolved = resolveAgentDefinitionInput(SupportAgent);

  assert.equal(resolved.id, "support");
  assert.equal(resolved.subAgents.length, 1);
  assert.equal(resolved.subAgents[0], BillingSubAgent);
});

test("resolveAgentDefinitionInput throws on undecorated classes", () => {
  class MissingDefinition {}

  assert.throws(
    () => resolveAgentDefinitionInput(MissingDefinition),
    /\[AiKit\].*@AgentDefinition/,
  );
});
