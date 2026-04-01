# Phase 2: Client Adapters Layer

## Objetivo

Extraer lógica específica de cliente (Claude, Cursor) de hooks legacy en adapters reutilizables que consuman la capa compartida de orchestration, con métricas comparativas por cliente.

## Cambios Implementados

### Adapters Nuevos

1. **`tools/devctx/src/orchestration/adapters/claude-adapter.js`** (426 líneas)
   - Adapter fino sobre base-orchestrator para hooks de Claude
   - Eventos: `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`
   - Tracking de estado de turno en SQLite: `maybeTrackTurn`
   - Enforcement de checkpoint en Stop: `computeStopEnforcement`
   - Auto-append de carryover cuando Stop hook activo
   - Inyección de dependencias completa para testing
   - Métricas estandarizadas: `client`, `adapterClient`, `managedByClientAdapter`, `autoStartTriggered`, `autoCheckpointTriggered`, `overheadTokens`

2. **`tools/devctx/src/orchestration/adapters/cursor-adapter.js`** (429 líneas)
   - Adapter simétrico para hooks de Cursor
   - Eventos: `ConversationStart`, `UserMessageSubmit`, `PostToolUse`, `ConversationEnd`
   - Mismo patrón de tracking y enforcement que Claude
   - Write tools específicos de Cursor: `StrReplace`, `Delete`, `EditNotebook`
   - Campos de entrada adaptados: `conversation_id`, `user_message`, `end_hook_active`
   - Métricas estandarizadas idénticas a Claude para comparabilidad

### Refactorizaciones

1. **`tools/devctx/src/hooks/claude-hooks.js`**
   - Reducido a 1 línea: re-export de `handleClaudeHookEvent`
   - Mantiene backward compatibility

2. **`tools/devctx/src/hooks/cursor-hooks.js`** (nuevo)
   - Puente compatible: re-export de `handleCursorHookEvent`

3. **`tools/devctx/src/analytics/product-quality.js`**
   - Añadida función `analyzeClientAdapterQuality`
   - Agregación por cliente: `clientAdapters.byClient[]`
   - Métricas por cliente:
     - `entriesMeasured`
     - `adapterEvents`, `wrapperEvents`, `taskRunnerEvents`
     - `baseOrchestratedEvents`
     - `autoStartedEvents`, `autoPreflightedEvents`, `autoCheckpointedEvents`
     - `blockedEvents`
     - `contextOverheadTokens`, `averageContextOverheadTokens`
     - Coverage %: `adapterCoveragePct`, `baseOrchestratorCoveragePct`, `autoStartCoveragePct`, etc.

### Tests Añadidos

1. **`tools/devctx/tests/claude-adapter.test.js`** (187 líneas, 8 tests)
   - Helpers: `isMeaningfulPrompt`, `buildClaudeHookKey`
   - Checkpoint detection: `isCheckpointToolUse`
   - File tracking: `extractTouchedFilesFromToolUse`
   - Enforcement: `computeStopEnforcement`, `buildCarryoverUpdate`
   - Integration: `UserPromptSubmit` con managed start, `Stop` con auto-append

2. **`tools/devctx/tests/cursor-adapter.test.js`** (239 líneas, 9 tests)
   - Misma cobertura que Claude adapter
   - Validación de eventos específicos de Cursor
   - Verificación de write tools de Cursor
   - Integration: `UserMessageSubmit`, `ConversationEnd` con/sin checkpoint

3. **`tools/devctx/tests/smart-metrics.test.js`** (ampliado)
   - Test sintético Claude vs Cursor con métricas comparativas

## Validación

### Tests Unitarios
```
71/71 tests OK (base + policy + claude-adapter + cursor-adapter)
```

### Tests de Integración
```
19/19 tests OK (task-runner + headless-wrapper + claude-hooks)
```

### Total
```
90/90 tests OK
```

## Patrón de Adapter Consolidado

### Estructura Común

```javascript
export const createXAdapter = ({
  startTurn = smartTurn,
  summaryTool = smartSummary,
  resolveStart = resolveManagedStart,
  persistMetric = persistMetrics,
  getMutationSafety = getRepoMutationSafety,
  readHookState = null,
  writeHookState = ({ hookKey, state }) => setHookTurnState({ hookKey, state }),
  removeHookState = ({ hookKey }) => deleteHookTurnState({ hookKey }),
} = {}) => {
  // ... adapter implementation
  return { handleEvent };
};
```

### Eventos por Cliente

| Claude | Cursor | Propósito |
|--------|--------|-----------|
| `SessionStart` | `ConversationStart` | Inicialización de sesión |
| `UserPromptSubmit` | `UserMessageSubmit` | Prompt del usuario → managed start |
| `PostToolUse` | `PostToolUse` | Tracking de writes y checkpoints |
| `Stop` | `ConversationEnd` | Enforcement de checkpoint |

### Campos de Input Adaptados

| Campo | Claude | Cursor |
|-------|--------|--------|
| ID de sesión | `session_id` | `conversation_id` |
| Prompt | `prompt` | `user_message` |
| Hook activo | `stop_hook_active` | `end_hook_active` |
| Último mensaje | `last_assistant_message` | `last_assistant_message` |

### Write Tools por Cliente

| Claude | Cursor |
|--------|--------|
| `Write` | `Write` |
| `Edit` | `StrReplace` |
| `MultiEdit` | `Delete` |
| - | `EditNotebook` |

## Métricas Comparativas

### Metadata Estandarizada

Todos los adapters emiten:
- `client`: identificador del cliente ('claude', 'cursor')
- `adapterClient`: mismo valor que `client`
- `managedByClientAdapter`: `true` para eventos de adapter
- `autoStartTriggered`: `true` en SessionStart/UserPromptSubmit
- `autoCheckpointTriggered`: `true` en Stop/End con auto-append
- `overheadTokens`: tokens de contexto adicional inyectado
- `continuityState`: estado de continuidad del turno

### Agregación en `productQuality.clientAdapters`

```javascript
{
  clientsMeasured: 2,
  entriesMeasured: N,
  totalContextOverheadTokens: N,
  byClient: [
    {
      client: 'claude',
      entriesMeasured: N,
      adapterEvents: N,
      baseOrchestratedEvents: N,
      autoStartedEvents: N,
      autoCheckpointedEvents: N,
      contextOverheadTokens: N,
      averageContextOverheadTokens: N,
      adapterCoveragePct: N,
      autoStartCoveragePct: N,
      // ...
    },
    {
      client: 'cursor',
      // ... misma estructura
    }
  ]
}
```

## Decisiones de Diseño

1. **No duplicar contadores**: `overheadTokens` solo se cuenta desde eventos que lo declaran explícitamente, evitando doble conteo con `task_runner.contextOverheadTokens`

2. **Simetría de adapters**: Claude y Cursor tienen estructura idéntica, solo difieren en nombres de eventos y campos de input

3. **Backward compatibility**: hooks legacy (`claude-hooks.js`) mantienen API pública, solo re-exportan desde adapters

4. **Testabilidad**: inyección de dependencias completa permite tests unitarios sin mock de SQLite

## Siguiente Paso

Con Claude y Cursor implementados, el siguiente paso lógico es:

1. **Validar métricas reales**: ejecutar ambos adapters en producción y comparar overhead
2. **Implementar adapters restantes**: Gemini, Codex, etc. siguiendo el mismo patrón
3. **Optimizar overhead**: si el promedio de `contextOverheadTokens` es alto, ajustar `MAX_CONTEXT_LINES` o `MAX_CONTEXT_CHARS`

## Estado del Árbol

```
Modificados:
- tools/devctx/src/analytics/product-quality.js (métricas por cliente)
- tools/devctx/src/hooks/claude-hooks.js (reducido a re-export)
- tools/devctx/tests/smart-metrics.test.js (test sintético Claude vs Cursor)

Nuevos:
- tools/devctx/src/orchestration/adapters/claude-adapter.js (426 líneas)
- tools/devctx/src/orchestration/adapters/cursor-adapter.js (429 líneas)
- tools/devctx/src/hooks/cursor-hooks.js (1 línea)
- tools/devctx/tests/claude-adapter.test.js (187 líneas, 8 tests)
- tools/devctx/tests/cursor-adapter.test.js (239 líneas, 9 tests)
```

## Cobertura de Tests

- Base orchestrator: 12 tests
- Event policy: 42 tests
- Claude adapter: 8 tests
- Cursor adapter: 9 tests
- **Total unitarios: 71 tests**

- Task runner: 9 tests
- Headless wrapper: 4 tests
- Claude hooks: 6 tests
- **Total integración: 19 tests**

**Gran total: 90/90 tests OK**
