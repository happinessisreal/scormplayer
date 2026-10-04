import fs from 'fs';
import path from 'path';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { validatePackage } from './server/validate-package.js';

/**
 * Vite dev-server plugin: `POST /api/upload` accepts a SCORM .zip, extracts it to
 * public/courses/<id>/, validates the manifest and returns the launch URL plus a
 * validation log for the debugger panel.
 */
export function scormUploaderPlugin() {
  const upload = multer({ dest: 'temp-uploads/' });

  return {
    name: 'scorm-uploader-plugin',
    configureServer(server) {
      server.middlewares.use('/api/upload', (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }

        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        upload.single('file')(req, res, (err) => {
          if (err) return send(500, { error: err.message, validationLogs: [] });
          if (!req.file) return send(400, { error: 'No file uploaded.', validationLogs: [] });

          const zipLogs = [];
          try {
            const courseId = `course_${Date.now()}`;
            const targetDir = path.resolve('public', 'courses', courseId);

            zipLogs.push({ type: 'info', msg: `Extracting ZIP package...` });
            new AdmZip(req.file.path).extractAllTo(targetDir, true);
            fs.unlinkSync(req.file.path);
            zipLogs.push({ type: 'scorm', msg: `ZIP extracted successfully to ${path.relative(process.cwd(), targetDir)}` });

            const result = validatePackage(targetDir);
            const validationLogs = [...zipLogs, ...result.logs];
            if (!result.ok) return send(400, { error: result.error, validationLogs });

            send(200, { url: `/courses/${courseId}/${result.launchHref}`, validationLogs });
          } catch (e) {
            console.error('Upload Error:', e);
            zipLogs.push({ type: 'error', msg: `Critical Error: ${e.message}` });
            send(500, { error: 'Process failed', validationLogs: zipLogs });
          }
        });
      });
    },
  };
}
