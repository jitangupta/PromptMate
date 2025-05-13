import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import postcss from 'rollup-plugin-postcss';

export default [
  {
    input: 'gpt-content.js',
    output: {
      file: 'dist/gpt-content.bundle.js',
      format: 'iife',
      sourcemap: true
    },
    plugins: [
      resolve(),
      commonjs(),
      postcss({
        inject: true,
        minimize: true,
        extensions: ['.css']
      }),
      terser()
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
      resolve(),
      commonjs(),
      terser()
    ]
  }
];