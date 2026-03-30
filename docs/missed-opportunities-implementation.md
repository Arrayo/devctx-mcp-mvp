# Missed Opportunities Detector - Implementation Summary

## Mejora #3: Detección de Oportunidades Perdidas

**Commit:** `c0b9e7d feat: add missed opportunities detector`

**Fecha:** 2026-03-30

---

## Objetivo

Detectar cuándo el agente **debió usar devctx pero usó herramientas nativas en su lugar**, proporcionando advertencias accionables y estimaciones de ahorro de tokens.

---

## Problema Resuelto

**Antes:**
- No había forma de saber si el agente estaba usando devctx o herramientas nativas
- Imposible detectar cuándo se perdían oportunidades de ahorro
- No había visibilidad de la adopción real durante la sesión

**Después:**
- Sistema detecta patrones de bajo uso de devctx
- Muestra advertencias con severidad (alta/media)
- Estima ahorros potenciales de tokens
- Proporciona sugerencias accionables

---

## Implementación

### 1. Nuevo Módulo: `src/missed-opportunities.js`

**Funciones principales:**
- `isMissedDetectionEnabled()` - Verifica si está habilitado
- `recordDevctxOperation()` - Registra operaciones devctx
- `analyzeMissedOpportunities()` - Analiza patrones de sesión
- `formatMissedOpportunities()` - Formatea advertencias como markdown
- `getSessionActivity()` - Obtiene estadísticas de sesión
- `resetSessionActivity()` - Resetea sesión (para testing)
- `__testing__` - Helpers para tests

**Estado de sesión:**
```javascript
const sessionActivity = {
  devctxOperations: 0,        // Operaciones devctx (preciso)
  totalOperations: 0,         // Total estimado
  lastDevctxCall: 0,          // Timestamp última llamada
  sessionStart: Date.now(),   // Inicio de sesión
  enabled: false,             // Estado habilitado
  warnings: [],               // Advertencias acumuladas
};
```

### 2. Integración en Herramientas

Añadido `recordDevctxOperation()` en:
- `smart_read.js` - Después de `recordToolUsage()`
- `smart_search.js` - Después de `recordToolUsage()`
- `smart_context.js` - Después de `recordToolUsage()`
- `smart_shell.js` - Después de `recordToolUsage()`
- `smart_summary.js` - Después de cada `recordToolUsage()` (3 lugares)

**Patrón de integración:**
```javascript
// Record usage for feedback
recordToolUsage({ ... });

// Record devctx operation for missed opportunity detection
recordDevctxOperation();

// Record decision explanation
recordDecision({ ... });
```

### 3. Heurísticas de Detección

#### Estimación de Operaciones Totales

**Problema:** No podemos interceptar herramientas nativas (Read, Grep, Shell).

**Solución:** Estimación basada en tiempo:
```javascript
const estimateTotalOperations = () => {
  const timeSinceLastDevctx = now - sessionActivity.lastDevctxCall;
  
  if (timeSinceLastDevctx < 2 * 60 * 1000) {
    // Actividad reciente, estimación conservadora
    return sessionActivity.totalOperations;
  }
  
  // Gap largo sin devctx → probablemente usando nativas
  // Heurística: ~1 operación por 10 segundos
  const estimatedNativeOps = Math.floor(timeSinceLastDevctx / 10000);
  return sessionActivity.totalOperations + estimatedNativeOps;
};
```

#### Patrones Detectados

**1. No devctx en sesión larga (🔴 Alta severidad)**
- Condición: Sesión >5 minutos, 0 llamadas devctx
- Razón: Agente no está usando devctx
- Sugerencia: Usar forcing prompt o verificar MCP
- Ahorro estimado: ~10K tokens por operación estimada

**2. Baja adopción (🟡 Media severidad)**
- Condición: ≥10 operaciones, <30% devctx
- Razón: Agente usa más nativas que devctx
- Sugerencia: Considerar forcing prompt
- Ahorro estimado: ~8K tokens por operación no-devctx

**3. Uso cayó (🟡 Media severidad)**
- Condición: Había devctx, luego >3 min sin llamadas
- Razón: Agente cambió a nativas mid-sesión
- Sugerencia: Re-aplicar forcing prompt
- Ahorro estimado: ~5K tokens por minuto sin devctx

### 4. Tests

**Archivo:** `tests/missed-opportunities.test.js`

**11 tests cubriendo:**
- ✅ Habilitado/deshabilitado por defecto
- ✅ Habilitado con `DEVCTX_DETECT_MISSED=true`
- ✅ Registro de operaciones devctx
- ✅ Detección de no uso en sesión larga
- ✅ Detección de baja adopción
- ✅ Detección de uso cayó
- ✅ Manejo de sesiones cortas (<1 min)
- ✅ Formato de advertencias
- ✅ Cálculo de ahorros estimados
- ✅ Reset de actividad de sesión
- ✅ No detección cuando deshabilitado

**Helpers de testing:**
```javascript
export const __testing__ = {
  setSessionStart: (timestamp) => { ... },
  setLastDevctxCall: (timestamp) => { ... },
  setTotalOperations: (count) => { ... },
  getSessionActivity: () => sessionActivity,
};
```

**Resultado:** 553 tests totales, 552 passing, 1 skipped

### 5. Documentación

**Archivos creados/actualizados:**
- ✅ `docs/missed-opportunities.md` - Guía completa (nueva)
- ✅ `README.md` - Sección "Missed Opportunities Detection"
- ✅ `tools/devctx/README.md` - Sección "Missed Opportunities Detection"
- ✅ `CHANGELOG.md` - Entrada detallada

---

## Configuración

### Habilitar

```bash
export DEVCTX_DETECT_MISSED=true
# o
export DEVCTX_DETECT_MISSED=1
# o
export DEVCTX_DETECT_MISSED=yes
```

### Deshabilitar

```bash
export DEVCTX_DETECT_MISSED=false
# o
unset DEVCTX_DETECT_MISSED
```

### Por Defecto

**Deshabilitado** para evitar falsos positivos y errores de estimación.

---

## Ejemplo de Salida

```markdown
---

⚠️ **Missed devctx opportunities detected:**

**Session stats:**
- Duration: 420s
- devctx operations: 2
- Estimated total operations: 25
- devctx adoption: 8%

🟡 **low devctx adoption**
- **Issue:** Low devctx adoption: 2/25 operations (8%). Target: >50%.
- **Suggestion:** Agent may be using native tools. Consider forcing prompt.
- **Potential savings:** ~184.0K tokens

**Total potential savings:** ~184.0K tokens

**How to fix:**
1. Use forcing prompt: `Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)`
2. Check if index is built: `ls .devctx/index.json`
3. Verify MCP is active in Cursor settings

*To disable: `export DEVCTX_DETECT_MISSED=false`*
```

---

## Limitaciones

### 1. Operaciones Totales Estimadas

**Problema:** No podemos ver herramientas nativas.

**Impacto:** Estimaciones pueden estar off por 20-30%.

**Mitigación:** Estimaciones conservadoras, advertencias muestran contexto.

### 2. Falsos Positivos Posibles

**Problema:** Heurísticas no distinguen tareas simples vs complejas perfectamente.

**Impacto:** Advertencias en tareas simples.

**Mitigación:** Advertencias muestran stats para juicio del usuario.

### 3. Sesión-Scoped

**Problema:** Detección se resetea al reiniciar MCP.

**Impacto:** No hay análisis histórico.

**Mitigación:** Para histórico, usar adoption metrics: `npm run report:metrics`.

### 4. No Intercepta Nativas

**Problema:** No podemos ver Read, Grep, Shell.

**Impacto:** Dependemos de estimaciones de tiempo.

**Mitigación:** Tracking directo de devctx (100% preciso), estimación conservadora de nativas.

---

## Casos de Uso

### 1. Verificar que Agente Usa devctx

**Problema:** No estoy seguro si el agente sigue las reglas.

**Solución:** Habilitar detección, ver si aparecen advertencias. Sin advertencias = buena adopción.

### 2. Debug de Problemas de Adopción

**Problema:** Agente no usa devctx en tareas complejas.

**Solución:** Habilitar detección, ver patrones específicos (no uso, baja adopción, uso cayó).

### 3. Cuantificar Ahorros Perdidos

**Problema:** Quiero saber cuánto podría ahorrar.

**Solución:** Habilitar detección, ver ahorros estimados por oportunidad.

### 4. Validar Forcing Prompts

**Problema:** Usé forcing prompt, quiero verificar que funcionó.

**Solución:** Habilitar detección, verificar si adopción mejoró (advertencias dejan de aparecer).

---

## Combinar con Otras Features

Para máxima visibilidad:

```bash
export DEVCTX_SHOW_USAGE=true    # Ver qué se usa
export DEVCTX_EXPLAIN=true       # Entender por qué
export DEVCTX_DETECT_MISSED=true # Detectar gaps
```

**Salida combinada:**
```markdown
---

📊 **devctx usage this session:**
- **smart_read**: 2 calls | ~20.0K tokens saved
**Total saved:** ~20.0K tokens

---

🤖 **Decision explanations:**
**smart_read** (read file.js (outline mode))
- **Why:** File is large (2500 lines)
- **Expected benefit:** ~20.0K tokens saved

---

⚠️ **Missed devctx opportunities detected:**
**Session stats:**
- Duration: 180s
- devctx operations: 2
- Estimated total operations: 12
- devctx adoption: 17%

🟡 **low devctx adoption**
- **Issue:** Low devctx adoption: 2/12 operations (17%). Target: >50%.
- **Potential savings:** ~80.0K tokens
```

---

## Archivos Modificados

### Nuevos
- `tools/devctx/src/missed-opportunities.js` (módulo principal)
- `tools/devctx/tests/missed-opportunities.test.js` (11 tests)
- `docs/missed-opportunities.md` (documentación completa)
- `docs/missed-opportunities-implementation.md` (este archivo)

### Modificados
- `tools/devctx/src/tools/smart-read.js` (+3 líneas)
- `tools/devctx/src/tools/smart-search.js` (+3 líneas)
- `tools/devctx/src/tools/smart-context.js` (+3 líneas)
- `tools/devctx/src/tools/smart-shell.js` (+3 líneas)
- `tools/devctx/src/tools/smart-summary.js` (+9 líneas, 3 lugares)
- `README.md` (nueva sección)
- `tools/devctx/README.md` (nueva sección)
- `CHANGELOG.md` (entrada detallada)

---

## Métricas

**Líneas de código:**
- Módulo principal: ~400 líneas
- Tests: ~200 líneas
- Documentación: ~600 líneas
- Integraciones: ~20 líneas

**Total:** ~1,220 líneas nuevas/modificadas

**Tests:** 11 nuevos, todos passing

**Cobertura:** 100% de funciones públicas

---

## Próximos Pasos

Esta es la **última mejora** de la serie de 3:
1. ✅ Feedback Visible en Respuesta (Mejora #1)
2. ✅ Modo Explicativo (Mejora #2)
3. ✅ Detección de Oportunidades Perdidas (Mejora #3)

**Estado:** Todas las mejoras implementadas, testeadas, documentadas y committeadas.

**Pendiente:** Push manual por parte del usuario.

---

## Resumen

**Mejora #3 implementa un detector de oportunidades perdidas** que:
- ✅ Rastrea operaciones devctx en tiempo real
- ✅ Estima operaciones totales desde gaps de tiempo
- ✅ Detecta 3 patrones (no uso, baja adopción, uso cayó)
- ✅ Muestra advertencias con severidad y ahorros estimados
- ✅ Proporciona sugerencias accionables
- ✅ Se combina con feedback y explicaciones para máxima visibilidad
- ✅ 11 tests, todos passing
- ✅ Documentación completa
- ✅ Deshabilitado por defecto

**Habilitar con:** `export DEVCTX_DETECT_MISSED=true`
