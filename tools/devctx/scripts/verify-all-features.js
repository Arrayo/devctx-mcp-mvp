#!/usr/bin/env node

/**
 * Comprehensive feature verification script.
 * Tests all MCP tools to ensure they work correctly.
 */

import { createDevctxServer } from '../src/server.js';
import { buildIndex, persistIndex } from '../src/index.js';
import { projectRoot } from '../src/utils/paths.js';
import fs from 'node:fs';
import path from 'node:path';

const results = {
  passed: [],
  failed: [],
  warnings: [],
};

const log = (msg) => console.log(`  ${msg}`);
const success = (msg) => {
  console.log(`✓ ${msg}`);
  results.passed.push(msg);
};
const fail = (msg, error) => {
  console.log(`✗ ${msg}`);
  console.log(`  Error: ${error.message}`);
  results.failed.push({ test: msg, error: error.message });
};
const warn = (msg) => {
  console.log(`⚠ ${msg}`);
  results.warnings.push(msg);
};

console.log('🔍 Verificando todas las funcionalidades del MCP...\n');

// Helper to call MCP tool
const callTool = async (server, toolName, args) => {
  const tools = await server.listTools();
  const tool = tools.tools.find(t => t.name === toolName);
  
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  return await server.callTool({ name: toolName, arguments: args });
};

const runTests = async () => {
  const server = createDevctxServer();

  console.log('📦 1. Verificando herramientas básicas...\n');

  try {
    log('Construyendo índice...');
    const result = await callTool(server, 'build_index', { incremental: false });
    const data = JSON.parse(result.content[0].text);
    
    if (data.status === 'ok' && data.files > 0) {
      success(`build_index: ${data.files} archivos, ${data.symbols} símbolos`);
    } else {
      throw new Error('Index build returned invalid data');
    }
  } catch (error) {
    fail('build_index', error);
  }

  try {
    log('Probando smart_read...');
    const result = await callTool(server, 'smart_read', {
      filePath: 'tools/devctx/src/server.js',
      mode: 'outline'
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.content && data.mode === 'outline') {
      success(`smart_read: modo ${data.mode}, parser ${data.parser}`);
    } else {
      throw new Error('smart_read returned invalid data');
    }
  } catch (error) {
    fail('smart_read', error);
  }

  try {
    log('Probando smart_search...');
    const result = await callTool(server, 'smart_search', {
      query: 'export function',
      intent: 'implementation'
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.results && Array.isArray(data.results)) {
      success(`smart_search: ${data.results.length} resultados encontrados`);
    } else {
      throw new Error('smart_search returned invalid data');
    }
  } catch (error) {
    fail('smart_search', error);
  }

  try {
    log('Probando smart_context...');
    const result = await callTool(server, 'smart_context', {
      task: 'understand the MCP server implementation',
      detail: 'minimal',
      maxTokens: 2000
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.context && Array.isArray(data.context)) {
      success(`smart_context: ${data.context.length} items de contexto`);
    } else {
      throw new Error('smart_context returned invalid data');
    }
  } catch (error) {
    fail('smart_context', error);
  }

  try {
    log('Probando smart_read_batch...');
    const result = await callTool(server, 'smart_read_batch', {
      files: [
        { path: 'tools/devctx/src/server.js', mode: 'outline' },
        { path: 'tools/devctx/src/index.js', mode: 'outline' }
      ]
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.results && data.results.length === 2) {
      success(`smart_read_batch: ${data.metrics.filesRead} archivos leídos`);
    } else {
      throw new Error('smart_read_batch returned invalid data');
    }
  } catch (error) {
    fail('smart_read_batch', error);
  }

  console.log('\n🆕 2. Verificando nuevas funcionalidades...\n');

  try {
    log('Probando warm_cache...');
    const result = await callTool(server, 'warm_cache', {});
    const data = JSON.parse(result.content[0].text);
    
    if (data.warmed !== undefined && data.skipped !== undefined) {
      success(`warm_cache: ${data.warmed} archivos precargados, ${data.skipped} omitidos`);
    } else {
      throw new Error('warm_cache returned invalid data');
    }
  } catch (error) {
    fail('warm_cache', error);
  }

  try {
    log('Probando git_blame (modo symbol)...');
    const result = await callTool(server, 'git_blame', {
      mode: 'symbol',
      filePath: 'tools/devctx/src/server.js'
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.symbols && Array.isArray(data.symbols)) {
      success(`git_blame (symbol): ${data.symbols.length} símbolos con atribución`);
    } else {
      throw new Error('git_blame returned invalid data');
    }
  } catch (error) {
    fail('git_blame (symbol)', error);
  }

  try {
    log('Probando git_blame (modo file)...');
    const result = await callTool(server, 'git_blame', {
      mode: 'file',
      filePath: 'tools/devctx/src/server.js'
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.authors && Array.isArray(data.authors)) {
      success(`git_blame (file): ${data.authors.length} autores, ${data.totalLines} líneas`);
    } else {
      throw new Error('git_blame returned invalid data');
    }
  } catch (error) {
    fail('git_blame (file)', error);
  }

  try {
    log('Probando git_blame (modo recent)...');
    const result = await callTool(server, 'git_blame', {
      mode: 'recent',
      daysBack: 30,
      limit: 10
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.symbols && Array.isArray(data.symbols)) {
      success(`git_blame (recent): ${data.symbols.length} símbolos modificados recientemente`);
    } else {
      throw new Error('git_blame returned invalid data');
    }
  } catch (error) {
    fail('git_blame (recent)', error);
  }

  try {
    log('Probando cross_project (modo discover)...');
    const result = await callTool(server, 'cross_project', {
      mode: 'discover'
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.projects && Array.isArray(data.projects)) {
      success(`cross_project (discover): ${data.projects.length} proyectos configurados`);
      if (data.projects.length === 0) {
        warn('No hay .devctx-projects.json configurado (esto es normal si no usas multi-proyecto)');
      }
    } else {
      throw new Error('cross_project returned invalid data');
    }
  } catch (error) {
    fail('cross_project (discover)', error);
  }

  try {
    log('Probando cross_project (modo stats)...');
    const result = await callTool(server, 'cross_project', {
      mode: 'stats'
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.totalProjects !== undefined) {
      success(`cross_project (stats): ${data.totalProjects} proyectos totales, ${data.indexedProjects} indexados`);
    } else {
      throw new Error('cross_project returned invalid data');
    }
  } catch (error) {
    fail('cross_project (stats)', error);
  }

  console.log('\n📊 3. Verificando funcionalidades avanzadas...\n');

  try {
    log('Testing smart_context with diff...');
    const result = await callTool(server, 'smart_context', {
      task: 'review recent changes',
      diff: 'HEAD~5',
      detail: 'minimal',
      maxTokens: 2000
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.context && data.diffSummary) {
      success(`smart_context (diff): ${data.diffSummary.totalChanged || 0} archivos cambiados analizados`);
    } else {
      throw new Error('smart_context with diff returned invalid data');
    }
  } catch (error) {
    fail('smart_context (diff)', error);
  }

  try {
    log('Testing smart_context with prefetch...');
    const result = await callTool(server, 'smart_context', {
      task: 'understand the server implementation',
      prefetch: true,
      detail: 'minimal',
      maxTokens: 2000
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.context && data.prefetch !== undefined) {
      success(`smart_context (prefetch): predicción ${data.prefetch.confidence || 0} confianza`);
    } else {
      throw new Error('smart_context with prefetch returned invalid data');
    }
  } catch (error) {
    fail('smart_context (prefetch)', error);
  }

  try {
    log('Testing build_index with warmCache...');
    const result = await callTool(server, 'build_index', {
      incremental: true,
      warmCache: true
    });
    const data = JSON.parse(result.content[0].text);
    
    if (data.status === 'ok' && data.cacheWarming) {
      success(`build_index (warmCache): ${data.cacheWarming.warmed} archivos precargados`);
    } else {
      throw new Error('build_index with warmCache returned invalid data');
    }
  } catch (error) {
    fail('build_index (warmCache)', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📋 RESUMEN DE VERIFICACIÓN\n');
  console.log(`✓ Tests pasados: ${results.passed.length}`);
  console.log(`✗ Tests fallidos: ${results.failed.length}`);
  console.log(`⚠ Advertencias: ${results.warnings.length}`);

  if (results.failed.length > 0) {
    console.log('\n❌ Tests fallidos:');
    results.failed.forEach(f => {
      console.log(`  - ${f.test}: ${f.error}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  Advertencias:');
    results.warnings.forEach(w => {
      console.log(`  - ${w}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  if (results.failed.length === 0) {
    console.log('\n✅ TODAS LAS FUNCIONALIDADES VERIFICADAS CORRECTAMENTE\n');
    process.exit(0);
  } else {
    console.log('\n❌ ALGUNAS FUNCIONALIDADES FALLARON\n');
    process.exit(1);
  }
};

runTests().catch(error => {
  console.error('\n💥 Fatal error during verification:', error);
  process.exit(1);
});
