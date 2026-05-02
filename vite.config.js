import { defineConfig } from 'vite';
import { scormUploaderPlugin } from './scorm-plugin.js';

export default defineConfig({
  plugins: [scormUploaderPlugin()]
});
