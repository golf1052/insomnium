export interface ModuleExportResolutionOptions {
  nodeRequire: NodeJS.Require;
  staticExports?: Record<string, string[]>;
}

export interface ModuleExportResolution {
  exportNames: string[];
  hasDefaultExport: boolean;
}

export const isValidExportName = (name: string) => {
  try {
    new Function(`const ${name} = true`);
    return true;
  } catch {
    return false;
  }
};

export const resolveModuleExports = (
  externalId: string,
  options: ModuleExportResolutionOptions
): ModuleExportResolution => {
  const configuredExports = options.staticExports?.[externalId];
  const exportNames = configuredExports ?? Object.keys(options.nodeRequire(externalId));

  return {
    exportNames: exportNames.filter(isValidExportName),
    hasDefaultExport: exportNames.includes('default'),
  };
};

export const buildRequireModuleSource = (
  externalId: string,
  exportNames: string[],
  hasDefaultExport: boolean
) => [
  `const requiredModule = globalThis.require('${externalId}');`,
  `${exportNames.map(name => `export const ${name} = requiredModule.${name};`).join('\n')}`,
  hasDefaultExport ? 'export default requiredModule.default;' : 'export default requiredModule',
].join('\n');
