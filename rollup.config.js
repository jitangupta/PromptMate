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

export default [
  {
    input: 'scripts/gpt-content.js',
    output: {
      file: 'dist/gpt-content.bundle.js',
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
  },
  {
    input: 'scripts/claude-content.js',
    output: {
      file: 'dist/claude-content.bundle.js',
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
  },
  {
    input: 'scripts/deepseek-content.js',
    output: {
      file: 'dist/deepseek-content.bundle.js',
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
  },
  {
    input: 'scripts/kimi-content.js',
    output: {
      file: 'dist/kimi-content.bundle.js',
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
  },
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
