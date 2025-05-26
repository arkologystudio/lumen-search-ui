import { Config } from '@stencil/core';
import dotenv from 'dotenv';

dotenv.config();
// https://stenciljs.com/docs/config

export const config: Config = {
  namespace: 'lumen-search-ui',
  globalStyle: 'src/global/app.css',
  globalScript: 'src/global/app.ts',
  taskQueue: 'async',
  outputTargets: [
    {
      type: 'www',
      // comment the following line to disable service workers in production
      serviceWorker: null,
      baseUrl: '/',
    },
    {
      type: 'dist',
      esmLoaderPath: '../loader',
    },
    {
      type: 'dist-custom-elements',
    },
  ],
  devServer: {
    reloadStrategy: 'pageReload',
    port: 3333,
    openBrowser: true,
  },
  env: {
    API_URL: process.env.API_URL,
  },
};
