const assert = require("node:assert/strict");

const { SubAgentService } = require("../dist/agents/sub-agent.service.js");
const { SubAgentDefinition } = require("../dist/agents/sub-agent.definition.js");

function createService() {
  return new SubAgentService({
    _getInternalModel() {
      return { id: "fake-model" };
    },
  });
}

test("SubAgentService compiles legacy object specs", () => {
  const service = createService();

  const compiled = service.compileSubAgent({
    name: "faq",
    description: "Answer FAQ questions",
    systemPrompt: "Use the FAQ base",
  });

  assert.equal(compiled.name, "faq");
  assert.ok(compiled._internal);
});

test("SubAgentService resolves decorated definition classes", () => {
  const service = createService();

  class BillingSubAgent {}
  SubAgentDefinition({
    name: "billing",
    description: "Handles billing tasks",
    graphId: "billing-graph",
  })(BillingSubAgent);

  const compiled = service.compileSubAgent(BillingSubAgent);
  const compiledAgain = service.compileSubAgent(BillingSubAgent);

  assert.equal(compiled.name, "billing");
  assert.equal(compiledAgain, compiled);
});

test("SubAgentService throws on undecorated classes", () => {
  const service = createService();

  class MissingMetadata {}

  assert.throws(() => service.compileSubAgent(MissingMetadata), /\[AiKit\].*@SubAgentDefinition/);
});
