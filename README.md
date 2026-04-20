# ai-kit

**NestJS kit to manage AI workflow**

`ai-kit` est un module NestJS qui simplifie l'intégration de workflows IA dans vos applications. Il abstrait [deepagents](https://www.npmjs.com/package/deepagents), [LangChain](https://js.langchain.com/) et [LangGraph](https://langchain-ai.github.io/langgraphjs/) derrière des interfaces stables, en exposant des services injectables prêts à l'emploi.

---

## Table des matières

- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Configuration du module](#configuration-du-module)
- [Configuration runtime](#configuration-runtime)
- [Services](#services)
  - [ModelService](#modelservice)
  - [McpService](#mcpservice)
  - [AgentService](#agentservice)
  - [AgentGraphService](#agentgraphservice)
  - [SubAgentService](#subagentservice)
  - [HitlService](#hitlservice)
  - [AcpService](#acpservice)
  - [AiKitConfiguratorService](#aikitconfiguratorservice)
- [Interfaces](#interfaces)
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

> Le module est **global** : une fois importé dans `AppModule`, tous les services sont disponibles dans toute l'application sans réimportation.

---

## Configuration du module

`AiKitModuleOptions` accepte les propriétés suivantes :

| Propriété | Type | Description |
|-----------|------|-------------|
| `models` | `IModelConfig[]` | Configurations des providers de modèles. Le premier devient le provider par défaut. |
| `mcpServers` | `IMcpServerConfig[]` | Serveurs MCP à connecter au démarrage. |
| `acp` | `IAcpServerConfig` | Configuration du serveur ACP (Agent Communication Protocol). Optionnel. |
| `agents` | `IAgentConfig[]` | Agents pré-enregistrés au démarrage. |
| `graphs` | `IAgentGraph[]` | Graphes d'agents pré-enregistrés au démarrage. |
| `checkpointer` | `unknown` | Checkpointer LangGraph personnalisé. Par défaut : `InMemorySaver`. |
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

## Configuration runtime

En plus de `AiKitModule.forRoot()` / `forRootAsync()`, vous pouvez modifier la configuration **après bootstrap** avec `AiKitConfiguratorService`.

Cas d'usage typiques :

- enregistrer des agents dynamiquement selon un tenant/projet,
- brancher des serveurs MCP à la volée,
- compiler de nouveaux graphes sans redémarrer l'application,
- démarrer/arrêter ACP dynamiquement.

```typescript
import { Injectable } from '@nestjs/common';
import { AiKitConfiguratorService } from 'ai-kit';

@Injectable()
export class RuntimeSetupService {
  constructor(private readonly aiKitConfigurator: AiKitConfiguratorService) {}

  async setupTenant(tenantId: string) {
    await this.aiKitConfigurator.configure({
      models: [
        {
          id: `openai-${tenantId}`,
          provider: 'openai',
          modelName: 'gpt-4o',
          apiKey: process.env.OPENAI_API_KEY,
        },
      ],
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
          modelId: `openai-${tenantId}`,
          systemPrompt: `Assistant du tenant ${tenantId}`,
          mcpServerIds: [`fs-${tenantId}`],
        },
      ],
    });
  }
}
```

Options runtime (`AiKitRuntimeConfigureOptions`) :

| Propriété | Type | Description |
|-----------|------|-------------|
| `replaceMcpServers` | `boolean` | Si `true`, remplace complètement les serveurs MCP enregistrés avant rechargement. |
| `overwriteAgents` | `boolean` | Si `true`, autorise l'écrasement d'un agent existant. |
| `restartAcp` | `boolean` | Force le redémarrage du serveur ACP lors d'une reconfiguration ACP. |
| `acp` | `IAcpServerConfig \| null` | `null` arrête explicitement le serveur ACP. |

---

## Services

### ModelService

Gère les providers de modèles de langage.

```typescript
import { Injectable } from '@nestjs/common';
import { ModelService } from 'ai-kit';

@Injectable()
export class MyService {
  constructor(private readonly modelService: ModelService) {}

  listModels() {
    return this.modelService.listProviders();
    // [{ id: 'gpt4o', provider: 'openai', modelName: 'gpt-4o' }]
  }

  getDefault() {
    return this.modelService.getModelProvider();
  }

  getSpecific() {
    return this.modelService.getModelProvider('llama');
  }
}
```

**Méthodes :**

| Méthode | Retour | Description |
|---------|--------|-------------|
| `getModelProvider(modelId?)` | `IModelProvider` | Retourne le provider pour l'ID donné (ou le défaut). |
| `listProviders()` | `IModelProvider[]` | Liste tous les providers enregistrés. |

---

### McpService

Gère les connexions aux serveurs [MCP (Model Context Protocol)](https://modelcontextprotocol.io/).

```typescript
import { Injectable } from '@nestjs/common';
import { McpService } from 'ai-kit';

@Injectable()
export class MyService {
  constructor(private readonly mcpService: McpService) {}

  getAvailableTools() {
    return this.mcpService.getTools();
    // [{ name: 'read_file', description: '...', inputSchema: {...} }]
  }
}
```

**Méthodes :**

| Méthode | Retour | Description |
|---------|--------|-------------|
| `getTools()` | `ITool[]` | Retourne tous les outils MCP chargés. |
| `getToolsByServer(serverId)` | `ITool[]` | Retourne les outils filtrés par serveur. |

---

### AgentService

Service principal pour créer et exécuter des agents IA.

```typescript
import { Injectable } from '@nestjs/common';
import { AgentService } from 'ai-kit';

@Injectable()
export class ChatService {
  constructor(private readonly agentService: AgentService) {}

  // Exécution synchrone
  async chat(message: string) {
    const result = await this.agentService.run('assistant', {
      input: message,
      threadId: 'user-123', // optionnel — pour la mémoire de conversation
    });
    return result.output;
  }

  // Exécution en streaming
  async *chatStream(message: string) {
    for await (const event of this.agentService.stream('assistant', { input: message })) {
      if (event.type === 'text') yield event.data;
      if (event.type === 'done') break;
    }
  }

  // Enregistrement dynamique d'un agent
  async createCustomAgent() {
    const agent = await this.agentService.registerAgent({
      id: 'custom-agent',
      modelId: 'gpt4o',
      systemPrompt: 'Tu es un expert en finance.',
      mcpServerIds: ['filesystem'],
    });
    return agent;
  }

  // Reprendre après une interruption HITL
  async resume(threadId: string) {
    return this.agentService.resumeAfterInterrupt('assistant', threadId, {
      confirmed: true,
    });
  }
}
```

**Méthodes :**

| Méthode | Retour | Description |
|---------|--------|-------------|
| `registerAgent(config)` | `Promise<IAgent>` | Enregistre dynamiquement un agent. |
| `run(agentId, opts)` | `Promise<IAgentResult>` | Exécute un agent de façon synchrone. |
| `stream(agentId, opts)` | `AsyncIterable<IAgentStreamEvent>` | Exécute un agent en streaming. |
| `resumeAfterInterrupt(agentId, threadId, input?)` | `Promise<IAgentResult>` | Reprend l'exécution après une pause HITL. |
| `listAgents()` | `IAgent[]` | Liste tous les agents enregistrés. |

---

### AgentGraphService

Orchestre plusieurs agents en graphe orienté (basé sur LangGraph).

```typescript
import { Injectable } from '@nestjs/common';
import { AgentGraphService } from 'ai-kit';

@Injectable()
export class PipelineService {
  constructor(private readonly graphService: AgentGraphService) {}

  async runPipeline(input: string) {
    // Les graphes peuvent être pré-enregistrés via `graphs` dans la config,
    // ou enregistrés dynamiquement :
    const result = await this.graphService.run('my-pipeline', {
      input,
      threadId: 'pipeline-001',
    });
    return result.output;
  }
}
```

---

### SubAgentService

Compile des sous-agents délégables à un agent parent.

```typescript
import { Injectable } from '@nestjs/common';
import { SubAgentService } from 'ai-kit';

@Injectable()
export class OrchestrationService {
  constructor(private readonly subAgentService: SubAgentService) {}

  buildSubAgents() {
    return this.subAgentService.compileSubAgents([
      {
        name: 'researcher',
        description: 'Recherche des informations sur le web.',
        modelId: 'gpt4o',
      },
      {
        name: 'writer',
        description: 'Rédige des contenus structurés.',
        systemPrompt: 'Tu es un rédacteur expert.',
      },
    ]);
  }
}
```

---

### HitlService

Gère le **Human-in-the-Loop** (interruption pour validation humaine).

Lors d'une interruption, l'agent émet un événement `'interrupt'` sur le `HitlService`. L'application hôte écoute cet événement, présente la demande à l'utilisateur, puis appelle `resume()`.

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { HitlService, IInterruptPayload } from 'ai-kit';

@Injectable()
export class HitlGateway implements OnModuleInit {
  constructor(private readonly hitlService: HitlService) {}

  onModuleInit() {
    this.hitlService.on('interrupt', async (payload: IInterruptPayload) => {
      console.log(`Action requise — outil : ${payload.toolName}`);
      console.log('Paramètres :', payload.toolInput);

      // Résoudre automatiquement (à remplacer par une vraie interface utilisateur)
      payload.resolve({
        threadId: payload.threadId,
        action: 'approve',
      });
    });
  }
}
```

**Méthodes :**

| Méthode | Description |
|---------|-------------|
| `resume(threadId, toolName, decision)` | Résout une interruption en attente. |
| `hasPendingInterrupt(threadId)` | Vérifie si une interruption est en attente pour ce thread. |
| `on('interrupt', handler)` | (hérité de EventEmitter) Écoute les événements d'interruption. |

**`IInterruptDecision.action` :**

| Valeur | Description |
|--------|-------------|
| `'approve'` | Continuer l'exécution normalement. |
| `'reject'` | Annuler l'appel à l'outil. |
| `'edit'` | Modifier les paramètres avant de continuer (via `updatedInput`). |

---

### AcpService

Démarre un serveur **ACP (Agent Communication Protocol)** pour exposer les agents à des clients externes (ex. : interfaces chat, IDE plugins).

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

Façade unique pour configurer dynamiquement modèles, outils MCP, agents, graphes et ACP après le démarrage de l'application.

```typescript
import { Injectable } from '@nestjs/common';
import { AiKitConfiguratorService } from 'ai-kit';

@Injectable()
export class BootstrapRuntimeService {
  constructor(private readonly configurator: AiKitConfiguratorService) {}

  async registerRuntimeResources() {
    await this.configurator.configure({
      mcpServers: [
        {
          id: 'docs-server',
          transport: 'sse',
          url: 'http://localhost:8080/sse',
        },
      ],
      agents: [
        {
          id: 'runtime-assistant',
          modelId: 'default',
          mcpServerIds: ['docs-server'],
        },
      ],
    });
  }
}
```

**Méthode :**

| Méthode | Retour | Description |
|---------|--------|-------------|
| `configure(options)` | `Promise<void>` | Applique une configuration additive runtime (`models`, `mcpServers`, `agents`, `graphs`, `acp`). |

---

## Interfaces

### `IModelConfig`

```typescript
interface IModelConfig {
  id: string;                              // Identifiant unique
  provider: 'openai' | 'ollama' | 'anthropic' | 'azure-openai';
  modelName: string;                       // ex: 'gpt-4o', 'llama3'
  temperature?: number;                    // 0–2, défaut: 0
  apiKey?: string;
  baseUrl?: string;                        // Pour Ollama, Azure, etc.
  extra?: Record<string, unknown>;
}
```

### `IAgentConfig`

```typescript
interface IAgentConfig {
  id: string;
  modelId?: string;                        // Défaut: premier modèle configuré
  systemPrompt?: string;
  mcpServerIds?: string[];
  subAgents?: ISubAgentSpec[];
  hitl?: IHumanInTheLoopConfig;
  responseFormat?: Record<string, unknown>; // Schema JSON pour réponse structurée
  extra?: Record<string, unknown>;
}
```

### `IMcpServerConfig`

```typescript
// Stdio (processus local)
type IMcpStdioServerConfig = {
  id: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

// SSE / HTTP (serveur distant)
type IMcpSseServerConfig = {
  id: string;
  transport: 'sse';
  url: string;
  headers?: Record<string, string>;
};
```

### `IAgentRunOptions`

```typescript
interface IAgentRunOptions {
  input: string | Record<string, unknown>;
  threadId?: string;   // Pour la mémoire de conversation et la reprise HITL
  stream?: boolean;
  context?: Record<string, unknown>;
}
```

### `IAgentResult`

```typescript
interface IAgentResult {
  output: string | Record<string, unknown>;
  messages?: IAgentMessage[];
  meta?: Record<string, unknown>;  // { threadId, tokens, ... }
}
```

### `IAgentStreamEvent`

```typescript
interface IAgentStreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'interrupt' | 'done' | 'error';
  data: unknown;
}
```

---

## Tokens d'injection

Pour injecter les services avec `@Inject()` (utile dans les modules non-NestJS) :

```typescript
import { Inject } from '@nestjs/common';
import { AI_KIT_AGENT_SERVICE, AgentService } from 'ai-kit';

constructor(
  @Inject(AI_KIT_AGENT_SERVICE) private readonly agentService: AgentService,
) {}
```

| Token | Service |
|-------|---------|
| `AI_KIT_OPTIONS` | Options brutes du module |
| `AI_KIT_MODEL_SERVICE` | `ModelService` |
| `AI_KIT_MCP_SERVICE` | `McpService` |
| `AI_KIT_AGENT_SERVICE` | `AgentService` |
| `AI_KIT_AGENT_GRAPH_SERVICE` | `AgentGraphService` |
| `AI_KIT_SUB_AGENT_SERVICE` | `SubAgentService` |
| `AI_KIT_HITL_SERVICE` | `HitlService` |
| `AI_KIT_ACP_SERVICE` | `AcpService` |

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
        {
          name: 'researcher',
          description: 'Effectue des recherches.',
          modelId: 'gpt4o',
        },
      ],
      hitl: {
        interruptOn: {
          delete_file: true,              // Interruption systématique
          write_file: { enabled: true, prompt: 'Confirmer la modification ?' },
        },
      },
    },
  ],
})
```

### Graphe d'agents

```typescript
AiKitModule.forRoot({
  agents: [
    { id: 'analyzer', modelId: 'gpt4o', systemPrompt: 'Tu analyses des données.' },
    { id: 'reporter', modelId: 'gpt4o', systemPrompt: 'Tu rédiges des rapports.' },
  ],
  graphs: [
    {
      id: 'analysis-pipeline',
      entryNodeId: 'analyze',
      nodes: [
        { id: 'analyze', agentId: 'analyzer' },
        { id: 'report', agentId: 'reporter' },
      ],
      edges: [
        { from: 'analyze', to: 'report' },
      ],
    },
  ],
})
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
