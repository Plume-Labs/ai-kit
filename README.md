# ai-kit

**NestJS kit to manage AI workflow**

> ⚠️ **Projet en développement actif** : l'API, les options de configuration et certains comportements peuvent évoluer rapidement entre versions.

`ai-kit` est un module NestJS qui simplifie l'intégration de workflows IA dans vos applications. Il abstrait [deepagents](https://www.npmjs.com/package/deepagents), [LangChain](https://js.langchain.com/) et [LangGraph](https://langchain-ai.github.io/langgraphjs/) derrière des interfaces stables, en exposant des services injectables et des objets domaine autonomes.

---

## Table des matières

- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Configuration du module](#configuration-du-module)
- [Configuration runtime](#configuration-runtime)
- [forFeature — configuration par feature module](#forfeature--configuration-par-feature-module)
- [Injection directe d'agents, de graphes, d'outils et de mémoires](#injection-directe-dagents-de-graphes-doutils-et-de-memoires)
- [Objets domaine](#objets-domaine)
  - [Agent](#agent)
  - [AgentGraph](#agentgraph)
- [Factories](#factories)
  - [AgentFactory](#agentfactory)
  - [AgentGraphFactory](#agentgraphfactory)
- [Services](#services)
  - [ModelService](#modelservice)
  - [McpService](#mcpservice)
  - [MemoryService](#memoryservice)
  - [AgentService](#agentservice)
  - [AgentGraphService](#agentgraphservice)
  - [SubAgentService](#subagentservice)
  - [HitlService](#hitlservice)
  - [AcpService](#acpservice)
  - [AiKitConfiguratorService](#aikitconfiguratorservice)
- [Interfaces](#interfaces)
- [Outils de sécurité LLM](#outils-de-sécurité-llm)
  - [Presets disponibles](#presets-disponibles)
  - [Enregistrement dans forRoot](#enregistrement-dans-forroot)
  - [Enregistrement dans forFeature](#enregistrement-dans-forfeature)
  - [Configuration runtime](#configuration-runtime-1)
  - [Injection directe](#injection-directe)
  - [Appel programmatique](#appel-programmatique)
  - [SecurityToolService](#securitytoolservice)
  - [Interfaces](#interfaces-de-sécurité)
- [Tokens d'injection](#tokens-dinjection)
- [Exemples avancés](#exemples-avancés)
- [Variables d'environnement](#variables-denvironnement)

---

## Installation

```bash
npm install ai-kit
```

**Peer dependencies requises :**

```bash
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

---

## Démarrage rapide

### Configuration statique

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

### Configuration asynchrone (avec ConfigService)

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

> Le module est **global** : une fois importé dans `AppModule`, tous les services sont disponibles dans toute l'application sans ré-importation.

---

## Configuration du module

`AiKitModuleOptions` accepte les propriétés suivantes :

| Propriété | Type | Description |
|-----------|------|-------------|
| `models` | `IModelConfig[]` | Configurations des providers de modèles. Le premier devient le provider par défaut. |
| `mcpServers` | `IMcpServerConfig[]` | Serveurs MCP à connecter au démarrage. |
| `tools` | `IToolConfig[]` | Outils personnalisés à enregistrer. |
| `securityTools` | `ISecurityToolConfig[]` | Outils de sécurité prêts à l'emploi (presets). |
| `memories` | `IMemoryConfig[]` | Mémoires personnalisées à enregistrer. |
| `defaultMemoryId` | `string` | ID de la mémoire par défaut. |
| `acp` | `IAcpServerConfig` | Configuration du serveur ACP (Agent Communication Protocol). Optionnel. |
| `agents` | `IAgentConfig[]` | Agents pré-enregistrés au démarrage. |
| `graphs` | `IAgentGraph[]` | Graphes d'agents pré-enregistrés au démarrage. |
| `checkpointer` | `unknown` | **Déprécié**. Alias legacy vers la mémoire par défaut. |
| `langSmithTracing` | `boolean` | Active le tracing LangSmith. Par défaut : valeur de `LANGCHAIN_TRACING_V2`. |

### Exemple complet

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
      systemPrompt: 'Tu es un assistant utile.',
      mcpServerIds: ['filesystem'],
    },
  ],
  langSmithTracing: true,
})
```

---

## Configuration runtime

En plus de `forRoot()` / `forRootAsync()`, vous pouvez modifier la configuration **après bootstrap** avec `AiKitConfiguratorService`.

Cas d'usage typiques : agents multi-tenant, connexion MCP à la volée, recompilation de graphes sans redémarrage.

```typescript
import { Injectable } from '@nestjs/common';
import { AiKitConfiguratorService } from 'ai-kit';

@Injectable()
export class RuntimeSetupService {
  constructor(private readonly aiKitConfigurator: AiKitConfiguratorService) {}

  async setupTenant(tenantId: string) {
    await this.aiKitConfigurator.configure({
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
          systemPrompt: `Assistant du tenant ${tenantId}`,
          mcpServerIds: [`fs-${tenantId}`],
        },
      ],
    });
  }
}
```

Options de `AiKitRuntimeConfigureOptions` :

| Propriété | Type | Description |
|-----------|------|-------------|
| `models` | `IModelConfig[]` | Modèles à ajouter/mettre à jour. |
| `mcpServers` | `IMcpServerConfig[]` | Serveurs MCP à ajouter (fusionnés par id). |
| `memories` | `IMemoryConfig[]` | Mémoires à ajouter/mettre à jour. |
| `defaultMemoryId` | `string` | Définit la mémoire par défaut. |
| `agents` | `IAgentConfig[]` | Agents à enregistrer. |
| `graphs` | `IAgentGraph[]` | Graphes à compiler. |
| `acp` | `IAcpServerConfig \| null` | Reconfigure l'ACP. `null` arrête le serveur. |
| `replaceMcpServers` | `boolean` | Remplace tous les serveurs MCP existants avant rechargement. |
| `overwriteAgents` | `boolean` | Autorise l'écrasement d'un agent déjà enregistré. |
| `restartAcp` | `boolean` | Force le redémarrage du serveur ACP. |
| `securityTools` | `ISecurityToolConfig[]` | Outils de sécurité à ajouter à chaud. |

---

## forFeature — configuration par feature module

`AiKitModule.forFeature()` permet à **chaque module fonctionnel** de déclarer ses propres agents, outils MCP, modèles ou graphes, sans surcharger le `forRoot()` de `AppModule`.

Les ressources sont enregistrées de façon **additive** dans les services globaux lors de l'initialisation du feature module.

> **Prérequis :** `AppModule` doit déjà avoir appelé `AiKitModule.forRoot(...)`.

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
          systemPrompt: 'Tu analyses des données.',
          mcpServerIds: ['reports-fs'],
        },
        {
          id: 'summary-agent',
          modelId: 'analyst-model',
          systemPrompt: 'Tu résumes des analyses en bullet points.',
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

`AiKitFeatureOptions` :

| Propriété | Type | Description |
|-----------|------|-------------|
| `agents` | `IAgentConfig[]` | Agents à enregistrer dans `AgentService`. |
| `mcpServers` | `IMcpServerConfig[]` | Serveurs MCP à connecter. |
| `tools` | `IToolConfig[]` | Outils personnalisés à enregistrer dans `McpService`. |
| `securityTools` | `ISecurityToolConfig[]` | Outils de sécurité (presets) à enregistrer dans `SecurityToolService`. |
| `memories` | `IMemoryConfig[]` | Mémoires personnalisées à enregistrer dans `MemoryService`. |
| `models` | `IModelConfig[]` | Modèles à enregistrer dans `ModelService`. |
| `graphs` | `IAgentGraph[]` | Graphes d'agents à compiler dans `AgentGraphService`. |

---

## Injection directe d'agents, de graphes, d'outils et de mémoires

Les agents, graphes, outils et mémoires déclarés dans `forFeature()` (ou `forRoot()` pour les mémoires) sont automatiquement disponibles en injection directe via `@InjectAgent()`, `@InjectAgentGraph()`, `@InjectTool()` et `@InjectMemory()`.

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

| Décorateur | Retourne | Description |
|------------|----------|-------------|
| `@InjectAgent(id)` | `Agent` | Injecte l'objet `Agent` correspondant à l'id. |
| `@InjectAgentGraph(id)` | `AgentGraph` | Injecte l'objet `AgentGraph` correspondant à l'id. |
| `@InjectTool(id)` | `StructuredTool` | Injecte l'outil `StructuredTool` correspondant à l'id. |
| `@InjectSecurityTool(id)` | `StructuredTool` | Injecte l'outil de sécurité correspondant à l'id. |
| `@InjectMemory(id)` | `IMemoryAdapter` | Injecte l'adaptateur mémoire correspondant à l'id. |

Pour les cas avancés (providers dynamiques, tests unitaires) :

```typescript
import { getAgentToken, getAgentGraphToken, getToolToken, getMemoryToken } from 'ai-kit';

{
  provide: getAgentToken('my-agent'),
  useFactory: (agentService: AgentService) =>
    agentService.registerAgent({ id: 'my-agent', modelId: 'gpt4o' }),
  inject: [AgentService],
}

{
  provide: getToolToken('my-tool'),
  useFactory: (mcpService: McpService) => {
    const tool = new MyCustomTool();
    mcpService.registerTool('my-tool', tool);
    return tool;
  },
  inject: [McpService],
}

{
  provide: getMemoryToken('redis-memory'),
  useValue: myRedisMemoryAdapter,
}
```

---

## Objets domaine

`ai-kit` expose des objets domaine autonomes : `Agent` et `AgentGraph`. Ils encapsulent toute la logique d'exécution et peuvent être utilisés directement, indépendamment des services NestJS.

### Agent

Représente un agent prêt à l'exécution. Obtenu via `AgentService.registerAgent()`, `@InjectAgent()` ou `AgentFactory.create()`.

```typescript
const agent: Agent = await agentService.registerAgent({
  id: 'my-agent',
  modelId: 'gpt4o',
  systemPrompt: 'Tu es un assistant.',
});

// Exécution synchrone
const result = await agent.run({ input: 'Bonjour !', threadId: 'thread-1' });
console.log(result.output);

// Streaming
for await (const event of agent.stream({ input: 'Raconte une histoire.' })) {
  if (event.type === 'text') process.stdout.write(String(event.data));
  if (event.type === 'done') break;
}

// Reprise après HITL
const resumed = await agent.resumeAfterInterrupt('thread-1', { confirmed: true });
```

| Méthode | Retour | Description |
|---------|--------|-------------|
| `run(opts)` | `Promise<IAgentResult>` | Exécution synchrone. |
| `stream(opts)` | `AsyncIterable<IAgentStreamEvent>` | Exécution en streaming. |
| `resumeAfterInterrupt(threadId, updatedInput?)` | `Promise<IAgentResult>` | Reprend après une interruption HITL. |

| Propriété | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Identifiant de l'agent. |
| `config` | `IAgentConfig` | Configuration source de l'agent. |

---

### AgentGraph

Représente un graphe d'agents compilé. Obtenu via `AgentGraphService.buildGraph()`, `@InjectAgentGraph()` ou `AgentGraphFactory.create()`.

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

const result = await graph.run('Analyse ces données...', 'thread-001');

for await (const chunk of graph.stream('Analyse ces données...')) {
  console.log(chunk);
}
```

| Méthode | Retour | Description |
|---------|--------|-------------|
| `run(input, threadId?)` | `Promise<IGraphRunResult>` | Exécution synchrone jusqu'au nœud de sortie. |
| `stream(input, threadId?)` | `AsyncIterable<unknown>` | Streaming — émet un chunk par nœud terminé. |

| Propriété | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Identifiant du graphe. |
| `definition` | `IAgentGraph` | Définition source du graphe. |

---

## Factories

Les factories construisent les objets domaine à partir de leurs configurations. Elles sont utilisées en interne par les services, mais peuvent aussi être instanciées directement (tests unitaires, usage hors NestJS).

### AgentFactory

```typescript
import { AgentFactory } from 'ai-kit';

const factory = new AgentFactory(modelService, mcpService, subAgentService, hitlService, memoryService);

const agent = await factory.create({
  id: 'my-agent',
  modelId: 'gpt4o',
  systemPrompt: 'Tu es un assistant.',
});
```

| Méthode | Retour | Description |
|---------|--------|-------------|
| `create(config)` | `Promise<Agent>` | Résout modèle, outils MCP, sous-agents, HITL et construit un objet `Agent`. |

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

| Méthode | Retour | Description |
|---------|--------|-------------|
| `create(def)` | `Promise<AgentGraph>` | Compile le `StateGraph` LangGraph et retourne un objet `AgentGraph`. |

---

## Services

### ModelService

Gère les providers de modèles de langage.

```typescript
@Injectable()
export class MyService {
  constructor(private readonly modelService: ModelService) {}

  listModels()  { return this.modelService.listProviders(); }
  getDefault()  { return this.modelService.getModelProvider(); }
  getSpecific() { return this.modelService.getModelProvider('llama'); }
}
```

| Méthode | Retour | Description |
|---------|--------|-------------|
| `registerModel(config)` | `void` | Enregistre ou met à jour un modèle. |
| `registerModels(configs)` | `void` | Enregistre plusieurs modèles en lot. |
| `getModelProvider(modelId?)` | `IModelProvider` | Retourne le provider pour l'ID donné (ou le défaut). |
| `listProviders()` | `IModelProvider[]` | Liste tous les providers enregistrés. |

---

### McpService

Gère les connexions aux serveurs [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) et les outils personnalisés.

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

| Méthode | Retour | Description |
|---------|--------|-------------|
| `configureServers(servers, opts?)` | `Promise<void>` | Ajoute ou remplace des serveurs MCP et recharge les outils. |
| `registerTool(id, tool)` | `void` | Enregistre un outil personnalisé `StructuredTool`. |
| `registerTools(tools)` | `void` | Enregistre plusieurs outils personnalisés. |
| `getTool(id)` | `StructuredTool` | Retourne l'outil enregistré pour l'ID donné. |
| `getTools()` | `ITool[]` | Retourne tous les outils MCP chargés. |
| `getToolsByServer(serverId)` | `ITool[]` | Retourne les outils filtrés par serveur. |
| `listCustomTools()` | `Array<{ id, tool }>` | Liste tous les outils personnalisés enregistrés. |

---

### MemoryService

Gère le registre des mémoires et la résolution du checkpointer à utiliser.

```typescript
@Injectable()
export class MyService {
  constructor(private readonly memoryService: MemoryService) {}

  list() { return this.memoryService.listMemories(); }
  setDefault(id: string) { this.memoryService.setDefaultMemory(id); }
}
```

| Méthode | Retour | Description |
|---------|--------|-------------|
| `registerMemory(config)` | `void` | Enregistre une mémoire personnalisée. |
| `registerMemories(configs)` | `void` | Enregistre plusieurs mémoires. |
| `setDefaultMemory(id)` | `void` | Définit la mémoire par défaut. |
| `resolve(id?)` | `IMemoryAdapter` | Résout une mémoire par id (ou défaut). |
| `getCheckpointer(id?)` | `unknown` | Retourne le checkpointer LangGraph de la mémoire. |
| `listMemories()` | `Array<{ id, isDefault }>` | Liste les mémoires enregistrées. |

---

### AgentService

Registre d'objets `Agent`. Délègue l'exécution à chaque `Agent` via la factory.

```typescript
@Injectable()
export class ChatService {
  constructor(private readonly agentService: AgentService) {}

  async setup() {
    const agent = await this.agentService.registerAgent({
      id: 'chat-agent',
      modelId: 'gpt4o',
      systemPrompt: 'Tu es un assistant.',
    });

    // Via le service (par id)
    const r1 = await this.agentService.run('chat-agent', { input: 'Bonjour' });
    // Ou directement via l'objet
    const r2 = await agent.run({ input: 'Bonjour' });
  }
}
```

| Méthode | Retour | Description |
|---------|--------|-------------|
| `registerAgent(config, opts?)` | `Promise<Agent>` | Construit et enregistre un `Agent`. Retourne l'objet. |
| `registerAgents(configs, opts?)` | `Promise<Agent[]>` | Enregistre plusieurs agents en lot. |
| `resolve(idOrAgent)` | `Agent` | Résout depuis le registre. Lève une erreur si absent. |
| `run(idOrAgent, opts)` | `Promise<IAgentResult>` | Délègue à `agent.run()`. |
| `stream(idOrAgent, opts)` | `AsyncIterable<IAgentStreamEvent>` | Délègue à `agent.stream()`. |
| `resumeAfterInterrupt(idOrAgent, threadId, input?)` | `Promise<IAgentResult>` | Délègue à `agent.resumeAfterInterrupt()`. |
| `listAgents()` | `Agent[]` | Liste tous les agents enregistrés. |

---

### AgentGraphService

Registre d'objets `AgentGraph`. Délègue l'exécution à chaque `AgentGraph` via la factory.

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
    const r2 = await graph.run('input...'); // même résultat
  }
}
```

| Méthode | Retour | Description |
|---------|--------|-------------|
| `buildGraph(def)` | `Promise<AgentGraph>` | Compile et enregistre un `AgentGraph`. Retourne l'objet. |
| `buildGraphs(defs)` | `Promise<AgentGraph[]>` | Compile plusieurs graphes en lot. |
| `resolve(id)` | `AgentGraph` | Résout depuis le registre. Lève une erreur si absent. |
| `run(id, input, threadId?)` | `Promise<IGraphRunResult>` | Délègue à `agentGraph.run()`. |
| `stream(id, input, threadId?)` | `AsyncIterable<unknown>` | Délègue à `agentGraph.stream()`. |
| `listGraphs()` | `AgentGraph[]` | Liste tous les graphes enregistrés. |

---

### SubAgentService

Compile des sous-agents délégables à un agent parent.

```typescript
@Injectable()
export class OrchestrationService {
  constructor(private readonly subAgentService: SubAgentService) {}

  buildSubAgents() {
    return this.subAgentService.compileSubAgents([
      { name: 'researcher', description: 'Recherche des informations.', modelId: 'gpt4o' },
      { name: 'writer',     description: 'Rédige des contenus.',        systemPrompt: 'Tu es rédacteur.' },
    ]);
  }
}
```

| Méthode | Retour | Description |
|---------|--------|-------------|
| `compileSubAgent(spec)` | `ICompiledSubAgent` | Compile un `ISubAgentSpec` (mis en cache). |
| `compileSubAgents(specs)` | `ICompiledSubAgent[]` | Compile plusieurs specs en lot. |
| `listSubAgents()` | `ICompiledSubAgent[]` | Liste tous les sous-agents compilés. |

---

### HitlService

Gère le **Human-in-the-Loop** — interruption pour validation humaine, via `EventEmitter`.

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { HitlService, IInterruptPayload } from 'ai-kit';

@Injectable()
export class HitlGateway implements OnModuleInit {
  constructor(private readonly hitlService: HitlService) {}

  onModuleInit() {
    this.hitlService.on('interrupt', async (payload: IInterruptPayload) => {
      console.log(`Outil : ${payload.toolName}`, payload.toolInput);
      payload.resolve({ threadId: payload.threadId, action: 'approve' });
    });
  }
}
```

| Méthode | Description |
|---------|-------------|
| `resume(threadId, toolName, decision)` | Résout une interruption en attente. |
| `hasPendingInterrupt(threadId)` | Vérifie si une interruption est en attente. |
| `on('interrupt', handler)` | Écoute les événements d'interruption (hérité de `EventEmitter`). |

`IInterruptDecision.action` :

| Valeur | Description |
|--------|-------------|
| `'approve'` | Continuer l'exécution normalement. |
| `'reject'` | Annuler l'appel à l'outil. |
| `'edit'` | Modifier les paramètres avant de continuer (via `updatedInput`). |

---

### AcpService

Démarre un serveur **ACP (Agent Communication Protocol)** pour exposer les agents à des clients externes.

```typescript
AiKitModule.forRoot({
  models: [{ id: 'default', provider: 'openai', modelName: 'gpt-4o' }],
  acp: {
    port: 9000,
    agents: [
      {
        name: 'assistant',
        description: 'Assistant général.',
        modelId: 'default',
        mcpServerIds: ['filesystem'],
      },
    ],
    authMethods: [
      {
        id: 'openai-key',
        name: 'OpenAI API Key',
        type: 'env_var',
        vars: [{ name: 'OPENAI_API_KEY', label: 'Clé API OpenAI', secret: true }],
      },
    ],
  },
})
```

---

### AiKitConfiguratorService

Façade unique pour configurer dynamiquement l'ensemble du module après bootstrap.

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

| Méthode | Retour | Description |
|---------|--------|-------------|
| `configure(options)` | `Promise<void>` | Applique une configuration additive (`models`, `mcpServers`, `agents`, `graphs`, `acp`). |

---

## Interfaces

### `IModelConfig`

```typescript
interface IModelConfig {
  id: string;
  provider: 'openai' | 'ollama' | 'anthropic' | 'azure-openai';
  modelName: string;        // ex: 'gpt-4o', 'llama3'
  temperature?: number;     // 0–2, défaut: 0
  apiKey?: string;
  baseUrl?: string;         // Pour Ollama, Azure…
  extra?: Record<string, unknown>;
}
```

### `IAgentConfig`

```typescript
interface IAgentConfig {
  id: string;
  modelId?: string;                         // Défaut: premier modèle configuré
  systemPrompt?: string;
  mcpServerIds?: string[];
  memoryId?: string;                        // Mémoire spécifique (sinon défaut)
  subAgents?: ISubAgentSpec[];
  hitl?: IHumanInTheLoopConfig;
  responseFormat?: Record<string, unknown>; // Schema JSON pour réponse structurée
  extra?: Record<string, unknown>;
}
```

### `IAgentGraph`

```typescript
interface IAgentGraph {
  id: string;
  memoryId?: string;
  nodes: IGraphNodeDef[];      // Nœuds (chacun référence un agentId)
  edges: IGraphEdgeDef[];      // Arêtes (conditionnelles ou inconditionnelles)
  entryNodeId: string;
  exitNodeId?: string;         // END implicite si absent
}

interface IGraphNodeDef {
  id: string;
  agentId: string;
  systemPrompt?: string;       // Surcharge le systemPrompt de l'agent
}

interface IGraphEdgeDef {
  from: string;
  to: string;
  condition?: string;          // Propriété de l'état à évaluer
  conditionValue?: unknown;
}
```

### `IMcpServerConfig`

```typescript
// Processus local (stdio)
type IMcpStdioServerConfig = {
  id: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

// Serveur distant (SSE / HTTP)
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
  tool: StructuredTool;  // Outil LangChain implémenté
}
```

### `IMemoryAdapter` / `IMemoryConfig`

```typescript
interface IMemoryAdapter {
  getCheckpointer(): unknown;
}

interface IMemoryConfig {
  id: string;
  adapter: IMemoryAdapter;
  isDefault?: boolean;
}
```

### `IAgentRunOptions`

```typescript
interface IAgentRunOptions {
  input: string | Record<string, unknown>;
  threadId?: string;                        // Mémoire de conversation + reprise HITL
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
  graphId?: string;       // Pour sous-agents distants (LangGraph Cloud)
  remoteUrl?: string;
}
```

---

## Outils de sécurité LLM

`ai-kit` inclut une collection d'**outils de sécurité prêts à l'emploi** (presets), conçus pour protéger les entrées et sorties des LLM. Ces outils s'intègrent nativement dans les agents via `McpService` : ils sont automatiquement disponibles pour tous les agents qui ont accès aux outils.

### Presets disponibles

| Preset | ID | Description |
|--------|-----|-------------|
| `prompt-injection-guard` | `string` | Détecte les tentatives de prompt injection et jailbreak dans un texte. |
| `pii-redactor` | `string` | Masque les données personnelles (email, téléphone, IBAN, carte bancaire). |
| `content-policy-guard` | `string` | Vérifie un texte contre une liste de termes interdits. |

### Enregistrement dans forRoot

```typescript
import { AiKitModule } from 'ai-kit';

AiKitModule.forRoot({
  models: [{ id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o' }],
  securityTools: [
    { id: 'injection-guard', preset: 'prompt-injection-guard' },
    { id: 'pii-cleaner',     preset: 'pii-redactor' },
    { id: 'policy-check',    preset: 'content-policy-guard' },
  ],
})
```

### Enregistrement dans forFeature

```typescript
// security.module.ts
import { Module } from '@nestjs/common';
import { AiKitModule } from 'ai-kit';

@Module({
  imports: [
    AiKitModule.forFeature({
      securityTools: [
        {
          id: 'injection-guard',
          preset: 'prompt-injection-guard',
          name: 'check_injection',           // Nom exposé au LLM (optionnel)
          description: 'Analyse une entrée utilisateur pour détecter du prompt injection.',
          promptInjection: {
            blockedPatterns: ['ignore instructions', 'jailbreak', 'bypass'],
          },
        },
        {
          id: 'pii-cleaner',
          preset: 'pii-redactor',
          piiRedactor: {
            replacement: '***',
            redactEmails: true,
            redactPhones: true,
            redactIban: false,       // Désactiver la détection IBAN
            redactCreditCards: true,
          },
        },
        {
          id: 'policy-check',
          preset: 'content-policy-guard',
          contentPolicy: {
            blockedTerms: ['violence', 'haine', 'malware', 'bomb'],
          },
        },
      ],
    }),
  ],
})
export class SecurityModule {}
```

### Configuration runtime

Les outils de sécurité peuvent aussi être ajoutés dynamiquement après bootstrap :

```typescript
import { Injectable } from '@nestjs/common';
import { AiKitConfiguratorService } from 'ai-kit';

@Injectable()
export class SecuritySetupService {
  constructor(private readonly configurator: AiKitConfiguratorService) {}

  async enableGuardrails() {
    await this.configurator.configure({
      securityTools: [
        { id: 'injection-guard', preset: 'prompt-injection-guard' },
        { id: 'pii-cleaner',     preset: 'pii-redactor' },
      ],
    });
  }
}
```

### Injection directe

Chaque outil de sécurité déclaré dans `forFeature()` est injectable via `@InjectSecurityTool(id)` :

```typescript
import { Injectable } from '@nestjs/common';
import { InjectSecurityTool } from 'ai-kit';
import { StructuredTool } from '@langchain/core/tools';

@Injectable()
export class ContentService {
  constructor(
    @InjectSecurityTool('injection-guard') private readonly injectionGuard: StructuredTool,
    @InjectSecurityTool('pii-cleaner')     private readonly piiCleaner: StructuredTool,
    @InjectSecurityTool('policy-check')    private readonly policyCheck: StructuredTool,
  ) {}

  async validateInput(userInput: string) {
    const guardResult  = JSON.parse(await this.injectionGuard.invoke({ text: userInput }));
    const policyResult = JSON.parse(await this.policyCheck.invoke({ text: userInput }));

    return {
      safe: guardResult.verdict === 'safe' && policyResult.verdict === 'allowed',
      injectionMatches: guardResult.matches,
      policyMatches: policyResult.matches,
    };
  }

  async sanitizeOutput(llmOutput: string) {
    const result = JSON.parse(await this.piiCleaner.invoke({ text: llmOutput }));
    return result.redactedText;
  }
}
```

### Appel programmatique

Vous pouvez aussi utiliser `SecurityToolService` directement :

```typescript
import { Injectable } from '@nestjs/common';
import { SecurityToolService } from 'ai-kit';

@Injectable()
export class InputPipelineService {
  constructor(private readonly securityToolService: SecurityToolService) {}

  listGuardrails() {
    return this.securityToolService.listTools();
    // [{ id, preset, name, description }, ...]
  }

  async checkAndRedact(text: string) {
    const guard  = this.securityToolService.getTool('injection-guard');
    const redact = this.securityToolService.getTool('pii-cleaner');

    const { verdict, matches } = JSON.parse(await guard.invoke({ text }));
    if (verdict === 'unsafe') {
      throw new Error(`Prompt injection détecté : ${matches.join(', ')}`);
    }

    const { redactedText } = JSON.parse(await redact.invoke({ text }));
    return redactedText;
  }
}
```

### SecurityToolService

| Méthode | Retour | Description |
|---------|--------|-------------|
| `registerTool(config)` | `StructuredTool` | Compile et enregistre un outil de sécurité. L'expose aussi dans `McpService`. |
| `registerTools(configs)` | `void` | Enregistre plusieurs outils en lot. |
| `getTool(id)` | `StructuredTool` | Retourne l'outil pour l'ID donné. Lève `[AiKit]` si absent. |
| `listTools()` | `ISecurityToolDescriptor[]` | Liste tous les outils de sécurité enregistrés. |

### Interfaces de sécurité

```typescript
type SecurityToolPreset = 'prompt-injection-guard' | 'pii-redactor' | 'content-policy-guard';

interface ISecurityToolConfig {
  id: string;
  preset: SecurityToolPreset;
  name?: string;              // Nom exposé au LLM (sinon: id)
  description?: string;       // Description exposée au LLM (sinon: description par défaut du preset)

  // Options du preset 'prompt-injection-guard'
  promptInjection?: {
    blockedPatterns?: string[]; // Remplace les patterns par défaut
  };

  // Options du preset 'pii-redactor'
  piiRedactor?: {
    replacement?: string;     // Texte de remplacement (défaut: '[REDACTED]')
    redactEmails?: boolean;   // défaut: true
    redactPhones?: boolean;   // défaut: true
    redactIban?: boolean;     // défaut: true
    redactCreditCards?: boolean; // défaut: true
  };

  // Options du preset 'content-policy-guard'
  contentPolicy?: {
    blockedTerms?: string[];  // Remplace les termes interdits par défaut
  };
}

interface ISecurityToolDescriptor {
  id: string;
  preset: SecurityToolPreset;
  name: string;
  description: string;
}
```

---

## Tokens d'injection

Pour injecter les services avec `@Inject()` :

```typescript
import { Inject } from '@nestjs/common';
import { AI_KIT_AGENT_SERVICE, AgentService } from 'ai-kit';

constructor(
  @Inject(AI_KIT_AGENT_SERVICE) private readonly agentService: AgentService,
) {}
```

| Token | Type injecté |
|-------|-------------|
| `AI_KIT_OPTIONS` | `AiKitModuleOptions` |
| `AI_KIT_MODEL_SERVICE` | `ModelService` |
| `AI_KIT_MCP_SERVICE` | `McpService` |
| `AI_KIT_SECURITY_TOOL_SERVICE` | `SecurityToolService` |
| `AI_KIT_MEMORY_SERVICE` | `MemoryService` |
| `AI_KIT_AGENT_SERVICE` | `AgentService` |
| `AI_KIT_AGENT_GRAPH_SERVICE` | `AgentGraphService` |
| `AI_KIT_SUB_AGENT_SERVICE` | `SubAgentService` |
| `AI_KIT_HITL_SERVICE` | `HitlService` |
| `AI_KIT_ACP_SERVICE` | `AcpService` |
| `AI_KIT_FEATURE_OPTIONS` | `AiKitFeatureOptions` |
| `@InjectAgent(id)` | `Agent` (via `forFeature` ou `forRoot`) |
| `@InjectAgentGraph(id)` | `AgentGraph` (via `forFeature` ou `forRoot`) |
| `@InjectTool(id)` | `StructuredTool` (via `forFeature` ou `forRoot`) |
| `@InjectMemory(id)` | `IMemoryAdapter` (via `forFeature` ou `forRoot`) |
| `getAgentToken(id)` | Retourne le token string pour `Agent` |
| `getAgentGraphToken(id)` | Retourne le token string pour `AgentGraph` |
| `getToolToken(id)` | Retourne le token string pour `StructuredTool` |
| `getSecurityToolToken(id)` | Retourne le token string pour un outil de sécurité `StructuredTool` |
| `getMemoryToken(id)` | Retourne le token string pour `IMemoryAdapter` |

---

## Exemples avancés

### Agent avec sous-agents et HITL

```typescript
AiKitModule.forRoot({
  models: [{ id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o' }],
  agents: [
    {
      id: 'orchestrator',
      modelId: 'gpt4o',
      systemPrompt: 'Tu orchestres des tâches complexes.',
      subAgents: [
        { name: 'researcher', description: 'Effectue des recherches.', modelId: 'gpt4o' },
      ],
      hitl: {
        interruptOn: {
          delete_file: true,
          write_file: { enabled: true, prompt: 'Confirmer la modification ?' },
        },
      },
    },
  ],
})
```

### Module fonctionnel avec injection directe

```typescript
// chat.module.ts
@Module({
  imports: [
    AiKitModule.forFeature({
      agents: [
        { id: 'chat-agent',    modelId: 'gpt4o', systemPrompt: 'Tu es un assistant.' },
        { id: 'summary-agent', modelId: 'gpt4o', systemPrompt: 'Tu résumes en 3 points.' },
      ],
      graphs: [
        {
          id: 'chat-pipeline',
          entryNodeId: 'chat',
          nodes: [
            { id: 'chat',    agentId: 'chat-agent' },
            { id: 'summary', agentId: 'summary-agent' },
          ],
          edges: [{ from: 'chat', to: 'summary' }],
        },
      ],
    }),
  ],
  providers: [ChatService],
})
export class ChatModule {}

// chat.service.ts
@Injectable()
export class ChatService {
  constructor(
    @InjectAgent('chat-agent')          private readonly chatAgent: Agent,
    @InjectAgentGraph('chat-pipeline')  private readonly pipeline: AgentGraph,
  ) {}

  ask(message: string)         { return this.chatAgent.run({ input: message }); }
  runPipeline(message: string) { return this.pipeline.run(message); }
}
```

### Outils personnalisés

```typescript
import { tool } from '@langchain/core/tools';
import { AiKitModule, InjectTool } from 'ai-kit';
import { StructuredTool } from '@langchain/core/tools';

// Définir un outil personnalisé
const searchTool = tool(
  async ({ query }: { query: string }) => {
    // Implémentation
    return `Résultats pour: ${query}`;
  },
  {
    name: 'search',
    description: 'Effectue une recherche.',
    schema: z.object({
      query: z.string().describe('Requête de recherche'),
    }),
  },
);

// Enregistrer dans forRoot
AiKitModule.forRoot({
  models: [{ id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o' }],
  tools: [
    { id: 'search', tool: searchTool },
  ],
})

// Ou dans forFeature
AiKitModule.forFeature({
  agents: [{ id: 'search-agent', modelId: 'gpt4o', mcpServerIds: [] }],
  tools: [
    { id: 'search', tool: searchTool },
  ],
})

// Injection dans un service
@Injectable()
export class SearchService {
  constructor(
    @InjectTool('search') private readonly searchTool: StructuredTool,
  ) {}

  async search(query: string) {
    return this.searchTool.invoke({ query });
  }
}
```

### Agent Ollama (self-hosted)

```typescript
AiKitModule.forRoot({
  models: [
    {
      id: 'local-llama',
      provider: 'ollama',
      modelName: 'llama3',
      baseUrl: 'http://localhost:11434',
    },
  ],
})
```

### Graphe conditionnel

```typescript
{
  id: 'triage-pipeline',
  entryNodeId: 'triage',
  nodes: [
    { id: 'triage',   agentId: 'triage-agent' },
    { id: 'escalate', agentId: 'escalation-agent' },
    { id: 'resolve',  agentId: 'resolution-agent' },
  ],
  edges: [
    { from: 'triage', to: 'escalate', condition: 'needsEscalation', conditionValue: true },
    { from: 'triage', to: 'resolve' },
  ],
}
```

---

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Clé API OpenAI (peut aussi être passée dans `IModelConfig.apiKey`) |
| `ANTHROPIC_API_KEY` | Clé API Anthropic |
| `AZURE_OPENAI_API_KEY` | Clé API Azure OpenAI |
| `LANGCHAIN_TRACING_V2` | `true` pour activer le tracing LangSmith |
| `LANGCHAIN_API_KEY` | Clé API LangSmith |
| `LANGCHAIN_PROJECT` | Nom du projet LangSmith |

---

## Licence

MIT — © Romuald Mocq / Plume Labs
