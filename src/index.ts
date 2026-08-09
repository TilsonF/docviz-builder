/**
 * API publica de DocViz Builder.
 */

export type {
  DiagramRenderer,
  RenderOptions,
  RenderResult,
  DiagramBlock,
  RenderedAsset,
  BuildStats,
  OutputFormat,
} from './core/types.js';
export { MIME_TYPES } from './core/types.js';

export {
  DocVizError,
  BuildFailedError,
  ConfigError,
  DslValidationError,
  PathSecurityError,
  RenderError,
  UnknownRendererError,
} from './core/errors.js';

export { RendererRegistry } from './core/registry.js';
export { AssetCache, DEFAULT_CACHE_DIR } from './core/cache.js';
export {
  fullHash,
  shortHash,
  fingerprint,
  stableStringify,
  HashRegistry,
  DEFAULT_HASH_LENGTH,
  MIN_HASH_LENGTH,
  MAX_HASH_LENGTH,
} from './core/hash.js';
export {
  slugify,
  assetFileName,
  assertInside,
  assertRelativeDir,
  relativeAssetPath,
  ensureAssetsDir,
  toPosix,
} from './core/paths.js';

export { scanDocument, parseMarkdown, parseMeta } from './markdown/scan.js';
export { applyReplacements, imageMarkdown, escapeAltText } from './markdown/transform.js';

export { THEMES, getTheme, themeNames, themeFingerprint } from './themes/index.js';
export type { Theme, ThemePalette } from './themes/types.js';

export { buildRegistry } from './renderers/index.js';
export { finalizeSvg, sanitizeSvg, normalizeSvgDimensions } from './renderers/svg-utils.js';
export { renderLikeC4View } from './renderers/likec4-svg.js';

export {
  compileDsl,
  compileDiagram,
  compileChart,
  compileArchitecture,
  dslCatalog,
  isDslLanguage,
  DSL_LANGUAGES,
} from './dsl/index.js';

export { build, check, collectMarkdown } from './build/builder.js';
export type { BuildOptions, BuildResult, CheckResult } from './build/builder.js';
export { verify } from './build/verify.js';
export type { VerifyResult, VerifyIssue } from './build/verify.js';
export { startPreview } from './build/preview.js';

export { loadConfig, defaultConfig, mergeConfig, findConfigFile, resolveFromRoot } from './config/load.js';
export type { DocVizConfig, RenderersConfig, RendererBackend } from './config/types.js';
