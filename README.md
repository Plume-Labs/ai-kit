# ai-kit

**NestJS kit to manage AI workflow**

> ⚠️ **Project under active development**: the API, configuration options, and some behaviors may evolve quickly between versions.

`ai-kit` is a NestJS module that simplifies AI workflow integration. It abstracts [deepagents](https://www.npmjs.com/package/deepagents), [LangChain](https://js.langchain.com/), and [LangGraph](https://langchain-ai.github.io/langgraphjs/) behind stable interfaces, injectable services, and autonomous domain objects.

---

## Table of Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Module configuration](#module-configuration)
- [Runtime configuration](#runtime-configuration)
- [forFeature() - Feature Module Configuration](#forfeature---feature-module-configuration)
- [Definition system (decorated classes)](#definition-system-decorated-classes)
- [Direct injection of agents, graphs, tools, and memories](#direct-injection-of-agents-graphs-tools-and-memories)
- [Domain objects](#domain-objects)
  - [Agent](#agent)
  - [AgentGraph](#agentgraph)
- [Factories](#factories)
  - [AgentFactory](#agentfactory)
  - [AgentGraphFactory](#agentgraphfactory)
- [Semantic memory](#semantic-memory)
  - [PgVectorMemoryAdapter](#pgvectormemoryadapter)
  - [PgFullMemoryAdapter](#pgfullmemoryadapter)
  - [MemoryScope — multi-tenant isolation](#memoryscope--multi-tenant-isolation)
  - [SemanticMemoryDefinition — class decorator](#semanticmemorydefinition--class-decorator)
  - [SemanticMemoryFactory](#semanticmemoryfactory)
  - [MemoryConsolidationService](#memoryconsolidationservice)
- [Multi-domain / CQRS architecture](#multi-domain--cqrs-architecture)
- [Services](#services)
- [Interfaces](#interfaces)
- [LLM security tools](#llm-security-tools)
- [Injection tokens](#injection-tokens)
- [Advanced examples](#advanced-examples)
- [Environment variables](#environment-variables)

---

## Installation

```bash
npm install ai-kit
```

Required peer dependencies:

```bash
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

---

## Quick start

### Static configuration

```typescript
import { Module } from '@nestjs/common';
import { AiKitModule } from 'ai-kit';

@Module({
  imports: [
    AiKitModule.forRoot({
      models: [
        {
          id: 'default',
          provider: 'openai',
          modelName: 'gpt-4o',
          apiKey: process.env.OPENAI_API_KEY,
        },
      ],
    }),
  ],
})
export class AppModule {}
```

### Async configuration (with ConfigService)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiKitModule } from 'ai-kit';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AiKitModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        models: [
          {
            id: 'default',
            provider: 'openai',
            modelName: config.get('OPENAI_MODEL', 'gpt-4o'),
            apiKey: config.get('OPENAI_API_KEY'),
          },
        ],
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

> The module is **global**: once imported in `AppModule`, services are available across the whole app.

---

## Module configuration

`AiKitModuleOptions`:

| Property | Type | Description |
|----------|------|-------------|
| `models` | `IModelConfig[]` | Language model providers. The first entry becomes default. |
| `mcpServers` | `IMcpServerConfig[]` | MCP servers connected at startup. |
| `tools` | `IToolConfig[]` | Custom tools to register. |
| `securityTools` | `ISecurityToolConfig[]` | Built-in security presets to register. |
| `memories` | `IMemoryConfig[]` | Custom memories to register. |
| `defaultMemoryId` | `string` | Default memory ID. |
| `acp` | `IAcpServerConfig` | ACP server configuration (optional). |
| `agents` | `AgentDefinitionInput[]` | Pre-registered agents (object configs or decorated classes). |
| `graphs` | `IAgentGraph[]` | Pre-registered agent graphs. |
| `checkpointer` | `unknown` | **Deprecated** legacy option. Prefer `memories` + `defaultMemoryId`. |
| `langSmithTracing` | `boolean` | Enables LangSmith tracing. |

### Complete example

```typescript
AiKitModule.forRoot({
  models: [
    { id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o' },
    { id: 'llama', provider: 'ollama', modelName: 'llama3', baseUrl: 'http://localhost:11434' },
  ],
  mcpServers: [
    {
      id: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', '/tmp'],
    },
    {
      id: 'remote-mcp',
      transport: 'sse',
      url: 'http://localhost:8080/sse',
    },
  ],
  agents: [
    {
      id: 'assistant',
      modelId: 'gpt4o',
      systemPrompt: 'You are a helpful assistant.',
      mcpServerIds: ['filesystem'],
    },
  ],
  langSmithTracing: true,
})
```

---

## Runtime configuration

You can update configuration after bootstrap with `AiKitConfiguratorService`.

Typical use cases: multi-tenant agents, on-the-fly MCP connection, recompiling graphs without restart.

```typescript
import { Injectable } from '@nestjs/common';
import { AiKitConfiguratorService } from 'ai-kit';

@Injectable()
export class RuntimeSetupService {
  constructor(private readonly configurator: AiKitConfiguratorService) {}

  async setupTenant(tenantId: string) {
    await this.configurator.configure({
      mcpServers: [
        {
          id: `fs-${tenantId}`,
          transport: 'stdio',
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem', `/tmp/${tenantId}`],
        },
      ],
      agents: [
        {
          id: `assistant-${tenantId}`,
          modelId: 'gpt4o',
          systemPrompt: `Assistant for tenant ${tenantId}`,
          mcpServerIds: [`fs-${tenantId}`],
        },
      ],
    });
  }
}
```

`AiKitRuntimeConfigureOptions`:

| Property | Type | Description |
|----------|------|-------------|
| `models` | `IModelConfig[]` | Models to add/update. |
| `mcpServers` | `IMcpServerConfig[]` | MCP servers to add (merged by id). |
| `memories` | `IMemoryConfig[]` | Memories to add/update. |
| `defaultMemoryId` | `string` | Sets the default memory. |
| `agents` | `AgentDefinitionInput[]` | Agents to register (objects or decorated classes). |
| `graphs` | `IAgentGraph[]` | Graphs to compile. |
| `acp` | `IAcpServerConfig \| null` | Reconfigures ACP. `null` stops the server. |
| `replaceMcpServers` | `boolean` | Replaces all existing MCP servers before reload. |
| `overwriteAgents` | `boolean` | Allows overwriting an already registered agent. |
| `restartAcp` | `boolean` | Forces ACP server restart. |
| `securityTools` | `ISecurityToolConfig[]` | Security tools to add on the fly. |

---

## forFeature() - Feature Module Configuration

`AiKitModule.forFeature()` lets each feature module register agents, tools, models, memories, and graphs additively.

> **Prerequisite:** `AiKitModule.forRoot(...)` is already imported by the root module.

```typescript
// reporting.module.ts
@Module({
  imports: [
    AiKitModule.forFeature({
      models: [
        { id: 'analyst-model', provider: 'openai', modelName: 'gpt-4o-mini', temperature: 0 },
      ],
      mcpServers: [
        {
          id: 'reports-fs',
          transport: 'stdio',
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem', '/reports'],
        },
      ],
      agents: [
        {
          id: 'data-agent',
          modelId: 'analyst-model',
          systemPrompt: 'You analyze data.',
          mcpServerIds: ['reports-fs'],
        },
        {
          id: 'summary-agent',
          modelId: 'analyst-model',
          systemPrompt: 'You summarize analyses in bullet points.',
        },
      ],
      graphs: [
        {
          id: 'report-pipeline',
          entryNodeId: 'analyze',
          nodes: [
            { id: 'analyze',   agentId: 'data-agent' },
            { id: 'summarize', agentId: 'summary-agent' },
          ],
          edges: [{ from: 'analyze', to: 'summarize' }],
        },
      ],
    }),
  ],
  providers: [ReportingService],
})
export class ReportingModule {}
```

`AiKitFeatureOptions`:

| Property | Type | Description |
|----------|------|-------------|
| `agents` | `AgentDefinitionInput[]` | Object configs or decorated classes. |
| `mcpServers` | `IMcpServerConfig[]` | MCP servers to connect and merge by id. |
| `tools` | `IToolConfig[]` | Custom `StructuredTool` instances registered in `McpService`. |
| `securityTools` | `ISecurityToolConfig[]` | Security preset tools registered in `SecurityToolService`. |
| `memories` | `IMemoryConfig[]` | Memory adapters registered in `MemoryService`. |
| `models` | `IModelConfig[]` | Model providers registered in `ModelService`. |
| `graphs` | `IAgentGraph[]` | Agent graph definitions compiled by `AgentGraphService`. |

---

## Definition system (decorated classes)

Besides plain object configs, `ai-kit` supports class-based definitions:

- `@SubAgentDefinition(...)`
- `@AgentDefinition(...)`
- `@UsesSubAgents(...)`
- `@SemanticMemoryDefinition(...)` — see [Semantic memory](#semantic-memory)
- `resolveAgentDefinitionInput(...)`
- `resolveSemanticMemoryDefinitionInput(...)`

```typescript
import {
  AgentDefinition,
  UsesSubAgents,
  SubAgentDefinition,
  SemanticMemoryDefinition,
  AiKitModule,
} from 'ai-kit';

@SubAgentDefinition({
  name: 'billing',
  description: 'Handles billing requests',
  modelId: 'gpt4o',
})
class BillingSubAgent {}

@AgentDefinition({
  id: 'support-agent',
  modelId: 'gpt4o',
  systemPrompt: 'You are a support agent.',
})
@UsesSubAgents([BillingSubAgent])
class SupportAgent {}

// Semantic memory: one class per domain, locked scope
@SemanticMemoryDefinition({
  id: 'billing-memory',
  defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
})
class BillingMemory {}

AiKitModule.forFeature({
  agents: [SupportAgent],
});
```

You can also mix decorated classes and plain object configs in the same list.

```typescript
AiKitModule.forRoot({
  models: [{ id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o' }],
  agents: [
    SupportAgent,
    { id: 'fallback-agent', modelId: 'gpt4o', systemPrompt: 'Fallback assistant' },
  ],
});
```

---

## Direct injection of agents, graphs, tools, and memories

Resources declared through `forFeature()` (and memories from `forRoot()`) are injectable via decorators.

```typescript
// reporting.service.ts
import { Injectable } from '@nestjs/common';
import { InjectAgent, InjectAgentGraph, InjectTool, InjectMemory, Agent, AgentGraph } from 'ai-kit';
import { StructuredTool } from '@langchain/core/tools';
import { IMemoryAdapter } from 'ai-kit';

@Injectable()
export class ReportingService {
  constructor(
    @InjectAgent('data-agent')            private readonly dataAgent: Agent,
    @InjectAgent('summary-agent')         private readonly summaryAgent: Agent,
    @InjectAgentGraph('report-pipeline')  private readonly pipeline: AgentGraph,
    @InjectTool('search')                 private readonly searchTool: StructuredTool,
    @InjectMemory('default')              private readonly memory: IMemoryAdapter,
  ) {}

  analyzeRaw(input: string) {
    return this.dataAgent.run({ input });
  }

  async *analyzeStream(input: string) {
    for await (const event of this.dataAgent.stream({ input })) {
      if (event.type === 'text') yield event.data;
      if (event.type === 'done') break;
    }
  }

  runPipeline(input: string, threadId?: string) {
    return this.pipeline.run(input, threadId);
  }

  useSearchTool(query: string) {
    return this.searchTool.invoke({ query });
  }
}
```

| Decorator | Returns | Description |
|-----------|---------|-------------|
| `@InjectAgent(id)` | `Agent` | Injects the `Agent` instance by id. |
| `@InjectAgentGraph(id)` | `AgentGraph` | Injects the `AgentGraph` instance by id. |
| `@InjectTool(id)` | `StructuredTool` | Injects the `StructuredTool` instance by id. |
| `@InjectSecurityTool(id)` | `StructuredTool` | Injects the security tool instance by id. |
| `@InjectMemory(id)` | `IMemoryAdapter` | Injects the memory adapter instance by id. |

For advanced dynamic providers, resolve after feature initialization:

```typescript
import {
  getAgentToken,
  getToolToken,
  getMemoryToken,
  AiKitFeatureInitializer,
  AgentService,
  McpService,
  MemoryService,
} from 'ai-kit';

{
  provide: getAgentToken('my-agent'),
  useFactory: async (
    initializer: AiKitFeatureInitializer,
    agentService: AgentService,
  ) => {
    await initializer.initialize();
    return agentService.resolve('my-agent');
  },
  inject: [AiKitFeatureInitializer, AgentService],
}

{
  provide: getToolToken('my-tool'),
  useFactory: async (
    initializer: AiKitFeatureInitializer,
    mcpService: McpService,
  ) => {
    await initializer.initialize();
    return mcpService.getTool('my-tool');
  },
  inject: [AiKitFeatureInitializer, McpService],
}

{
  provide: getMemoryToken('redis-memory'),
  useFactory: async (
    initializer: AiKitFeatureInitializer,
    memoryService: MemoryService,
  ) => {
    await initializer.initialize();
    return memoryService.resolve('redis-memory');
  },
  inject: [AiKitFeatureInitializer, MemoryService],
}
```

---

## Domain objects

`ai-kit` exposes autonomous domain objects: `Agent` and `AgentGraph`. They encapsulate all execution logic and can be used directly, independent of NestJS services.

### Agent

Represents a runnable agent. Obtained via `AgentService.registerAgent()`, `@InjectAgent()`, or `AgentFactory.create()`.

```typescript
const agent: Agent = await agentService.registerAgent({
  id: 'my-agent',
  modelId: 'gpt4o',
  systemPrompt: 'You are an assistant.',
});

// Synchronous execution
const result = await agent.run({ input: 'Hello!', threadId: 'thread-1' });
console.log(result.output);

// Streaming
for await (const event of agent.stream({ input: 'Tell me a story.' })) {
  if (event.type === 'text') process.stdout.write(String(event.data));
  if (event.type === 'done') break;
}

// Resuming after HITL
const resumed = await agent.resumeAfterInterrupt('thread-1', { confirmed: true });
```

| Method | Returns | Description |
|--------|---------|-------------|
| `run(opts)` | `Promise<IAgentResult>` | Synchronous execution. |
| `stream(opts)` | `AsyncIterable<IAgentStreamEvent>` | Streaming execution. |
| `resumeAfterInterrupt(threadId, updatedInput?)` | `Promise<IAgentResult>` | Resumes after a HITL interrupt. |

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Agent identifier. |
| `config` | `IAgentConfig` | Source configuration of the agent. |

---

### AgentGraph

Represents a compiled agent graph. Obtained via `AgentGraphService.buildGraph()`, `@InjectAgentGraph()`, or `AgentGraphFactory.create()`.

```typescript
const graph: AgentGraph = await graphService.buildGraph({
  id: 'analysis-pipeline',
  entryNodeId: 'analyze',
  nodes: [
    { id: 'analyze', agentId: 'analyzer' },
    { id: 'report',  agentId: 'reporter' },
  ],
  edges: [{ from: 'analyze', to: 'report' }],
});

const result = await graph.run('Analyze this input', 'thread-001');

for await (const chunk of graph.stream('Analyze this input')) {
  console.log(chunk);
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `run(input, threadId?)` | `Promise<IGraphRunResult>` | Synchronous execution up to the exit node. |
| `stream(input, threadId?)` | `AsyncIterable<unknown>` | Streaming — emits one chunk per completed node. |

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Graph identifier. |
| `definition` | `IAgentGraph` | Source definition of the graph. |

---

## Factories

Factories build domain objects from their configurations. They are used internally by the services but can also be instantiated directly (unit tests, non-NestJS usage).

### AgentFactory

```typescript
import { AgentFactory } from 'ai-kit';

const factory = new AgentFactory(modelService, mcpService, subAgentService, hitlService, memoryService);

const agent = await factory.create({
  id: 'my-agent',
  modelId: 'gpt4o',
  systemPrompt: 'You are an assistant.',
});
```

| Method | Returns | Description |
|--------|---------|-------------|
| `create(config)` | `Promise<Agent>` | Resolves model, MCP tools, sub-agents, HITL, and builds an `Agent` object. |

---

### AgentGraphFactory

```typescript
import { AgentGraphFactory } from 'ai-kit';

const factory = new AgentGraphFactory(agentService, memoryService);

const graph = await factory.create({
  id: 'pipeline',
  entryNodeId: 'step1',
  nodes: [{ id: 'step1', agentId: 'my-agent' }],
  edges: [],
});
```

| Method | Returns | Description |
|--------|---------|-------------|
| `create(def)` | `Promise<AgentGraph>` | Compiles the LangGraph `StateGraph` and returns an `AgentGraph` object. |

---

## Semantic memory

`ai-kit` provides a two-tier memory system:

| Tier | Interface | Role |
|------|-----------|------|
| Short-term (checkpointer) | `IMemoryAdapter` | LangGraph conversation state — persisted per `threadId` |
| Long-term (semantic) | `ISemanticMemoryAdapter` | pgvector cosine similarity — retrieved before each run |

---

### PgVectorMemoryAdapter

Stores and searches conversation memories using [pgvector](https://github.com/pgvector/pgvector). Requires PostgreSQL with `pgvector` extension and a LangChain `EmbeddingsInterface`.

The adapter uses a **duck-typed `IDataSource`** so TypeORM is a consumer-side dependency (not required by `ai-kit` itself).

```typescript
import { PgVectorMemoryAdapter } from 'ai-kit';
import { OpenAIEmbeddings } from '@langchain/openai';

const embeddings = new OpenAIEmbeddings();
const adapter = new PgVectorMemoryAdapter(dataSource, embeddings, {
  tableName: 'ai_memories',     // default: 'ai_kit_memories'
  dimensions: 1536,             // default: 1536 (text-embedding-3-small)
  defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
});

await adapter.initialize();   // creates extension + table + indexes (idempotent)

// Store a consolidated memory (embedding is auto-generated from content)
await adapter.store({
  threadId: 'thread-1',
  userId: 'user-42',
  content: 'User prefers monthly invoices.',
  scope: { domain: 'billing' },
});

// Similarity search
const results = await adapter.search('invoice preferences', {
  k: 5,
  scope: { projectId: 'proj-7' },
});
```

| Constructor option | Type | Default | Description |
|---|---|---|---|
| `tableName` | `string` | `'ai_kit_memories'` | PostgreSQL table name. |
| `dimensions` | `number` | `1536` | Embedding vector size. |
| `defaultScope` | `MemoryScope` | `{}` | Locked scope merged over every call's scope. |

**Database indexes created by `initialize()`:**
- `CREATE EXTENSION IF NOT EXISTS vector`
- `CREATE EXTENSION IF NOT EXISTS pgcrypto` (for `gen_random_uuid()`)
- B-tree index on `thread_id`
- GIN index on `scope` (efficient `@>` JSONB containment filtering)

---

### PgFullMemoryAdapter

Composite adapter combining `PostgresCheckpointerAdapter` (LangGraph short-term memory) and `PgVectorMemoryAdapter` (long-term semantic memory) in one object.

```typescript
import { PgFullMemoryAdapter } from 'ai-kit';
import { OpenAIEmbeddings } from '@langchain/openai';

const adapter = await PgFullMemoryAdapter.create(dataSource, new OpenAIEmbeddings(), {
  connectionString: process.env.DATABASE_URL,
  tableName: 'ai_memories',
  defaultScope: { domain: 'billing' },
});
```

> Requires `@langchain/langgraph-checkpoint-postgres` as a peer dependency (loaded dynamically).

---

### MemoryScope — multi-tenant isolation

`MemoryScope` is a flexible JSONB key-value map that partitions memories by any dimension.

```typescript
interface MemoryScope {
  domain?: string;         // CQRS bounded context (e.g. 'billing', 'support')
  enterpriseId?: string;   // tenant isolation
  projectId?: string;      // project-level isolation
  [key: string]: string | undefined;  // any arbitrary dimension
}
```

The `defaultScope` on a `PgVectorMemoryAdapter` is **merged over** the caller's scope on every `store()` and `search()` call — the adapter's keys always win. This creates a hard security boundary: one adapter per domain/tenant means cross-domain leakage is architecturally impossible.

```typescript
const billingAdapter = new PgVectorMemoryAdapter(ds, embeddings, {
  defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
});

// Caller narrows the scope with projectId — but domain + enterpriseId are locked
await billingAdapter.search('query', { scope: { projectId: 'proj-42' } });
// → effective scope: { domain: 'billing', enterpriseId: 'ent-1', projectId: 'proj-42' }
```

---

### SemanticMemoryDefinition — class decorator

Mirrors `@AgentDefinition`: declares a named memory store as a class so it can be referenced by type across bounded context modules.

```typescript
import { SemanticMemoryDefinition } from 'ai-kit';

@SemanticMemoryDefinition({
  id: 'billing-memory',
  tableName: 'ai_memories_billing',
  defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
  isDefault: false,
})
export class BillingMemory {}
```

| Option | Type | Description |
|--------|------|-------------|
| `id` | `string` | Memory id registered in `MemoryService`. |
| `tableName` | `string` | Optional PostgreSQL table name. |
| `dimensions` | `number` | Optional embedding vector size. |
| `defaultScope` | `MemoryScope` | Locked scope enforced on every operation. |
| `isDefault` | `boolean` | Set as default memory after registration. |

---

### SemanticMemoryFactory

Globally injectable service that creates and registers `PgVectorMemoryAdapter` instances from decorated classes or raw configs.

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { SemanticMemoryFactory } from 'ai-kit';
import { DataSource } from 'typeorm';
import { OpenAIEmbeddings } from '@langchain/openai';

@Injectable()
export class BillingInit implements OnModuleInit {
  constructor(
    private readonly semanticMemoryFactory: SemanticMemoryFactory,
    private readonly dataSource: DataSource,
    private readonly embeddings: OpenAIEmbeddings,
  ) {}

  async onModuleInit() {
    // Creates schema + indexes (idempotent) and registers with MemoryService
    await this.semanticMemoryFactory.createAndRegister(BillingMemory, {
      dataSource: this.dataSource,
      embeddings: this.embeddings,
    });
  }
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `create(definition, deps)` | `Promise<PgVectorMemoryAdapter>` | Builds and initializes an adapter without registering it. |
| `createAndRegister(definition, deps)` | `Promise<PgVectorMemoryAdapter>` | Builds, initializes, and registers with `MemoryService`. |

Both methods accept a `@SemanticMemoryDefinition`-decorated class or a raw `ISemanticMemoryDefinitionConfig` object.

---

### MemoryConsolidationService

After each agent run, consolidates the conversation into long-term semantic memory by summarizing messages with the LLM and storing the result via `PgVectorMemoryAdapter`.

```typescript
import { Injectable } from '@nestjs/common';
import { AgentService, MemoryConsolidationService } from 'ai-kit';

@Injectable()
export class ChatService {
  constructor(
    private readonly agentService: AgentService,
    private readonly consolidation: MemoryConsolidationService,
  ) {}

  async chat(userId: string, input: string) {
    const threadId = `chat-${userId}`;

    const result = await this.agentService.run('chat-agent', { input, threadId });

    await this.consolidation.consolidate({
      messages: result.messages ?? [],
      threadId,
      userId,
      scope: { domain: 'chat', enterpriseId: 'ent-1' },
      semanticMemoryId: 'chat-memory',  // must be a registered ISemanticMemoryAdapter
    });

    return result.output;
  }
}
```

`IConsolidationOptions`:

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `BaseMessage[]` | Conversation messages (from `IAgentResult.messages`). |
| `threadId` | `string` | Conversation thread id. |
| `userId` | `string` | User identifier. |
| `scope` | `MemoryScope` | Isolation dimensions for the stored entry. |
| `semanticMemoryId` | `string` | Id of the registered `ISemanticMemoryAdapter`. |
| `modelId` | `string` | Optional model id for summarization (uses default). |

### Per-run retrieval injection

Set `semanticMemory` on `IAgentConfig` to automatically prepend relevant long-term memories as a `SystemMessage` before each `run()` / `stream()`:

```typescript
@AgentDefinition({
  id: 'billing-agent',
  modelId: 'gpt4o',
  systemPrompt: 'You are a billing expert.',
  semanticMemory: {
    semanticMemoryId: 'billing-memory',
    topK: 5,
    includeInSystemPrompt: true,  // default
    scope: { domain: 'billing', projectId: 'proj-42' },
  },
})
export class BillingAgent {}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `semanticMemoryId` | `string` | — | Id of the semantic adapter. |
| `topK` | `number` | `5` | Number of memories to retrieve. |
| `includeInSystemPrompt` | `boolean` | `true` | Prepend memories as a `SystemMessage`. |
| `scope` | `MemoryScope` | `{}` | Filters retrieved memories. |

---

## Multi-domain / CQRS architecture

In CQRS / DDD applications, each **bounded context** owns its agents, sub-agents, graphs, and memories. Map each domain to a NestJS feature module and use `AiKitModule.forFeature()` to register resources additively without coupling domains.

```
AppModule
├── BillingModule     (domain: billing)
│   ├── BillingMemory       @SemanticMemoryDefinition — scope { domain: 'billing' }
│   ├── BillingAgent        @AgentDefinition — references billing-memory
│   └── BillingModule       AiKitModule.forFeature({ agents: [BillingAgent] })
├── SupportModule     (domain: support)
│   ├── SupportMemory       @SemanticMemoryDefinition — scope { domain: 'support' }
│   ├── DocSearcherSubAgent @SubAgentDefinition
│   ├── SupportOrchestrator @AgentDefinition + @UsesSubAgents
│   ├── TicketQualifier     @AgentDefinition
│   └── SupportModule       AiKitModule.forFeature({ agents: [...], graphs: [...] })
└── AnalyticsModule   (domain: analytics)
    └── ...
```

### Pattern: one feature module per domain

Each domain declares its definitions as decorated classes and wires them through `forFeature()`:

```typescript
// billing/billing.definitions.ts
import { AgentDefinition, SemanticMemoryDefinition } from 'ai-kit';

@SemanticMemoryDefinition({
  id: 'billing-memory',
  tableName: 'ai_memories_billing',
  defaultScope: { domain: 'billing', enterpriseId: 'ent-1' },
})
export class BillingMemory {}

@AgentDefinition({
  id: 'billing-agent',
  modelId: 'gpt4o',
  systemPrompt: 'You are a billing expert.',
  semanticMemory: {
    semanticMemoryId: 'billing-memory',
    topK: 5,
    scope: { domain: 'billing' },
  },
})
export class BillingAgent {}
```

```typescript
// billing/billing.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  InjectAgent,
  SemanticMemoryFactory,
  MemoryConsolidationService,
  Agent,
} from 'ai-kit';
import { DataSource } from 'typeorm';
import { OpenAIEmbeddings } from '@langchain/openai';
import { BillingMemory } from './billing.definitions';

@Injectable()
export class BillingService implements OnModuleInit {
  constructor(
    @InjectAgent('billing-agent') private readonly agent: Agent,
    private readonly semanticMemoryFactory: SemanticMemoryFactory,
    private readonly consolidation: MemoryConsolidationService,
    private readonly dataSource: DataSource,
    private readonly embeddings: OpenAIEmbeddings,
  ) {}

  async onModuleInit() {
    // Idempotent: creates table/indexes only if they don't exist
    await this.semanticMemoryFactory.createAndRegister(BillingMemory, {
      dataSource: this.dataSource,
      embeddings: this.embeddings,
    });
  }

  async processInvoice(invoiceId: string, userId: string) {
    const threadId = `billing-${userId}-${invoiceId}`;
    const result = await this.agent.run({ input: `Check invoice ${invoiceId}`, threadId });

    // Long-term memory consolidation after the run
    await this.consolidation.consolidate({
      messages: result.messages ?? [],
      threadId,
      userId,
      scope: { domain: 'billing', enterpriseId: 'ent-1' },
      semanticMemoryId: 'billing-memory',
    });

    return result.output;
  }
}
```

```typescript
// billing/billing.module.ts
import { Module } from '@nestjs/common';
import { AiKitModule } from 'ai-kit';
import { BillingAgent } from './billing.definitions';
import { BillingService } from './billing.service';

@Module({
  imports: [
    AiKitModule.forFeature({
      agents: [BillingAgent],
    }),
  ],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
```

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { AiKitModule } from 'ai-kit';
import { BillingModule } from './billing/billing.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [
    AiKitModule.forRoot({
      models: [
        { id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o', apiKey: process.env.OPENAI_API_KEY },
      ],
    }),
    BillingModule,
    SupportModule,
  ],
})
export class AppModule {}
```

> **Full working example**: see [`examples/cqrs-example.ts`](./examples/cqrs-example.ts) for a complete two-domain app (billing + support) with sub-agents, graphs, memory consolidation, and pipeline injection.

### Isolation guarantees

| Level | Mechanism |
|-------|-----------|
| **Data isolation** | `defaultScope` on `PgVectorMemoryAdapter` — overrides any caller-supplied scope, preventing cross-domain reads/writes |
| **Index performance** | GIN index on `scope JSONB` — `@>` containment filtering per domain runs on the index, not a full-table scan |
| **Module isolation** | Each `forFeature()` module has its own providers; resources merge additively into global registries |
| **Thread isolation** | B-tree index on `thread_id` — fast per-conversation queries within a domain |

---



## Services

Core services expose stable APIs while keeping engine-specific internals hidden.

### ModelService

Manages language model providers.

```typescript
@Injectable()
export class MyService {
  constructor(private readonly modelService: ModelService) {}

  listModels()  { return this.modelService.listProviders(); }
  getDefault()  { return this.modelService.getModelProvider(); }
  getSpecific() { return this.modelService.getModelProvider('llama'); }
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `registerModel(config)` | `void` | Registers or updates a model. |
| `registerModels(configs)` | `void` | Registers multiple models in batch. |
| `getModelProvider(modelId?)` | `IModelProvider` | Returns the provider for the given ID (or the default). |
| `listProviders()` | `IModelProvider[]` | Lists all registered providers. |

---

### McpService

Manages connections to [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) servers and custom tools.

```typescript
@Injectable()
export class MyService {
  constructor(private readonly mcpService: McpService) {}

  getTools() { return this.mcpService.getTools(); }
  
  registerCustomTool(id: string, tool: StructuredTool) {
    this.mcpService.registerTool(id, tool);
  }
  
  getCustomTool(id: string) {
    return this.mcpService.getTool(id);
  }
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `configureServers(servers, opts?)` | `Promise<void>` | Adds or replaces MCP servers and reloads tools. |
| `registerTool(id, tool)` | `void` | Registers a custom `StructuredTool`. |
| `registerTools(tools)` | `void` | Registers multiple custom tools. |
| `getTool(id)` | `StructuredTool` | Returns the registered tool for the given ID. |
| `getTools()` | `ITool[]` | Returns all loaded MCP tools. |
| `getToolsByServer(serverId)` | `ITool[]` | Returns tools filtered by server. |
| `listCustomTools()` | `Array<{ id, tool }>` | Lists all registered custom tools. |

---

### MemoryService

Manages memory registry and resolution.

```typescript
@Injectable()
export class MyService {
  constructor(private readonly memoryService: MemoryService) {}

  list() { return this.memoryService.listMemories(); }
  setDefault(id: string) { this.memoryService.setDefaultMemory(id); }
  semantic() { return this.memoryService.resolveSemanticStore('billing-memory'); }
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `registerMemory(config)` | `void` | Registers a custom memory. |
| `registerMemories(configs)` | `void` | Registers multiple memories. |
| `setDefaultMemory(id)` | `void` | Sets the default memory. |
| `resolve(id?)` | `IMemoryAdapter` | Resolves a memory by id (or default). |
| `resolveSemanticStore(id?)` | `ISemanticMemoryAdapter` | Resolves and type-checks a semantic adapter. Throws if the adapter doesn't implement `store`/`search`. |
| `getCheckpointer(id?)` | `unknown` | Returns the LangGraph checkpointer of the memory. |
| `listMemories()` | `Array<{ id, isDefault }>` | Lists registered memories. |

---

### AgentService

Registry of `Agent` objects. Delegates execution to each `Agent` via the factory.

```typescript
@Injectable()
export class ChatService {
  constructor(private readonly agentService: AgentService) {}

  async setup() {
    const agent = await this.agentService.registerAgent({
      id: 'chat-agent',
      modelId: 'gpt4o',
      systemPrompt: 'You are an assistant.',
    });

    // Via the service (by id)
    const r1 = await this.agentService.run('chat-agent', { input: 'Hello' });
    // Or directly via the object
    const r2 = await agent.run({ input: 'Hello' });
  }
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `registerAgent(config, opts?)` | `Promise<Agent>` | Builds and registers an `Agent`. Returns the object. |
| `registerAgents(configs, opts?)` | `Promise<Agent[]>` | Registers multiple agents in batch. |
| `resolve(idOrAgent)` | `Agent` | Resolves from the registry. Throws if not found. |
| `run(idOrAgent, opts)` | `Promise<IAgentResult>` | Delegates to `agent.run()`. |
| `stream(idOrAgent, opts)` | `AsyncIterable<IAgentStreamEvent>` | Delegates to `agent.stream()`. |
| `resumeAfterInterrupt(idOrAgent, threadId, input?)` | `Promise<IAgentResult>` | Delegates to `agent.resumeAfterInterrupt()`. |
| `listAgents()` | `Agent[]` | Lists all registered agents. |

---

### AgentGraphService

Registry of `AgentGraph` objects. Delegates execution to each `AgentGraph` through the factory.

```typescript
@Injectable()
export class PipelineService {
  constructor(private readonly graphService: AgentGraphService) {}

  async setup() {
    const graph = await this.graphService.buildGraph({
      id: 'pipeline',
      entryNodeId: 'analyze',
      nodes: [{ id: 'analyze', agentId: 'analyzer' }],
      edges: [],
    });

    const r1 = await this.graphService.run('pipeline', 'input...');
    const r2 = await graph.run('input...'); // same result
  }
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `buildGraph(def)` | `Promise<AgentGraph>` | Compiles and registers an `AgentGraph`. Returns the object. |
| `buildGraphs(defs)` | `Promise<AgentGraph[]>` | Compiles multiple graphs in batch. |
| `resolve(id)` | `AgentGraph` | Resolves from the registry. Throws if missing. |
| `run(id, input, threadId?)` | `Promise<IGraphRunResult>` | Delegates to `agentGraph.run()`. |
| `stream(id, input, threadId?)` | `AsyncIterable<unknown>` | Delegates to `agentGraph.stream()`. |
| `listGraphs()` | `AgentGraph[]` | Lists all registered graphs. |

---

### MemoryConsolidationService

See [Semantic memory → MemoryConsolidationService](#memoryconsolidationservice) for the full API.

| Method | Returns | Description |
|--------|---------|-------------|
| `consolidate(options)` | `Promise<ConsolidatedMemoryEntry>` | Summarizes `messages` with the LLM and stores the result in the semantic adapter. |

---

### SemanticMemoryFactory

See [Semantic memory → SemanticMemoryFactory](#semanticmemoryfactory) for the full API.

| Method | Returns | Description |
|--------|---------|-------------|
| `create(definition, deps)` | `Promise<PgVectorMemoryAdapter>` | Builds and initializes a `PgVectorMemoryAdapter`. Not registered. |
| `createAndRegister(definition, deps)` | `Promise<PgVectorMemoryAdapter>` | Builds, initializes, and registers with `MemoryService`. |

---

### SubAgentService

Compiles delegable sub-agents for a parent agent.

```typescript
@Injectable()
export class OrchestrationService {
  constructor(private readonly subAgentService: SubAgentService) {}

  buildSubAgents() {
    return this.subAgentService.compileSubAgents([
      { name: 'researcher', description: 'Researches information.', modelId: 'gpt4o' },
      { name: 'writer',     description: 'Writes content.',         systemPrompt: 'You are a writer.' },
    ]);
  }
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `compileSubAgent(spec)` | `ICompiledSubAgent` | Compiles an `ISubAgentSpec` (cached). |
| `compileSubAgents(specs)` | `ICompiledSubAgent[]` | Compiles multiple specs in batch. |
| `listSubAgents()` | `ICompiledSubAgent[]` | Lists all compiled sub-agents. |

---

### HitlService

Manages **Human-in-the-Loop** interruption flow via `EventEmitter`.

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { HitlService, IInterruptPayload } from 'ai-kit';

@Injectable()
export class HitlGateway implements OnModuleInit {
  constructor(private readonly hitlService: HitlService) {}

  onModuleInit() {
    this.hitlService.on('interrupt', async (payload: IInterruptPayload) => {
      console.log(`Tool: ${payload.toolName}`, payload.toolInput);
      payload.resolve({ threadId: payload.threadId, action: 'approve' });
    });
  }
}
```

| Method | Description |
|--------|-------------|
| `resume(threadId, toolName, decision)` | Resolves a pending interruption. |
| `hasPendingInterrupt(threadId)` | Checks if an interruption is pending. |
| `on('interrupt', handler)` | Listens to interruption events (inherited from `EventEmitter`). |

`IInterruptDecision.action` :

| Value | Description |
|-------|-------------|
| `'approve'` | Continue execution normally. |
| `'reject'` | Cancel the tool call. |
| `'edit'` | Edit input before continuing (via `updatedInput`). |

---

### AcpService

Starts an **ACP (Agent Communication Protocol)** server to expose agents to external clients.

```typescript
AiKitModule.forRoot({
  models: [{ id: 'default', provider: 'openai', modelName: 'gpt-4o' }],
  acp: {
    port: 9000,
    agents: [
      {
        name: 'assistant',
        description: 'General assistant.',
        modelId: 'default',
        mcpServerIds: ['filesystem'],
      },
    ],
    authMethods: [
      {
        id: 'openai-key',
        name: 'OpenAI API Key',
        type: 'env_var',
        vars: [{ name: 'OPENAI_API_KEY', label: 'OpenAI API Key', secret: true }],
      },
    ],
  },
})
```

---

### AiKitConfiguratorService

Single facade to reconfigure the module dynamically after bootstrap.

```typescript
@Injectable()
export class RuntimeSetupService {
  constructor(private readonly configurator: AiKitConfiguratorService) {}

  async setup() {
    await this.configurator.configure({
      mcpServers: [{ id: 'docs', transport: 'sse', url: 'http://localhost:8080/sse' }],
      agents: [{ id: 'runtime-agent', modelId: 'gpt4o', mcpServerIds: ['docs'] }],
    });
  }
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `configure(options)` | `Promise<void>` | Applies additive configuration (`models`, `mcpServers`, `agents`, `graphs`, `acp`). |

---

## Interfaces

### `IModelConfig`

```typescript
interface IModelConfig {
  id: string;
  provider: 'openai' | 'ollama' | 'anthropic' | 'azure-openai';
  modelName: string;
  temperature?: number;
  apiKey?: string;
  baseUrl?: string;
  extra?: Record<string, unknown>;
}
```

### `IAgentConfig`

```typescript
interface IAgentConfig {
  id: string;
  modelId?: string;
  systemPrompt?: string;
  mcpServerIds?: string[];
  memoryId?: string;
  subAgents?: SubAgentDefinitionInput[];
  hitl?: IHumanInTheLoopConfig;
  responseFormat?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}
```

### `AgentDefinitionInput`

```typescript
type AgentDefinitionInput = IAgentConfig | IAgentDefinitionClass;

type IAgentDefinitionClass = abstract new (...args: any[]) => unknown;
```

### `SubAgentDefinitionInput`

```typescript
type SubAgentDefinitionInput = ISubAgentSpec | ISubAgentDefinitionClass;

type ISubAgentDefinitionClass = abstract new (...args: any[]) => unknown;
```

### `IAgentGraph`

```typescript
interface IAgentGraph {
  id: string;
  memoryId?: string;
  nodes: IGraphNodeDef[];      // Nodes (each references an agentId)
  edges: IGraphEdgeDef[];      // Conditional or unconditional edges
  entryNodeId: string;
  exitNodeId?: string;         // Implicit END when omitted
}

interface IGraphNodeDef {
  id: string;
  agentId: string;
  systemPrompt?: string;       // Overrides the agent systemPrompt
}

interface IGraphEdgeDef {
  from: string;
  to: string;
  condition?: string;          // State property to evaluate
  conditionValue?: unknown;
}
```

### `IMcpServerConfig`

```typescript
// Local process (stdio)
type IMcpStdioServerConfig = {
  id: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

// Remote server (SSE / HTTP)
type IMcpSseServerConfig = {
  id: string;
  transport: 'sse';
  url: string;
  headers?: Record<string, string>;
};
```

### `IToolConfig`

```typescript
interface IToolConfig {
  id: string;
  tool: StructuredTool;  // LangChain tool implementation
}
```

### `IMemoryAdapter` / `IMemoryConfig` / `ISemanticMemoryAdapter`

```typescript
interface IMemoryAdapter {
  getCheckpointer(): unknown;
}

interface ISemanticMemoryAdapter extends IMemoryAdapter {
  store(entry: ConsolidatedMemoryEntry): Promise<ConsolidatedMemoryEntry>;
  search(query: string, opts?: ISemanticSearchOptions): Promise<ConsolidatedMemoryEntry[]>;
}

interface IMemoryConfig {
  id: string;
  adapter: IMemoryAdapter;
  type?: 'checkpointer' | 'semantic' | 'composite';
  isDefault?: boolean;
}

interface ISemanticSearchOptions {
  k?: number;
  scope?: MemoryScope;
}

interface MemoryScope {
  domain?: string;
  enterpriseId?: string;
  projectId?: string;
  [key: string]: string | undefined;
}

interface ConsolidatedMemoryEntry {
  id?: string;
  threadId: string;
  userId?: string;
  content: string;
  embedding: number[];
  scope?: MemoryScope;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}
```

### `ISemanticMemoryDefinitionConfig`

```typescript
interface ISemanticMemoryDefinitionConfig {
  id: string;
  tableName?: string;
  dimensions?: number;
  defaultScope?: MemoryScope;
  isDefault?: boolean;
}
```

### `SemanticMemoryDefinitionInput`

```typescript
type SemanticMemoryDefinitionInput =
  | ISemanticMemoryDefinitionConfig
  | ISemanticMemoryDefinitionClass;

type ISemanticMemoryDefinitionClass = abstract new (...args: any[]) => unknown;
```

### `IAgentRunOptions`

```typescript
interface IAgentRunOptions {
  input: string | Record<string, unknown>;
  threadId?: string;                        // Conversation memory + HITL resume
  stream?: boolean;
  context?: Record<string, unknown>;
}
```

### `IAgentResult` / `IAgentStreamEvent`

```typescript
interface IAgentResult {
  output: string | Record<string, unknown>;
  messages?: IAgentMessage[];
  meta?: Record<string, unknown>;  // { threadId, ... }
}

interface IAgentStreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'interrupt' | 'done' | 'error';
  data: unknown;
}
```

### `ISubAgentSpec`

```typescript
interface ISubAgentSpec {
  name: string;
  description: string;
  systemPrompt?: string;
  modelId?: string;
  hitl?: IHumanInTheLoopConfig;
  graphId?: string;       // For remote sub-agents (LangGraph Cloud)
  remoteUrl?: string;
}
```

---

## LLM security tools

Built-in presets:

- `prompt-injection-guard`
- `pii-redactor`
- `content-policy-guard`

Register in `forRoot`, `forFeature`, or at runtime through `AiKitConfiguratorService.configure({ securityTools: [...] })`.

```typescript
AiKitModule.forRoot({
  models: [{ id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o' }],
  securityTools: [
    { id: 'injection-guard', preset: 'prompt-injection-guard' },
    { id: 'pii-cleaner', preset: 'pii-redactor' },
    { id: 'policy-check', preset: 'content-policy-guard' },
  ],
});
```

`SecurityToolService` methods:

- `registerTool(config)`: compiles and registers one security tool.
- `registerTools(configs)`: batch registration helper.
- `getTool(id)`: resolves a registered tool by id.
- `listTools()`: returns registered tool descriptors.

---

## Injection tokens

Use service tokens with `@Inject()`, and named resource tokens/decorators for direct resource injection.

```typescript
import { Inject } from '@nestjs/common';
import { AI_KIT_AGENT_SERVICE, AgentService } from 'ai-kit';

constructor(
  @Inject(AI_KIT_AGENT_SERVICE) private readonly agentService: AgentService,
) {}
```

Common tokens/decorators:

- `AI_KIT_OPTIONS`
- `AI_KIT_MODEL_SERVICE`
- `AI_KIT_MCP_SERVICE`
- `AI_KIT_SECURITY_TOOL_SERVICE`
- `AI_KIT_MEMORY_SERVICE`
- `AI_KIT_AGENT_SERVICE`
- `AI_KIT_AGENT_GRAPH_SERVICE`
- `AI_KIT_SUB_AGENT_SERVICE`
- `AI_KIT_HITL_SERVICE`
- `AI_KIT_ACP_SERVICE`
- `AI_KIT_FEATURE_OPTIONS`
- `@InjectAgent(id)`
- `@InjectAgentGraph(id)`
- `@InjectTool(id)`
- `@InjectSecurityTool(id)`
- `@InjectMemory(id)`
- `getAgentToken(id)`
- `getAgentGraphToken(id)`
- `getToolToken(id)`
- `getSecurityToolToken(id)`
- `getMemoryToken(id)`

New services globally injectable (no token required — inject by class):
- `SemanticMemoryFactory` — creates/registers semantic adapters
- `MemoryConsolidationService` — LLM summarization + pgvector persistence

---

## Advanced examples

### Agent with sub-agents and HITL

```typescript
AiKitModule.forRoot({
  models: [{ id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o' }],
  agents: [
    {
      id: 'orchestrator',
      modelId: 'gpt4o',
      systemPrompt: 'You orchestrate complex tasks.',
      subAgents: [{ name: 'researcher', description: 'Performs research.', modelId: 'gpt4o' }],
      hitl: {
        interruptOn: {
          delete_file: true,
          write_file: { enabled: true, prompt: 'Confirm modification?' },
        },
      },
    },
  ],
});
```

### Custom tool

```typescript
import { tool } from '@langchain/core/tools';

const searchTool = tool(
  async ({ query }: { query: string }) => `Results for: ${query}`,
  {
    name: 'search',
    description: 'Runs a search.',
    schema: z.object({ query: z.string().describe('Search query') }),
  },
);
```

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `LANGCHAIN_TRACING_V2` | Set `true` to enable LangSmith tracing |
| `LANGCHAIN_API_KEY` | LangSmith API key |
| `LANGCHAIN_PROJECT` | LangSmith project name |

---

## License

MIT - © Romuald Mocq / Plume Labs
