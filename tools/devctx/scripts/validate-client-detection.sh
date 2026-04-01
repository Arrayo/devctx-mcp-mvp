#!/usr/bin/env bash
set -e

echo "=== Validación de detección de cliente ==="
echo ""

echo "1. Ejecutando task-runner status..."
node scripts/task-runner.js status > /dev/null 2>&1
echo "   ✓ Ejecutado"

echo ""
echo "2. Ejecutando task-runner doctor..."
node scripts/task-runner.js doctor > /dev/null 2>&1
echo "   ✓ Ejecutado"

echo ""
echo "3. Verificando métricas de cursor en SQLite..."
CURSOR_COUNT=$(sqlite3 .devctx/state.sqlite "SELECT COUNT(*) FROM metrics_events WHERE json_extract(metadata_json, '$.client') = 'cursor';" 2>/dev/null)
echo "   Métricas con client='cursor': $CURSOR_COUNT"

if [ "$CURSOR_COUNT" -gt 0 ]; then
  echo "   ✓ Métricas de cursor encontradas"
else
  echo "   ✗ No se encontraron métricas de cursor"
  exit 1
fi

echo ""
echo "4. Verificando reporte de métricas..."
CLIENTS_MEASURED=$(npm run report:metrics 2>/dev/null | grep "Clients measured:" | awk '{print $3}')
echo "   Clientes medidos: $CLIENTS_MEASURED"

if [ "$CLIENTS_MEASURED" -ge 2 ]; then
  echo "   ✓ Múltiples clientes detectados (cursor + generic)"
else
  echo "   ✗ Solo un cliente detectado"
  exit 1
fi

echo ""
echo "5. Verificando entradas de cursor..."
npm run report:metrics 2>/dev/null | grep -A 10 "^cursor:" | grep "Entries measured:" | awk '{print "   Entradas medidas:", $3}'

echo ""
echo "=== ✓ Validación completa ==="
echo ""
echo "Las métricas ahora distinguen correctamente entre 'cursor' y 'generic'."
