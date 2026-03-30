# Default-On Improvements - Making devctx Usage Automatic

**Commit:** `5201403` feat: enable all visibility features by default

**Date:** 2026-03-30

---

## Problema Identificado

Durante testing, descubrimos que **el agente no estaba usando el MCP** incluso cuando estaba instalado:

- ❌ Subagente hizo code review sin usar devctx
- ❌ Usó herramientas nativas (Read, Grep) en lugar de devctx
- ❌ No había feedback visible de que no se estaba usando
- ❌ Features de visibilidad eran opt-in (había que activarlas manualmente)

**Resultado:** El MCP estaba instalado pero infrautilizado.

---

## Solución Implementada

### 1. Todas las Features de Visibilidad Habilitadas por Defecto

**Antes (opt-in):**
```bash
export DEVCTX_SHOW_USAGE=true    # Había que activar
export DEVCTX_EXPLAIN=true       # Había que activar
export DEVCTX_DETECT_MISSED=true # Había que activar
```

**Ahora (enabled by default):**
- ✅ **Usage Feedback** - Habilitado por defecto
- ✅ **Decision Explainer** - Habilitado por defecto
- ✅ **Missed Opportunities** - Habilitado por defecto

**Deshabilitar si es muy verbose:**
```bash
export DEVCTX_SHOW_USAGE=false
export DEVCTX_EXPLAIN=false
export DEVCTX_DETECT_MISSED=false
```

### 2. Nuevo Archivo `.cursorrules`

Creado `.cursorrules` en la raíz del proyecto con:

**Política MANDATORY:**
- Usar `smart_read` en lugar de `Read`
- Usar `smart_search` en lugar de `Grep`
- Usar `smart_context` en lugar de múltiples Read + Grep
- Usar `smart_shell` en lugar de `Shell` (para comandos diagnósticos)

**Workflow recomendado:**
```
1. smart_turn(start)
2. smart_context(task)
3. smart_search(query)
4. smart_read(file)
5. smart_turn(end)
```

**Compliance:**
- Si el agente usa herramientas nativas, DEBE explicar por qué

### 3. Feedback Positivo Cuando Se Usa devctx

Añadido mensaje positivo en `formatMissedOpportunities()`:

```markdown
✅ **devctx adoption: 85%** (17/20 operations)
```

Esto muestra cuando el agente **SÍ está usando devctx correctamente**.

---

## Cambios en el Código

### `src/usage-feedback.js`

**Antes:**
```javascript
const sessionUsage = {
  enabled: false,  // Disabled by default
  onboardingMode: true,
  ONBOARDING_THRESHOLD: 10,
};

export const isFeedbackEnabled = () => {
  // Complex logic with onboarding mode
  if (sessionUsage.onboardingMode && sessionUsage.totalToolCalls < 10) {
    return true;
  }
  return false; // Default: disabled
};
```

**Ahora:**
```javascript
const sessionUsage = {
  enabled: true,  // ENABLED by default
  // No onboarding mode
};

export const isFeedbackEnabled = () => {
  const envValue = process.env.DEVCTX_SHOW_USAGE?.toLowerCase();
  
  if (envValue === 'false' || envValue === '0' || envValue === 'no') {
    return false;
  }
  
  return true; // Default: ENABLED
};
```

### `src/decision-explainer.js`

**Cambio similar:**
```javascript
const sessionDecisions = {
  enabled: true, // Changed from false
};

export const isExplainEnabled = () => {
  // Explicit disable check
  if (envValue === 'false' || envValue === '0' || envValue === 'no') {
    return false;
  }
  
  return true; // Default: ENABLED
};
```

### `src/missed-opportunities.js`

**Cambio similar:**
```javascript
const sessionActivity = {
  enabled: true, // Changed from false
};

export const isMissedDetectionEnabled = () => {
  // Explicit disable check
  if (envValue === 'false' || envValue === '0' || envValue === 'no') {
    return false;
  }
  
  return true; // Default: ENABLED
};
```

**Nuevo feedback positivo:**
```javascript
// If no opportunities but session is active, show positive feedback
if (analysis.opportunities.length === 0 && analysis.devctxOperations > 0) {
  return `\n\n✅ **devctx adoption: ${analysis.devctxRatio}%** (${analysis.devctxOperations}/${analysis.estimatedTotal} operations)\n`;
}
```

---

## Tests Actualizados

### `tests/usage-feedback.test.js`

**Antes:**
```javascript
test('usage feedback - disabled by default', () => {
  assert.equal(isFeedbackEnabled(), false);
});
```

**Ahora:**
```javascript
test('usage feedback - enabled by default', () => {
  assert.equal(isFeedbackEnabled(), true);
});
```

### `tests/decision-explainer.test.js`

**Cambio similar:**
```javascript
test('decision explainer - enabled by default', () => {
  assert.equal(isExplainEnabled(), true);
});
```

### `tests/missed-opportunities.test.js`

**Cambio similar:**
```javascript
test('missed opportunities - enabled by default', () => {
  assert.equal(isMissedDetectionEnabled(), true);
});
```

**Resultado:** 553 tests, 552 passing, 1 skipped

---

## Documentación Actualizada

### `README.md`

**Secciones actualizadas:**
- Real-Time Usage Feedback: "ENABLED BY DEFAULT"
- Decision Explanations: "ENABLED BY DEFAULT"
- Missed Opportunities Detection: "ENABLED BY DEFAULT"
- Removed onboarding mode references
- Changed "Enable" to "Disable if too verbose"

### `tools/devctx/README.md`

**Cambios similares:**
- Real-Time Feedback: "Enabled by Default"
- Removed onboarding mode section
- Updated examples to show disable commands

### `CHANGELOG.md`

**Nueva sección "Changed":**
- Documenta el cambio de opt-in a enabled-by-default
- Explica rationale (maximizar visibilidad, drive adoption)
- Lista todos los archivos modificados

### Nuevo: `.cursorrules`

**Política MANDATORY para agentes:**
- Usar devctx tools cuando MCP está instalado
- Workflow recomendado
- Preflight checklist
- Compliance: explicar si se usan nativas

---

## Impacto Esperado

### Antes (opt-in):

- ❌ Agentes no sabían que debían usar devctx
- ❌ No había feedback visible por defecto
- ❌ Usuarios tenían que activar features manualmente
- ❌ Fácil que el MCP quedara sin usar

### Ahora (enabled by default):

- ✅ **Feedback visible en cada respuesta**
- ✅ **Explicaciones de decisiones automáticas**
- ✅ **Advertencias cuando no se usa devctx**
- ✅ **Regla de Cursor fuerza uso del MCP**
- ✅ **Feedback positivo cuando se usa correctamente**

### Resultado Esperado:

1. **Agentes usan devctx automáticamente** (por `.cursorrules`)
2. **Usuarios ven feedback inmediatamente** (por default-on)
3. **Problemas de adopción son obvios** (por advertencias)
4. **Uso correcto es reforzado** (por feedback positivo)

---

## Archivos Modificados

### Código
- `src/usage-feedback.js` - Cambio a enabled by default
- `src/decision-explainer.js` - Cambio a enabled by default
- `src/missed-opportunities.js` - Cambio a enabled by default + feedback positivo

### Tests
- `tests/usage-feedback.test.js` - Actualizado test de default
- `tests/decision-explainer.test.js` - Actualizado test de default
- `tests/missed-opportunities.test.js` - Actualizado test de default

### Documentación
- `README.md` - Actualizado 3 secciones
- `tools/devctx/README.md` - Actualizado 2 secciones
- `CHANGELOG.md` - Nueva sección "Changed"
- `.cursorrules` - Nuevo archivo con política MANDATORY

### Total
- **10 archivos modificados**
- **1 archivo nuevo** (`.cursorrules`)
- **~180 líneas añadidas/modificadas**

---

## Próximos Pasos

1. **Push manual** por parte del usuario
2. **Publicar 1.3.0** a npm
3. **Actualizar instalación local**
4. **Verificar** que el agente ahora SÍ usa devctx por defecto

---

## Verificación

Después de actualizar, verificar que:

1. **Feedback aparece automáticamente:**
   - Sin configurar nada, deberías ver feedback en cada respuesta

2. **Advertencias aparecen si no se usa:**
   - Si el agente no usa devctx, deberías ver advertencias

3. **`.cursorrules` funciona:**
   - El agente debería mencionar que debe usar devctx
   - Si usa nativas, debería explicar por qué

4. **MCP prompts funcionan:**
   - `/prompt use-devctx` debería inyectar forcing instructions

---

## Resumen

**Cambio fundamental:** De **opt-in** a **enabled by default**.

**Objetivo:** Asegurar que el MCP se use cuando está instalado.

**Mecanismos:**
1. ✅ Feedback visible por defecto
2. ✅ Advertencias automáticas
3. ✅ Regla de Cursor fuerza uso
4. ✅ MCP prompts para forcing fácil

**Resultado:** **Imposible que el MCP quede sin usar** sin que sea obvio.
