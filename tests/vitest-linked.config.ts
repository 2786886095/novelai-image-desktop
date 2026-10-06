import config from '../vite.config';
import {defineConfig, mergeConfig} from 'vitest/config';
// Only the disposable candidate's dependency tree is linked. Keep imports
// inside that tree rather than mixing two different Vite module roots.
export default mergeConfig(config, defineConfig({resolve: {preserveSymlinks: true}}));
