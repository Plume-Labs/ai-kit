# AGENTS.md

## Scope
- This repository is a **NestJS library** (`ai-kit`), not an app. Public API is re-exported from `src/index.ts` and packaged via `index.js` -> `dist/index.js`.
- Core goal: hide `deepagents`, `LangChain`, and `LangGraph` internals behind stable Nest services and domain objects (`Agent`, `AgentGraph`).

## Architecture Map (read these first)
- `src/module/ai-kit.module.ts`: composition root (`forRoot`, `forRootAsync`, `forFeature`), global providers, feature-level token exports.
- `src/services/ai-kit-feature-initializer.service.ts`: additive `forFeature()` bootstrap behavior on module init.
- `src/services/ai-kit-configurator.service.ts`: runtime reconfiguration facade (hot add/update models, MCP, memories, agents, graphs, ACP).
- `src/agents/agent.service.ts` + `src/agents/agent.factory.ts`: registry + factory split; service resolves/stores, factory builds deepagents-backed instances.
- `src/agents/agent-graph.service.ts` + `src/agents/agent-graph.factory.ts`: same registry/factory pattern for compiled LangGraph graphs.
- `src/services/mcp.service.ts`, `src/services/memory.service.ts`, `src/models/model.service.ts`: stateful registries used by factories.

## Data/Execution Flow
- `AiKitModule.forRoot(...)` seeds base options; each service self-initializes in `onModuleInit` from `AI_KIT_OPTIONS`.
- `forFeature(...)` is **additive**, not isolated: feature resources are merged into global registries (`ModelService`, `McpService`, `MemoryService`, `AgentService`, `AgentGraphService`).
- Agent execution path: `AgentService.registerAgent` -> `AgentFactory.create` -> `createDeepAgent(...)` -> wrapped `Agent.run/stream/resumeAfterInterrupt`.
- Graph execution path: `AgentGraphService.buildGraph` -> `AgentGraphFactory.create` -> `StateGraph.compile(...)` with memory checkpointer.

## Project-Specific Conventions
- Services expose stable public methods and keep raw engine access behind `_internal` methods (examples: `ModelService._getInternalModel`, `McpService._getInternalTools`).
- Errors are explicit and prefixed with `[AiKit]`; preserve this style when adding new thrown errors.
- IDs are the primary key everywhere (`modelId`, `memoryId`, `agentId`, graph node IDs); merging/replacement behavior is ID-driven.
- `MemoryService` guarantees a default memory (`default` in-memory fallback) and supports legacy `checkpointer` option for backward compatibility.
- `McpService.configureServers` reloads MCP tools after any registry change; custom tools are separate (`registerTool(s)`) and merged at use time.

## Integration Points / External Dependencies
- LLM providers are instantiated in `src/models/model.factory.ts` (`openai`, `azure-openai`, `ollama`, dynamic `anthropic`).
- MCP server connections are managed by `@langchain/mcp-adapters` (`MultiServerMCPClient`) in `src/services/mcp.service.ts`.
- ACP server exposure uses `deepagents-acp` in `src/services/acp.service.ts`.
- HITL is event-driven via `HitlService` extending `EventEmitter`; host app must subscribe to `'interrupt'` and call `resume(...)`.

## Developer Workflows
- Build library: `npm run build` (TypeScript only; outputs `dist/`).
- Run tests: `npm test` (script builds first, then runs `node --test`).
- Watch tests: `npm run test:watch`.
- Tests in `test/*.js` import from `dist/...`; if you run `node --test` directly, build first.

## Safe Change Guidelines
- When adding a new configurable resource, wire it through all 3 entry points: `AiKitModuleOptions`, `forFeature` init path, and `AiKitConfiguratorService.configure`.
- Keep public API updates synchronized in `src/index.ts` (types, classes, tokens, decorators).
- Preserve additive default behavior unless an explicit `replace/overwrite` option exists (see MCP replace and agent overwrite flags).
