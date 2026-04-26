const assert = require("node:assert/strict");

const {
  PgVectorMemoryAdapter,
} = require("../dist/memory/pg-vector.adapter.js");
const {
  MemoryConsolidationService,
} = require("../dist/services/memory-consolidation.service.js");
const { MemoryService } = require("../dist/services/memory.service.js");

// ─── Mocks ───────────────────────────────────────────────────────────────────

/** DataSource mock : stocke les lignes en memoire */
function makeMockDataSource() {
  const rows = [];
  let idCounter = 1;

  return {
    isInitialized: true,
    async initialize() {},
    async query(sql, params = []) {
      const s = sql.trim().toUpperCase();

      if (s.startsWith("CREATE")) return [];

      if (s.startsWith("INSERT")) {
        const row = {
          id: `uuid-${idCounter++}`,
          thread_id: params[0] ?? null,
          user_id: params[1] ?? null,
          content: params[2],
          metadata: typeof params[4] === "string" ? JSON.parse(params[4]) : {},
          created_at: new Date().toISOString(),
        };
        rows.push({ ...row, embedding: params[3] });
        return [row];
      }

      if (s.startsWith("SELECT")) {
        return rows.map((r) => ({
          id: r.id,
          thread_id: r.thread_id,
          user_id: r.user_id,
          content: r.content,
          metadata: r.metadata,
          created_at: r.created_at,
        }));
      }

      return [];
    },
    rows,
  };
}

/** Embeddings mock : retourne toujours un vecteur de dimension 3 */
function makeMockEmbeddings() {
  return {
    async embedQuery(text) {
      return [1, 2, 3];
    },
    async embedDocuments(docs) {
      return docs.map(() => [1, 2, 3]);
    },
  };
}

// ─── Tests PgVectorMemoryAdapter ─────────────────────────────────────────────

test("PgVectorMemoryAdapter.getCheckpointer() returns null", () => {
  const adapter = new PgVectorMemoryAdapter(
    makeMockDataSource(),
    makeMockEmbeddings(),
  );
  assert.equal(adapter.getCheckpointer(), null);
});

test("PgVectorMemoryAdapter.store() persists an entry and returns it", async () => {
  const ds = makeMockDataSource();
  const adapter = new PgVectorMemoryAdapter(ds, makeMockEmbeddings());
  await adapter.initialize();

  const entry = await adapter.store({
    content: "L'utilisateur prefere les reponses courtes.",
    threadId: "t1",
    userId: "user-42",
    metadata: { source: "test" },
  });

  assert.ok(entry.id);
  assert.equal(entry.content, "L'utilisateur prefere les reponses courtes.");
  assert.equal(entry.threadId, "t1");
  assert.equal(entry.userId, "user-42");
  assert.ok(entry.createdAt instanceof Date);
});

test("PgVectorMemoryAdapter.store() auto-generates embedding when absent", async () => {
  const ds = makeMockDataSource();
  let embedCalled = false;
  const embeddings = {
    async embedQuery(text) {
      embedCalled = true;
      return [0.1, 0.2, 0.3];
    },
    async embedDocuments(docs) {
      return docs.map(() => [0.1, 0.2, 0.3]);
    },
  };
  const adapter = new PgVectorMemoryAdapter(ds, embeddings);
  await adapter.initialize();

  await adapter.store({ content: "Fact A" });
  assert.ok(embedCalled, "embedQuery should have been called");
});

test("PgVectorMemoryAdapter.store() uses provided embedding without calling embeddings model", async () => {
  const ds = makeMockDataSource();
  let embedCalled = false;
  const embeddings = {
    async embedQuery() {
      embedCalled = true;
      return [9, 9, 9];
    },
    async embedDocuments(docs) {
      return docs.map(() => [9, 9, 9]);
    },
  };
  const adapter = new PgVectorMemoryAdapter(ds, embeddings);
  await adapter.initialize();

  await adapter.store({ content: "Pre-embedded", embedding: [1, 2, 3] });
  assert.ok(!embedCalled, "embedQuery should NOT have been called");
});

test("PgVectorMemoryAdapter.search() returns stored entries", async () => {
  const ds = makeMockDataSource();
  const adapter = new PgVectorMemoryAdapter(ds, makeMockEmbeddings());
  await adapter.initialize();

  await adapter.store({ content: "Memory 1", threadId: "t1" });
  await adapter.store({ content: "Memory 2", threadId: "t2" });

  const results = await adapter.search("query", { k: 5 });
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => typeof r.content === "string"));
});

test("PgVectorMemoryAdapter.search() accepts a pre-computed vector", async () => {
  const ds = makeMockDataSource();
  let embedCalled = false;
  const embeddings = {
    async embedQuery() {
      embedCalled = true;
      return [1, 2, 3];
    },
    async embedDocuments(docs) {
      return docs.map(() => [1, 2, 3]);
    },
  };
  const adapter = new PgVectorMemoryAdapter(ds, embeddings);
  await adapter.initialize();
  await adapter.store({ content: "A fact" });

  embedCalled = false;
  const results = await adapter.search([0.5, 0.5, 0.5]);
  assert.ok(!embedCalled, "embedQuery should NOT be called for vector input");
  assert.equal(results.length, 1);
});

// ─── Tests MemoryService.resolveSemanticStore() ───────────────────────────────

test("MemoryService.resolveSemanticStore() returns adapter when semantic", () => {
  const ds = makeMockDataSource();
  const adapter = new PgVectorMemoryAdapter(ds, makeMockEmbeddings());

  const svc = new MemoryService({
    memories: [{ id: "pgvec", adapter, type: "semantic", isDefault: true }],
  });
  svc.onModuleInit();

  const resolved = svc.resolveSemanticStore("pgvec");
  assert.ok(typeof resolved.search === "function");
  assert.ok(typeof resolved.store === "function");
});

test("MemoryService.resolveSemanticStore() throws for non-semantic adapter", () => {
  const { CheckpointerMemoryAdapter } = require("../dist/interfaces/memory.interface.js");
  const svc = new MemoryService({
    memories: [
      {
        id: "ram",
        adapter: new CheckpointerMemoryAdapter({ type: "ram" }),
        type: "checkpointer",
        isDefault: true,
      },
    ],
  });
  svc.onModuleInit();

  assert.throws(() => svc.resolveSemanticStore("ram"), /semantique/i);
});

// ─── Tests MemoryConsolidationService ────────────────────────────────────────

test("MemoryConsolidationService.consolidate() stores a summary in semantic adapter", async () => {
  const ds = makeMockDataSource();
  const vectorAdapter = new PgVectorMemoryAdapter(ds, makeMockEmbeddings());
  await vectorAdapter.initialize();

  const memorySvc = new MemoryService({
    memories: [{ id: "pgvec", adapter: vectorAdapter, type: "semantic", isDefault: true }],
  });
  memorySvc.onModuleInit();

  // ModelService mock
  const modelSvc = {
    _getInternalModel() {
      return {
        async invoke(messages) {
          return { content: "Résumé : l'utilisateur veut des réponses brèves." };
        },
      };
    },
  };

  const consolidationSvc = new MemoryConsolidationService(memorySvc, modelSvc);

  const entry = await consolidationSvc.consolidate({
    messages: [
      { role: "human", content: "Sois bref." },
      { role: "ai", content: "D'accord !" },
    ],
    threadId: "t1",
    userId: "user-42",
    semanticMemoryId: "pgvec",
  });

  assert.ok(entry.id);
  assert.ok(entry.content.length > 0);
  assert.equal(entry.threadId, "t1");
  assert.equal(entry.userId, "user-42");
  assert.ok(entry.metadata?.consolidatedAt);
  assert.equal(entry.metadata?.messageCount, 2);
});
