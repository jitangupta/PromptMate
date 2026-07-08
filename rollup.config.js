import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';
import postcss from 'rollup-plugin-postcss';

const isProd = process.env.BUILD === 'production';

const maybeTerser = () => (isProd ? [terser()] : []);
const buildReplace = () => replace({
  'process.env.BUILD': JSON.stringify(process.env.BUILD || 'development'),
  preventAssignment: true,
});

// One bundle per host adapter: scripts/<host>-content.js → dist/<host>-content.bundle.js
const CONTENT_SCRIPTS = [
  'gpt',
  'claude',
  'deepseek',
  'kimi',
  'grok',
  'gemini',
  'perplexity',
  'copilot',
  'lechat',
  'metaai',
  'qwen',
  'poe',
  'huggingchat',
  'aistudio',
  'pi',
];

const contentScriptConfig = (host) => ({
  input: `scripts/${host}-content.js`,
  output: {
    file: `dist/${host}-content.bundle.js`,
    format: 'iife',
    sourcemap: true
  },
  plugins: [
    buildReplace(),
    resolve(),
    commonjs(),
    postcss({
      inject: true,
      minimize: isProd,
      extensions: ['.css']
    }),
    ...maybeTerser()
  ]
});

export default [
  ...CONTENT_SCRIPTS.map(contentScriptConfig),
  {
    input: 'background.js',
    output: {
      file: 'dist/background.bundle.js',
      format: 'iife',
      sourcemap: true
    },
    plugins: [
      buildReplace(),
      resolve(),
      commonjs(),
      ...maybeTerser()
    ]
  }
];
