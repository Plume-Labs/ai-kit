const assert = require("node:assert/strict");

const { MemoryService } = require("../dist/services/memory.service.js");
const {
  CheckpointerMemoryAdapter,
} = require("../dist/interfaces/memory.interface.js");

class CustomMemory {
  constructor(checkpointer) {
    this.checkpointer = checkpointer;
  }

  getCheckpointer() {
    return this.checkpointer;
  }
}

test("MemoryService registers and resolves custom memories", () => {
  const customCp = { type: "custom" };
  const svc = new MemoryService({
    memories: [{ id: "tenant-a", adapter: new CustomMemory(customCp), isDefault: true }],
  });

  svc.onModuleInit();

  assert.deepEqual(svc.listMemories(), [{ id: "tenant-a", isDefault: true }]);
  assert.equal(svc.getCheckpointer("tenant-a"), customCp);
  assert.equal(svc.getCheckpointer(), customCp);
});

test("MemoryService supports legacy checkpointer option", () => {
  const legacyCp = { type: "legacy" };
  const svc = new MemoryService({ checkpointer: legacyCp });

  svc.onModuleInit();

  assert.equal(svc.getCheckpointer(), legacyCp);
  assert.deepEqual(svc.listMemories(), [{ id: "default", isDefault: true }]);
});

test("MemoryService falls back to in-memory adapter", () => {
  const svc = new MemoryService({});

  svc.onModuleInit();

  const cp = svc.getCheckpointer();
  assert.ok(cp);

  svc.registerMemory({
    id: "second",
    adapter: new CheckpointerMemoryAdapter({ type: "second" }),
  });
  svc.setDefaultMemory("second");

  assert.deepEqual(svc.listMemories(), [
    { id: "default", isDefault: false },
    { id: "second", isDefault: true },
  ]);
});
