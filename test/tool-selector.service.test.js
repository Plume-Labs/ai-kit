const assert = require("node:assert/strict");

const {
  ToolSelectorService,
} = require("../dist/services/tool-selector.service.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Crée un faux StructuredTool avec le nom et la description fournis.
 */
function makeTool(name, description) {
  return { name, description };
}

/**
 * Crée un faux modèle d'embedding qui retourne un vecteur prédéfini
 * pour chaque texte enregistré.
 */
function makeEmbeddings(vectorMap) {
  return {
    embedQuery: async (text) => {
      for (const [key, vec] of Object.entries(vectorMap)) {
        if (text.includes(key)) return vec;
      }
      // Vecteur nul si aucune correspondance
      return new Array(4).fill(0);
    },
  };
}

/**
 * Instancie ToolSelectorService avec les options fournies.
 */
function makeSvc(options = {}) {
  return new ToolSelectorService(options);
}

// ─── Bypass : sélection désactivée ───────────────────────────────────────────

test("retourne tous les outils si enabled=false", async () => {
  const tools = [makeTool("a", "desc a"), makeTool("b", "desc b")];
  const svc = makeSvc({ embeddingsModel: makeEmbeddings({}) });

  const result = await svc.selectRelevantTools("query", tools, { enabled: false });

  assert.deepEqual(result, tools);
});

test("retourne tous les outils si config absente", async () => {
  const tools = [makeTool("a", "desc a")];
  const svc = makeSvc({ embeddingsModel: makeEmbeddings({}) });

  const result = await svc.selectRelevantTools("query", tools);

  assert.deepEqual(result, tools);
});

// ─── Bypass : pas de modèle d'embedding ──────────────────────────────────────

test("retourne tous les outils si aucun modèle d'embedding configuré", async () => {
  // 10 outils > BYPASS_TOOL_COUNT=5
  const tools = Array.from({ length: 10 }, (_, i) => makeTool(`tool${i}`, `desc ${i}`));
  const svc = makeSvc({}); // pas d'embeddingsModel

  const result = await svc.selectRelevantTools("query", tools, { enabled: true });

  assert.deepEqual(result, tools);
});

// ─── Bypass : liste d'outils trop courte ─────────────────────────────────────

test("retourne tous les outils si la liste est <= BYPASS_TOOL_COUNT (5)", async () => {
  const tools = Array.from({ length: 5 }, (_, i) => makeTool(`t${i}`, `d ${i}`));
  const svc = makeSvc({ embeddingsModel: makeEmbeddings({}) });

  const result = await svc.selectRelevantTools("query", tools, { enabled: true });

  assert.deepEqual(result, tools);
});

test("sélectionne si la liste dépasse BYPASS_TOOL_COUNT (6 outils)", async () => {
  // Vecteurs orthogonaux pour contrôler précisément les scores
  const vectors = {
    "db:":   [1, 0, 0, 0],  // outil le plus pertinent pour le prompt
    "fs:":   [0, 1, 0, 0],
    "http:": [0, 0, 1, 0],
    "mail:": [0, 0, 0, 1],
    "queue:": [0.5, 0.5, 0, 0],
    "cache:": [0, 0, 0.5, 0.5],
    // prompt
    "find user": [1, 0, 0, 0], // aligné sur "db:"
  };
  const embeddings = makeEmbeddings(vectors);
  const svc = makeSvc({ embeddingsModel: embeddings });

  const tools = [
    makeTool("db", "db: database operations"),
    makeTool("fs", "fs: file system operations"),
    makeTool("http", "http: http requests"),
    makeTool("mail", "mail: email sending"),
    makeTool("queue", "queue: message queue"),
    makeTool("cache", "cache: cache management"),
  ];

  const result = await svc.selectRelevantTools("find user in database", tools, {
    enabled: true,
    topK: 2,
  });

  assert.equal(result.length, 2);
  // Le premier outil doit être "db" (vecteur aligné avec le prompt)
  assert.equal(result[0].name, "db");
});

// ─── Sélection correcte des topK outils ──────────────────────────────────────

test("retourne exactement topK outils triés par score décroissant", async () => {
  // 3 vecteurs distincts — le prompt est aligné sur "alpha"
  const embeddings = {
    embedQuery: async (text) => {
      if (text.includes("alpha")) return [1, 0, 0];
      if (text.includes("beta"))  return [0, 1, 0];
      if (text.includes("gamma")) return [0, 0, 1];
      if (text.includes("delta")) return [0.1, 0.1, 0.1]; // faible
      if (text.includes("epsilon")) return [0.05, 0.05, 0.05]; // encore plus faible
      if (text.includes("prompt")) return [1, 0, 0]; // aligné sur alpha
      return [0, 0, 0];
    },
  };
  const svc = makeSvc({ embeddingsModel: embeddings });

  const tools = [
    makeTool("alpha-tool", "alpha: best match"),
    makeTool("beta-tool",  "beta: second best"),
    makeTool("gamma-tool", "gamma: third"),
    makeTool("delta-tool", "delta: weak"),
    makeTool("epsilon-tool", "epsilon: weakest"),
    makeTool("extra", "extra: padding"),
  ];

  const result = await svc.selectRelevantTools("alpha prompt", tools, {
    enabled: true,
    topK: 3,
  });

  assert.equal(result.length, 3);
  assert.equal(result[0].name, "alpha-tool");
});

// ─── Seuil de similarité (minSimilarity) ─────────────────────────────────────

test("exclut les outils dont le score est inférieur à minSimilarity", async () => {
  const embeddings = {
    embedQuery: async (text) => {
      if (text.includes("database")) return [1, 0];
      if (text.includes("emailer"))  return [0, 1];
      if (text.includes("query"))    return [1, 0]; // aligné sur "database"
      // outils de rembourrage
      return [0.3, 0.3];
    },
  };
  const svc = makeSvc({ embeddingsModel: embeddings });

  const tools = [
    makeTool("db",   "database: query and manage data"),
    makeTool("mail", "emailer: send emails"),
    // 4 outils de rembourrage pour dépasser BYPASS_TOOL_COUNT
    makeTool("pad1", "pad1: padding tool one"),
    makeTool("pad2", "pad2: padding tool two"),
    makeTool("pad3", "pad3: padding tool three"),
    makeTool("pad4", "pad4: padding tool four"),
  ];

  const result = await svc.selectRelevantTools("user query in database", tools, {
    enabled: true,
    topK: 10,
    minSimilarity: 0.9, // seuil élevé — seul "db" doit passer
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].name, "db");
});

// ─── Cache des embeddings d'outils ───────────────────────────────────────────

test("met en cache les embeddings d'outils (un seul appel par texte unique)", async () => {
  let callCount = 0;
  const embeddings = {
    embedQuery: async (text) => {
      callCount++;
      return [1, 0, 0, 0];
    },
  };
  const svc = makeSvc({ embeddingsModel: embeddings });

  const tools = Array.from({ length: 6 }, (_, i) => makeTool(`t${i}`, `desc ${i}`));

  // Premier appel : calcule les embeddings de tous les outils + le prompt
  await svc.selectRelevantTools("query", tools, { enabled: true });
  const firstCallCount = callCount;

  // Deuxième appel avec le même prompt et les mêmes outils :
  // le prompt est toujours recalculé mais les outils sont mis en cache
  await svc.selectRelevantTools("query", tools, { enabled: true });
  const secondCallCount = callCount - firstCallCount;

  // Seul le prompt devrait être recalculé (1 appel), les outils proviennent du cache
  assert.equal(secondCallCount, 1);
});

test("invalide le cache et recalcule les embeddings d'outils après invalidation", async () => {
  let toolCallCount = 0;
  const embeddings = {
    embedQuery: async (text) => {
      if (!text.includes("query")) toolCallCount++;
      return [1, 0, 0, 0];
    },
  };
  const svc = makeSvc({ embeddingsModel: embeddings });

  const tools = Array.from({ length: 6 }, (_, i) => makeTool(`t${i}`, `desc ${i}`));

  await svc.selectRelevantTools("query", tools, { enabled: true });
  const afterFirstCall = toolCallCount;

  svc.invalidateToolEmbeddingsCache();

  await svc.selectRelevantTools("query", tools, { enabled: true });
  const afterSecondCall = toolCallCount;

  // Après invalidation, les embeddings des outils doivent être recalculés
  assert.equal(afterSecondCall - afterFirstCall, afterFirstCall);
});

// ─── Avertissement unique (warn-once) ────────────────────────────────────────

test("émet l'avertissement 'embeddingsModel manquant' une seule fois", async () => {
  const tools = Array.from({ length: 10 }, (_, i) => makeTool(`t${i}`, `d${i}`));
  const svc = makeSvc({}); // pas d'embeddingsModel

  let warnCount = 0;
  const origWarn = svc.logger?.warn?.bind(svc.logger);
  // Intercepte les appels warn sur l'instance du logger NestJS
  Object.defineProperty(svc, "logger", {
    value: {
      warn: () => { warnCount++; },
      debug: () => {},
      error: () => {},
      log: () => {},
    },
    writable: true,
  });

  await svc.selectRelevantTools("query", tools, { enabled: true });
  await svc.selectRelevantTools("query", tools, { enabled: true });
  await svc.selectRelevantTools("query", tools, { enabled: true });

  assert.equal(warnCount, 1);
});

// ─── Validation des paramètres ────────────────────────────────────────────────

test("topK <= 0 est ramené à 1 (retourne au moins 1 outil)", async () => {
  const embeddings = {
    embedQuery: async () => [1, 0],
  };
  const svc = makeSvc({ embeddingsModel: embeddings });
  const tools = Array.from({ length: 6 }, (_, i) => makeTool(`t${i}`, `d${i}`));

  const result = await svc.selectRelevantTools("query", tools, { enabled: true, topK: 0 });

  assert.equal(result.length, 1);
});

test("minSimilarity négatif est ramené à 0 (pas de filtrage abusif)", async () => {
  const embeddings = {
    embedQuery: async () => [1, 0],
  };
  const svc = makeSvc({ embeddingsModel: embeddings });
  const tools = Array.from({ length: 6 }, (_, i) => makeTool(`t${i}`, `d${i}`));

  // minSimilarity < 0 ne devrait pas exclure les outils
  const result = await svc.selectRelevantTools("query", tools, {
    enabled: true,
    topK: 10,
    minSimilarity: -5,
  });

  assert.equal(result.length, tools.length);
});

test("minSimilarity > 1 est ramené à 1 (exclut tous les outils)", async () => {
  const embeddings = {
    embedQuery: async () => [1, 0],
  };
  const svc = makeSvc({ embeddingsModel: embeddings });
  const tools = Array.from({ length: 6 }, (_, i) => makeTool(`t${i}`, `d${i}`));

  // minSimilarity > 1 ne devrait jamais retourner d'outils sauf score == 1
  const result = await svc.selectRelevantTools("query", tools, {
    enabled: true,
    topK: 10,
    minSimilarity: 2,
  });

  // Tous les vecteurs sont [1,0], le prompt est [1,0] → similarité cosinus = 1
  // Après clamp à 1.0, tous les outils passent le seuil
  assert.equal(result.length, tools.length);
});

// ─── Fail-open sur erreur d'embedding ────────────────────────────────────────

test("retourne tous les outils si embedQuery lève une erreur (fail-open)", async () => {
  const embeddings = {
    embedQuery: async () => {
      throw new Error("API embedding indisponible");
    },
  };
  const svc = makeSvc({ embeddingsModel: embeddings });
  const tools = Array.from({ length: 10 }, (_, i) => makeTool(`t${i}`, `d${i}`));

  // Ne doit pas propager l'erreur
  const result = await svc.selectRelevantTools("query", tools, { enabled: true });

  assert.deepEqual(result, tools);
});
