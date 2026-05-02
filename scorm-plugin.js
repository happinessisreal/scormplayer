import fs from 'fs';
import path from 'path';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { execSync } from 'child_process';

export function scormUploaderPlugin() {
  const upload = multer({ dest: 'temp-uploads/' });

  return {
    name: 'scorm-uploader-plugin',
    configureServer(server) {
      server.middlewares.use('/api/upload', (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }

        upload.single('file')(req, res, (err) => {
          if (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message, validationLogs: [] }));
            return;
          }

          if (!req.file) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'No file uploaded.', validationLogs: [] }));
            return;
          }

          const validationLogs = [];
          function logInfo(msg) { validationLogs.push({ type: 'info', msg }); }
          function logWarn(msg) { validationLogs.push({ type: 'warn', msg }); }
          function logError(msg) { validationLogs.push({ type: 'error', msg }); }
          function logSuccess(msg) { validationLogs.push({ type: 'scorm', msg }); }

          try {
            const tempFilePath = req.file.path;
            const courseId = `course_${Date.now()}`;
            const targetDir = path.resolve('public', 'courses', courseId);

            logInfo(`Extracting ZIP package...`);
            const zip = new AdmZip(tempFilePath);
            zip.extractAllTo(targetDir, true);
            fs.unlinkSync(tempFilePath);
            logSuccess(`ZIP extracted successfully to ${targetDir}`);

            const manifestPath = path.join(targetDir, 'imsmanifest.xml');
            let launchUrl = '';

            logInfo(`Checking for imsmanifest.xml...`);
            if (!fs.existsSync(manifestPath)) {
              logError(`imsmanifest.xml is missing from the root of the package.`);
              
              if (fs.existsSync(path.join(targetDir, 'index.html'))) {
                launchUrl = `/courses/${courseId}/index.html`;
                logWarn(`Fallback: Found index.html without manifest.`);
              } else {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing imsmanifest.xml and no index.html fallback found.', validationLogs }));
                return;
              }
            } else {
              logSuccess(`imsmanifest.xml found.`);
              
              const xmlData = fs.readFileSync(manifestPath, 'utf8');
              
              // 1. Basic XML well-formedness check
              logInfo(`Checking XML well-formedness...`);
              const xmlWellFormed = XMLValidator.validate(xmlData);
              if (xmlWellFormed !== true) {
                logError(`XML Syntax Error: ${xmlWellFormed.err.msg} (Line: ${xmlWellFormed.err.line})`);
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Manifest contains invalid XML syntax', validationLogs }));
                return;
              }
              logSuccess(`XML is well-formed.`);

              // 2. Official ADL XSD Validation using xmllint
              logInfo(`Running official ADL SCORM XSD validation (xmllint)...`);
              const schemaPath = path.resolve('schemas/imscp_v1p1.xsd');
              try {
                // We use --nonet to ensure we only use local patched schemas
                const xmllintOutput = execSync(`xmllint --noout --nonet --schema "${schemaPath}" "${manifestPath}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
                logSuccess(`XSD Validation Passed: imsmanifest.xml conforms to SCORM schemas.`);
              } catch (xsdErr) {
                const output = xsdErr.stderr || xsdErr.stdout || xsdErr.message;
                logError(`XSD Validation Failed:\n${output}`);
                // We continue despite XSD errors unless it's a critical launch issue, but we report it
                logWarn(`The package may not be fully compliant with SCORM 2004 4th Edition.`);
              }

              // 3. Structural Parsing
              logInfo(`Analyzing SCORM structural integrity...`);
              const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
              let result;
              try {
                result = parser.parse(xmlData);
              } catch (xmlErr) {
                logError(`Failed to parse XML into object model.`);
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid XML manifest', validationLogs }));
                return;
              }

              const manifest = result.manifest;
              if (!manifest) {
                logError(`Root <manifest> element is missing.`);
              } else {
                logSuccess(`Root <manifest> element is present.`);
                
                if (!manifest['@_identifier']) {
                  logError(`Root <manifest> is missing 'identifier' attribute.`);
                }

                // Check SCORM namespaces
                const xmlns = manifest['@_xmlns'];
                if (!xmlns) {
                  logError(`Missing 'xmlns' declaration.`);
                } else {
                  logInfo(`Namespace: ${xmlns}`);
                }

                let defaultOrgId = null;
                if (!manifest.organizations) {
                  logError(`<organizations> element is missing.`);
                } else {
                  defaultOrgId = manifest.organizations['@_default'];
                  if (!defaultOrgId) {
                    logError(`No 'default' attribute found on <organizations>.`);
                  } else {
                    logSuccess(`Organizations default ID: ${defaultOrgId}`);
                  }
                  
                  const orgs = manifest.organizations.organization;
                  if (!orgs) {
                    logError(`No <organization> element found.`);
                  } else {
                    const orgList = Array.isArray(orgs) ? orgs : [orgs];
                    const defaultOrg = orgList.find(o => o['@_identifier'] === defaultOrgId);
                    if (!defaultOrg) {
                      logError(`Default organization '${defaultOrgId}' not found.`);
                    } else {
                      logSuccess(`Default organization matched.`);
                      const items = defaultOrg.item;
                      if (!items) logWarn(`No <item> elements found.`);
                    }
                  }
                }

                if (!manifest.resources || !manifest.resources.resource) {
                  logError(`No <resources> found in manifest.`);
                } else {
                  const resources = Array.isArray(manifest.resources.resource) ? manifest.resources.resource : [manifest.resources.resource];
                  
                  let launchResourceId = null;
                  if (defaultOrgId && manifest.organizations && manifest.organizations.organization) {
                    const orgList = Array.isArray(manifest.organizations.organization) ? manifest.organizations.organization : [manifest.organizations.organization];
                    const defaultOrg = orgList.find(o => o['@_identifier'] === defaultOrgId);
                    if (defaultOrg && defaultOrg.item) {
                      const items = Array.isArray(defaultOrg.item) ? defaultOrg.item : [defaultOrg.item];
                      const firstLaunchableItem = items.find(i => i['@_identifierref']);
                      if (firstLaunchableItem) launchResourceId = firstLaunchableItem['@_identifierref'];
                    }
                  }

                  let launchResource = resources.find(r => r['@_identifier'] === launchResourceId) || resources.find(r => r['@_href']);
                  
                  if (launchResource && launchResource['@_href']) {
                    launchUrl = `/courses/${courseId}/${launchResource['@_href']}`;
                    logSuccess(`Launch URL identified: ${launchResource['@_href']}`);
                  } else {
                    logError(`Could not identify launch URL.`);
                  }

                  // Physical file check
                  logInfo(`Verifying physical file presence...`);
                  let missingCount = 0;
                  resources.forEach(resNode => {
                    if (resNode.file) {
                      const files = Array.isArray(resNode.file) ? resNode.file : [resNode.file];
                      files.forEach(f => {
                        if (f['@_href'] && !fs.existsSync(path.join(targetDir, f['@_href']))) {
                          logWarn(`Missing file: ${f['@_href']}`);
                          missingCount++;
                        }
                      });
                    }
                  });
                  if (missingCount === 0) logSuccess(`All referenced files are present.`);
                }
              }
            }

            if (!launchUrl) {
               res.statusCode = 400;
               res.end(JSON.stringify({ error: 'Could not determine launch file.', validationLogs }));
               return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ url: launchUrl, validationLogs }));
            
          } catch (e) {
            console.error('Upload Error:', e);
            logError(`Critical Error: ${e.message}`);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Process failed', validationLogs }));
          }
        });
      });
    }
  };
}
