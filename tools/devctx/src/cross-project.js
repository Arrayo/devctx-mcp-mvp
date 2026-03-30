import fs from 'node:fs';
import path from 'node:path';
import { loadIndex } from './index.js';
import { smartSearch } from './tools/smart-search.js';
import { smartRead } from './tools/smart-read.js';
import { projectRoot } from './utils/paths.js';

const CROSS_PROJECT_CONFIG_FILE = '.devctx-projects.json';

export const loadCrossProjectConfig = (root = projectRoot) => {
  const configPath = path.join(root, CROSS_PROJECT_CONFIG_FILE);
  
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
};

export const discoverRelatedProjects = (root = projectRoot) => {
  const config = loadCrossProjectConfig(root);
  if (!config?.projects) return [];

  const projects = [];

  for (const project of config.projects) {
    const projectPath = path.isAbsolute(project.path)
      ? project.path
      : path.resolve(root, project.path);

    if (!fs.existsSync(projectPath)) continue;

    const indexPath = path.join(projectPath, '.devctx/index.json');
    const hasIndex = fs.existsSync(indexPath);

    projects.push({
      name: project.name,
      path: projectPath,
      type: project.type || 'related',
      description: project.description || '',
      hasIndex,
    });
  }

  return projects;
};

export const searchAcrossProjects = async (query, options = {}) => {
  const {
    root = projectRoot,
    intent = 'implementation',
    maxResultsPerProject = 5,
    includeProjects = null,
    excludeProjects = null,
  } = options;

  const relatedProjects = discoverRelatedProjects(root);
  
  const projectsToSearch = relatedProjects.filter(p => {
    if (!p.hasIndex) return false;
    if (includeProjects && !includeProjects.includes(p.name)) return false;
    if (excludeProjects && excludeProjects.includes(p.name)) return false;
    return true;
  });

  const results = [];

  for (const project of projectsToSearch) {
    try {
      const searchResult = await smartSearch({
        query,
        cwd: project.path,
        intent,
        maxResults: maxResultsPerProject,
      });

      if (searchResult.results && searchResult.results.length > 0) {
        results.push({
          project: project.name,
          projectPath: project.path,
          projectType: project.type,
          matches: searchResult.results.length,
          results: searchResult.results.map(r => ({
            ...r,
            projectName: project.name,
            absolutePath: path.join(project.path, r.file),
          })),
        });
      }
    } catch {
      continue;
    }
  }

  return results;
};

export const readAcrossProjects = async (fileRefs, root = projectRoot) => {
  const relatedProjects = discoverRelatedProjects(root);
  const projectMap = new Map(relatedProjects.map(p => [p.name, p]));

  const results = [];

  for (const ref of fileRefs) {
    const project = projectMap.get(ref.project);
    if (!project) {
      results.push({
        project: ref.project,
        file: ref.file,
        error: 'Project not found',
      });
      continue;
    }

    try {
      const readResult = await smartRead({
        filePath: ref.file,
        mode: ref.mode || 'outline',
        cwd: project.path,
      });

      results.push({
        project: ref.project,
        projectPath: project.path,
        file: ref.file,
        mode: readResult.mode,
        content: readResult.content,
        parser: readResult.parser,
      });
    } catch (err) {
      results.push({
        project: ref.project,
        file: ref.file,
        error: err.message,
      });
    }
  }

  return results;
};

export const findSymbolAcrossProjects = async (symbolName, root = projectRoot) => {
  const relatedProjects = discoverRelatedProjects(root).filter(p => p.hasIndex);
  const results = [];

  for (const project of relatedProjects) {
    try {
      const index = loadIndex(project.path);
      if (!index?.files) continue;

      for (const [filePath, fileInfo] of Object.entries(index.files)) {
        if (!fileInfo.symbols) continue;

        const matchingSymbols = fileInfo.symbols.filter(s => 
          s.name === symbolName || s.name.includes(symbolName)
        );

        for (const symbol of matchingSymbols) {
          results.push({
            project: project.name,
            projectPath: project.path,
            projectType: project.type,
            file: filePath,
            symbol: symbol.name,
            kind: symbol.kind,
            line: symbol.line,
            signature: symbol.signature,
          });
        }
      }
    } catch {
      continue;
    }
  }

  return results;
};

export const getCrossProjectDependencies = (root = projectRoot) => {
  const relatedProjects = discoverRelatedProjects(root).filter(p => p.hasIndex);
  const dependencies = {
    projects: [],
    edges: [],
  };

  for (const project of relatedProjects) {
    dependencies.projects.push({
      name: project.name,
      path: project.path,
      type: project.type,
    });

    try {
      const index = loadIndex(project.path);
      if (!index?.graph?.edges) continue;

      for (const edge of index.graph.edges) {
        if (edge.kind !== 'import') continue;

        const fromAbs = path.join(project.path, edge.from);
        const toAbs = path.join(project.path, edge.to);

        const toProject = relatedProjects.find(p => 
          toAbs.startsWith(p.path) && p.path !== project.path
        );

        if (toProject) {
          const toRel = path.relative(toProject.path, toAbs);
          dependencies.edges.push({
            from: project.name,
            fromFile: edge.from,
            to: toProject.name,
            toFile: toRel,
            kind: 'cross-project-import',
          });
        }
      }
    } catch {
      continue;
    }
  }

  return dependencies;
};

export const getCrossProjectStats = (root = projectRoot) => {
  const relatedProjects = discoverRelatedProjects(root);
  const deps = getCrossProjectDependencies(root);

  const stats = {
    totalProjects: relatedProjects.length,
    indexedProjects: relatedProjects.filter(p => p.hasIndex).length,
    projectTypes: {},
    crossProjectImports: deps.edges.length,
    importsByProject: {},
  };

  for (const project of relatedProjects) {
    const type = project.type || 'related';
    stats.projectTypes[type] = (stats.projectTypes[type] || 0) + 1;
  }

  for (const edge of deps.edges) {
    stats.importsByProject[edge.from] = (stats.importsByProject[edge.from] || 0) + 1;
  }

  return stats;
};

export const createSampleConfig = (root = projectRoot) => {
  return {
    version: '1.0',
    projects: [
      {
        name: 'main-app',
        path: '.',
        type: 'main',
        description: 'Main application',
      },
      {
        name: 'shared-lib',
        path: '../shared-lib',
        type: 'library',
        description: 'Shared utilities library',
      },
      {
        name: 'api-service',
        path: '../api-service',
        type: 'service',
        description: 'Backend API service',
      },
    ],
    searchDefaults: {
      maxResultsPerProject: 5,
      includeTypes: ['main', 'library', 'service'],
    },
  };
};
