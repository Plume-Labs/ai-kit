const test = require("node:test");
const assert = require("node:assert/strict");

const { hello, createAiKit } = require("../index.js");

test("hello returns a greeting with default name", () => {
  assert.equal(hello(), "Hello world!");
});

test("hello returns a greeting with provided name", () => {
  assert.equal(hello("Romuald"), "Hello Romuald!");
});

test("createAiKit returns a toolkit object", () => {
  const toolkit = createAiKit({ provider: "openai" });

  assert.equal(toolkit.name, "ai-kit");
  assert.deepEqual(toolkit.config, { provider: "openai" });
  assert.equal(toolkit.hello("team"), "Hello team!");
});
