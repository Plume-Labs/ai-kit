const assert = require("node:assert/strict");

const {
  SemanticMemoryDefinition,
  getSemanticMemoryDefinitionMetadata,
  isSemanticMemoryDefinitionClass,
  resolveSemanticMemoryDefinitionInput,
} = require("../dist/memory/semantic-memory.definition.js");

const {
  SemanticMemoryFactory,
} = require("../dist/memory/semantic-memory.factory.js");

const { MemoryService } = require("../dist/services/memory.service.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockDataSource() {
  return {
    isInitialized: true,
    async initialize() {},
    async query() { return []; },
  };
}

function makeMockEmbeddings() {
  return {
    async embedQuery() { return [1, 2, 3]; },
    async embedDocuments(docs) { return docs.map(() => [1, 2, 3]); },
  };
}

// ─── @SemanticMemoryDefinition decorator ─────────────────────────────────────

test("SemanticMemoryDefinition stores metadata on class", () => {
  class ChatMemory {}
  SemanticMemoryDefinition({
    id: "chat-mem",
    defaultScope: { domain: "chat" },
  })(ChatMemory);

  const meta = getSemanticMemoryDefinitionMetadata(ChatMemory);
  assert.ok(meta);
  assert.equal(meta.id, "chat-mem");
  assert.deepEqual(meta.defaultScope, { domain: "chat" });
});

test("SemanticMemoryDefinition stores all config fields", () => {
  class BillingMemory {}
  SemanticMemoryDefinition({
    id: "billing-mem",
    isDefault: true,
    tableName: "billing_memories",
    dimensions: 768,
    defaultScope: { domain: "billing", enterpriseId: "ent-1" },
  })(BillingMemory);

  const meta = getSemanticMemoryDefinitionMetadata(BillingMemory);
  assert.equal(meta.id, "billing-mem");
  assert.equal(meta.isDefault, true);
  assert.equal(meta.tableName, "billing_memories");
  assert.equal(meta.dimensions, 768);
  assert.deepEqual(meta.defaultScope, { domain: "billing", enterpriseId: "ent-1" });
});

test("getSemanticMemoryDefinitionMetadata returns null for undecorated class", () => {
  class Plain {}
  assert.equal(getSemanticMemoryDefinitionMetadata(Plain), null);
});

test("getSemanticMemoryDefinitionMetadata returns null for non-function", () => {
  assert.equal(getSemanticMemoryDefinitionMetadata(null), null);
  assert.equal(getSemanticMemoryDefinitionMetadata("string"), null);
  assert.equal(getSemanticMemoryDefinitionMetadata(42), null);
});

test("isSemanticMemoryDefinitionClass returns true for functions/classes", () => {
  class MyMemory {}
  assert.equal(isSemanticMemoryDefinitionClass(MyMemory), true);
  assert.equal(isSemanticMemoryDefinitionClass(function () {}), true);
});

test("isSemanticMemoryDefinitionClass returns false for non-functions", () => {
  assert.equal(isSemanticMemoryDefinitionClass(null), false);
  assert.equal(isSemanticMemoryDefinitionClass({ id: "x" }), false);
  assert.equal(isSemanticMemoryDefinitionClass("string"), false);
});

test("resolveSemanticMemoryDefinitionInput resolves decorated class", () => {
  class SupportMemory {}
  SemanticMemoryDefinition({ id: "support-mem" })(SupportMemory);

  const config = resolveSemanticMemoryDefinitionInput(SupportMemory);
  assert.equal(config.id, "support-mem");
});

test("resolveSemanticMemoryDefinitionInput resolves raw config object", () => {
  const config = resolveSemanticMemoryDefinitionInput({
    id: "raw-mem",
    defaultScope: { domain: "raw" },
  });
  assert.equal(config.id, "raw-mem");
  assert.deepEqual(config.defaultScope, { domain: "raw" });
});

test("resolveSemanticMemoryDefinitionInput throws for undecorated class", () => {
  class Undecorated {}
  assert.throws(
    () => resolveSemanticMemoryDefinitionInput(Undecorated),
    /\[AiKit\].*@SemanticMemoryDefinition/,
  );
});

test("SemanticMemoryDefinition throws for missing id", () => {
  class BadMemory {}
  assert.throws(
    () => SemanticMemoryDefinition({ id: "" })(BadMemory),
    /\[AiKit\].*"id"/,
  );
});

// ─── SemanticMemoryFactory ────────────────────────────────────────────────────

test("SemanticMemoryFactory.create() builds an initialized PgVectorMemoryAdapter", async () => {
  const { PgVectorMemoryAdapter } = require("../dist/memory/pg-vector.adapter.js");

  const memorySvc = new MemoryService({ memories: [] });
  memorySvc.onModuleInit();

  const factory = new SemanticMemoryFactory(memorySvc);

  class ProjectMemory {}
  SemanticMemoryDefinition({
    id: "proj-mem",
    defaultScope: { domain: "projects" },
  })(ProjectMemory);

  const adapter = await factory.create(ProjectMemory, {
    dataSource: makeMockDataSource(),
    embeddings: makeMockEmbeddings(),
  });

  assert.ok(adapter instanceof PgVectorMemoryAdapter);
  assert.ok(typeof adapter.store === "function");
  assert.ok(typeof adapter.search === "function");
});

test("SemanticMemoryFactory.create() accepts raw config instead of class", async () => {
  const { PgVectorMemoryAdapter } = require("../dist/memory/pg-vector.adapter.js");

  const memorySvc = new MemoryService({ memories: [] });
  memorySvc.onModuleInit();

  const factory = new SemanticMemoryFactory(memorySvc);

  const adapter = await factory.create(
    { id: "raw-mem", defaultScope: { domain: "raw" } },
    { dataSource: makeMockDataSource(), embeddings: makeMockEmbeddings() },
  );

  assert.ok(adapter instanceof PgVectorMemoryAdapter);
});

test("SemanticMemoryFactory.createAndRegister() registers adapter with MemoryService", async () => {
  const memorySvc = new MemoryService({ memories: [] });
  memorySvc.onModuleInit();

  const factory = new SemanticMemoryFactory(memorySvc);

  class OnboardingMemory {}
  SemanticMemoryDefinition({
    id: "onboarding-mem",
    defaultScope: { domain: "onboarding", enterpriseId: "ent-2" },
  })(OnboardingMemory);

  await factory.createAndRegister(OnboardingMemory, {
    dataSource: makeMockDataSource(),
    embeddings: makeMockEmbeddings(),
  });

  const resolved = memorySvc.resolveSemanticStore("onboarding-mem");
  assert.ok(typeof resolved.search === "function");
  assert.ok(typeof resolved.store === "function");
});

test("SemanticMemoryFactory.createAndRegister() respects isDefault flag", async () => {
  const memorySvc = new MemoryService({ memories: [] });
  memorySvc.onModuleInit();

  const factory = new SemanticMemoryFactory(memorySvc);

  class DefaultMemory {}
  SemanticMemoryDefinition({
    id: "default-semantic",
    isDefault: true,
  })(DefaultMemory);

  await factory.createAndRegister(DefaultMemory, {
    dataSource: makeMockDataSource(),
    embeddings: makeMockEmbeddings(),
  });

  const list = memorySvc.listMemories();
  const entry = list.find((m) => m.id === "default-semantic");
  assert.ok(entry?.isDefault, "should be registered as default memory");
});

test("SemanticMemoryFactory.create() calls adapter.initialize()", async () => {
  let initializeCalled = false;
  const ds = {
    isInitialized: true,
    async initialize() {},
    async query(sql) {
      if (sql.trim().toUpperCase().startsWith("CREATE") ||
          sql.trim().toUpperCase().startsWith("ALTER")) {
        initializeCalled = true;
      }
      return [];
    },
  };

  const memorySvc = new MemoryService({ memories: [] });
  memorySvc.onModuleInit();
  const factory = new SemanticMemoryFactory(memorySvc);

  await factory.create(
    { id: "init-test" },
    { dataSource: ds, embeddings: makeMockEmbeddings() },
  );

  assert.ok(initializeCalled, "adapter.initialize() should have issued CREATE/ALTER SQL");
});

// ─── Multiple bounded contexts (CQRS isolation) ───────────────────────────────

test("Multiple SemanticMemoryDefinition classes are independent", () => {
  class DomainA {}
  class DomainB {}

  SemanticMemoryDefinition({
    id: "domain-a",
    defaultScope: { domain: "a" },
  })(DomainA);

  SemanticMemoryDefinition({
    id: "domain-b",
    defaultScope: { domain: "b" },
  })(DomainB);

  const metaA = getSemanticMemoryDefinitionMetadata(DomainA);
  const metaB = getSemanticMemoryDefinitionMetadata(DomainB);

  assert.equal(metaA.id, "domain-a");
  assert.equal(metaA.defaultScope?.domain, "a");
  assert.equal(metaB.id, "domain-b");
  assert.equal(metaB.defaultScope?.domain, "b");
});
