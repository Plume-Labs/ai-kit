const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "src", "module", "ai-kit.module.ts");

test("forFeature token providers initialize feature state before resolving registries", () => {
  const content = fs.readFileSync(modulePath, "utf8");
  const forFeatureStart = content.indexOf("static forFeature(options: AiKitFeatureOptions)");
  assert.notEqual(forFeatureStart, -1, "forFeature() must exist");
  const forFeatureContent = content.slice(forFeatureStart);

  assert.doesNotMatch(forFeatureContent, /agentService\.registerAgent\(config\)/);
  assert.doesNotMatch(forFeatureContent, /graphService\.buildGraph\(def\)/);
  assert.doesNotMatch(forFeatureContent, /mcpService\.registerTool\(config\.id, config\.tool\)/);
  assert.doesNotMatch(forFeatureContent, /securityToolService\.registerTool\(config\)/);
  assert.doesNotMatch(forFeatureContent, /memoryService\.registerMemory\(config\)/);

  assert.match(forFeatureContent, /await initializer\.initialize\(\);/);
  assert.match(forFeatureContent, /return agentService\.resolve\(config\.id\);/);
  assert.match(forFeatureContent, /return graphService\.resolve\(def\.id\);/);
  assert.match(forFeatureContent, /return mcpService\.getTool\(config\.id\);/);
  assert.match(forFeatureContent, /return securityToolService\.getTool\(config\.id\);/);
  assert.match(forFeatureContent, /return memoryService\.resolve\(config\.id\);/);
});
