# Phase 1 Consolidation: Shared Orchestration Layer

## Objetivo

Extraer lógica compartida de orquestación de `task-runner.js` y `headless-wrapper.js` en módulos reutilizables, añadir métricas de automaticidad, y validar con tests unitarios completos.

## Cambios Implementados

### Módulos Nuevos

1. **`tools/devctx/src/orchestration/base-orchestrator.js`** (240 líneas)
   - Ciclo de vida compartido: `resolveManagedStart`, `finalizeManagedRun`
   - Construcción de prompt enriquecido: `buildWrappedPrompt`
   - Aislamiento de sesión automático cuando la continuidad es débil
   - Métricas de overhead de contexto: `computeContextOverhead`
   - Inferencia de eventos: `inferChildEndEvent`

2. **`tools/devctx/src/orchestration/policy/event-policy.js`** (280 líneas)
   - Lógica de preflight: `runWorkflowPreflight`, `buildPreflightTask`
   - Construcción de policy: `buildWorkflowPromptWithPolicy`, `buildContinuityGuidance`
   - Extracción de señales: `extractNextStep`, `extractPreflightTopFiles`, `extractPreflightHints`
   - Métricas de automaticidad: `buildTaskRunnerAutomaticity`
   - Helpers de strings: `normalizeWhitespace`, `truncate`, `uniqueCompact`
   - Constantes exportadas: `MAX_TOP_FILES`, `MAX_PREFLIGHT_HINTS`, etc.

### Refactorizaciones

1. **`tools/devctx/src/task-runner.js`**
   - Eliminadas 265 líneas de lógica duplicada
   - Ahora consume `resolveManagedStart` para arranque compartido
   - Usa `buildWorkflowPromptWithPolicy` para composición de prompts
   - Emite metadata de automaticidad en `task_runner_quality`

2. **`tools/devctx/src/orchestration/headless-wrapper.js`**
   - Eliminadas 225 líneas de lógica duplicada
   - Delegación completa en `base-orchestrator.js`
   - Mantiene solo la ejecución de proceso hijo

3. **`tools/devctx/src/analytics/product-quality.js`**
   - Añadidas métricas de automaticidad:
     - `baseOrchestratorCoveragePct`
     - `autoStartCoveragePct`
     - `autoPreflightCoveragePct`
     - `contextOverheadTokens`
     - `averageContextOverheadTokens`

### Tests Añadidos

1. **`tools/devctx/tests/base-orchestrator.test.js`** (12 tests)
   - `buildWrappedPrompt`: con/sin contexto
   - `resolveManagedStart`: auto-start, isolation, prepared result
   - `computeContextOverhead`: cálculo de overhead
   - `buildChildEndUpdate`: extracción de next step, manejo de errores
   - `inferChildEndEvent`: inferencia de eventos
   - `finalizeManagedRun`: checkpoint con evento inferido

2. **`tools/devctx/tests/event-policy.test.js`** (42 tests)
   - Helpers: `normalizeWhitespace`, `truncate`, `uniqueCompact`
   - Extracción: `extractContextTopFiles`, `extractPreflightTopFiles`, `extractPreflightHints`
   - Policy: `buildPreflightSummary`, `buildPreflightTask`, `buildContinuityGuidance`
   - Workflow: `buildWorkflowPromptWithPolicy`, `buildWorkflowPolicyPayload`
   - Signals: `extractNextStep`, `buildTaskRunnerAutomaticity`
   - Edge cases: validación de entrada, sanitización de tokens, inmutabilidad

## Validación

### Tests Unitarios
```
54/54 tests OK (base-orchestrator + event-policy)
```

### Tests de Integración
```
22/22 tests OK (task-runner + headless-wrapper + smart-metrics)
```

### Reducción de Código
```
-433 líneas de duplicación eliminadas
+520 líneas en módulos compartidos
= -433 + 520 = +87 líneas netas (pero con mejor separación y testabilidad)
```

## Mejoras de Calidad Aplicadas

1. **Magic numbers extraídos a constantes**:
   - `MAX_TOP_FILES = 3`
   - `MAX_PREFLIGHT_HINTS = 2`
   - `MAX_FOCUS_LENGTH = 140`
   - `MAX_GOAL_LENGTH = 120`
   - `MAX_NEXT_STEP_LENGTH = 150`
   - `MIN_NEXT_STEP_LENGTH = 12`
   - `MAX_NEXT_STEP_CAPTURE_LENGTH = 180`
   - `MAX_RECOMMENDED_TOOLS = 3`

2. **Validación de entrada añadida**:
   - `buildPreflightTask` valida que `workflowProfile` existe y es objeto

3. **Inyección de dependencias completa**:
   - `resolveManagedStart` acepta `startTurn`, `summaryTool` como parámetros
   - `runWorkflowPreflight` acepta `contextTool`, `searchTool` como parámetros

## Deuda Técnica Conocida

1. **`event-policy.js` mezcla responsabilidades**:
   - Helpers de strings (candidatos a `utils/string-helpers.js`)
   - Lógica de preflight (candidato a `preflight-policy.js`)
   - Señales de automaticidad (candidato a `automaticity-signals.js`)
   - **Decisión**: Dejar para después de Fase 2 si el archivo no crece más

2. **Regex de `extractNextStep` tiene mínimo arbitrario**:
   - `{12,180}` requiere al menos 12 caracteres
   - Documentado en constante `MIN_NEXT_STEP_LENGTH`
   - Considerar reducir a `{1,180}` si aparecen next steps válidos más cortos

## Estado del Árbol

```
Modificados:
- tools/devctx/src/analytics/product-quality.js
- tools/devctx/src/orchestration/headless-wrapper.js
- tools/devctx/src/task-runner.js
- tools/devctx/tests/smart-metrics.test.js

Nuevos sin trackear:
- docs/auto-orchestration-design.md
- tools/devctx/src/orchestration/base-orchestrator.js
- tools/devctx/src/orchestration/policy/event-policy.js
- tools/devctx/tests/base-orchestrator.test.js
- tools/devctx/tests/event-policy.test.js
```

## Siguiente Paso

Decidir si partir `event-policy.js` antes de arrancar Fase 2 (adapters por cliente) o dejarlo como está y evaluar después de ver si crece más con los adapters.

**Recomendación**: Commitear Fase 1 como está, iniciar Fase 2, y refactorizar `event-policy.js` solo si crece más allá de 400 líneas o si la mezcla de responsabilidades dificulta el testing de adapters.
