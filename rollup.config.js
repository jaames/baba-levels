// rollup.config.js
import svelte from 'rollup-plugin-svelte';
import autoPreprocess from 'svelte-preprocess';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import css from "rollup-plugin-import-css";
import copy from 'rollup-plugin-copy';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

const devserver = process.env.DEV_SERVER || false;

export default {
  input: ['src/index.ts'],
  output: {
    file: 'dist/index.js',
  },
  plugins: [
    resolve({
      browser: true
    }),
    svelte({
      preprocess: autoPreprocess()
    }),
    typescript(),
    css(),
    copy({
      targets: [
        { src: 'src/*.html', dest: 'dist' },
        // { src: ['assets/fonts/arial.woff', 'assets/fonts/arial.woff2'], dest: 'dist/public/fonts' },
        // { src: 'assets/images/**/*', dest: 'dist/public/images' }
      ]
    }),
    devserver && serve({
      historyApiFallback: true,
      contentBase: ['dist', 'test']
    }),
    devserver && livereload({
      watch: 'dist'
    }),
  ].filter(Boolean)
}