import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

/**
 * Validate an extracted SCORM package and find its launch file.
 *
 * Checks, in order: imsmanifest.xml presence, XML well-formedness, ADL XSD
 * conformance (via xmllint, if installed), manifest structure (identifier,
 * namespace, default organization, items, resources) and that every file the
 * manifest references exists on disk.
 *
 * @param {string} dir  Root folder of the extracted package.
 * @param {{ schemaPath?: string, xmllint?: string }} [opts]
 * @returns {{ ok: boolean, launchHref: string | null, logs: {type: string, msg: string}[], error?: string }}
 *   `launchHref` is relative to `dir`. `logs` types: info | warn | error | scorm (success).
 */
export function validatePackage(dir, opts = {}) {
  const schemaPath = opts.schemaPath ?? path.resolve('schemas/imscp_v1p1.xsd');
  const xmllint = opts.xmllint ?? 'xmllint';

  const logs = [];
  const logInfo = (msg) => logs.push({ type: 'info', msg });
  const logWarn = (msg) => logs.push({ type: 'warn', msg });
  const logError = (msg) => logs.push({ type: 'error', msg });
  const logSuccess = (msg) => logs.push({ type: 'scorm', msg });
  const fail = (error) => ({ ok: false, launchHref: null, logs, error });

  const manifestPath = path.join(dir, 'imsmanifest.xml');

  logInfo(`Checking for imsmanifest.xml...`);
  if (!fs.existsSync(manifestPath)) {
    logError(`imsmanifest.xml is missing from the root of the package.`);
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      logWarn(`Fallback: Found index.html without manifest.`);
      return { ok: true, launchHref: 'index.html', logs };
    }
    return fail('Missing imsmanifest.xml and no index.html fallback found.');
  }
  logSuccess(`imsmanifest.xml found.`);

  const xmlData = fs.readFileSync(manifestPath, 'utf8');

  // 1. Basic XML well-formedness check
  logInfo(`Checking XML well-formedness...`);
  const wellFormed = XMLValidator.validate(xmlData);
  if (wellFormed !== true) {
    logError(`XML Syntax Error: ${wellFormed.err.msg} (Line: ${wellFormed.err.line})`);
    return fail('Manifest contains invalid XML syntax');
  }
  logSuccess(`XML is well-formed.`);

  // 2. Official ADL XSD validation using xmllint (--nonet: only the local patched schemas)
  logInfo(`Running official ADL SCORM XSD validation (xmllint)...`);
  try {
    execFileSync(xmllint, ['--noout', '--nonet', '--schema', schemaPath, manifestPath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    logSuccess(`XSD Validation Passed: imsmanifest.xml conforms to SCORM schemas.`);
  } catch (xsdErr) {
    if (xsdErr.code === 'ENOENT') {
      logWarn(`xmllint is not installed — skipping XSD validation (install libxml2 to enable it).`);
    } else {
      const output = xsdErr.stderr || xsdErr.stdout || xsdErr.message;
      logError(`XSD Validation Failed:\n${output}`);
      // Reported, but not fatal unless it also breaks launching
      logWarn(`The package may not be fully compliant with SCORM 2004 4th Edition.`);
    }
  }

  // 3. Structural parsing
  logInfo(`Analyzing SCORM structural integrity...`);
  let result;
  try {
    result = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xmlData);
  } catch {
    logError(`Failed to parse XML into object model.`);
    return fail('Invalid XML manifest');
  }

  const manifest = result.manifest;
  if (!manifest) {
    logError(`Root <manifest> element is missing.`);
    return fail('Could not determine launch file.');
  }
  logSuccess(`Root <manifest> element is present.`);

  if (!manifest['@_identifier']) logError(`Root <manifest> is missing 'identifier' attribute.`);

  const xmlns = manifest['@_xmlns'];
  if (!xmlns) logError(`Missing 'xmlns' declaration.`);
  else logInfo(`Namespace: ${xmlns}`);

  let defaultOrg = null;
  if (!manifest.organizations) {
    logError(`<organizations> element is missing.`);
  } else {
    const defaultOrgId = manifest.organizations['@_default'];
    if (!defaultOrgId) logError(`No 'default' attribute found on <organizations>.`);
    else logSuccess(`Organizations default ID: ${defaultOrgId}`);

    const orgList = asArray(manifest.organizations.organization);
    if (orgList.length === 0) {
      logError(`No <organization> element found.`);
    } else {
      defaultOrg = orgList.find((o) => o['@_identifier'] === defaultOrgId) ?? null;
      if (!defaultOrg) logError(`Default organization '${defaultOrgId}' not found.`);
      else {
        logSuccess(`Default organization matched.`);
        if (!defaultOrg.item) logWarn(`No <item> elements found.`);
      }
    }
  }

  const resources = asArray(manifest.resources?.resource);
  if (resources.length === 0) {
    logError(`No <resources> found in manifest.`);
    return fail('Could not determine launch file.');
  }

  // Launch resource: the first item with an identifierref, else the first resource with an href
  const firstLaunchable = asArray(defaultOrg?.item).find((i) => i['@_identifierref']);
  const launchResource =
    resources.find((r) => r['@_identifier'] === firstLaunchable?.['@_identifierref']) ||
    resources.find((r) => r['@_href']);

  if (!launchResource?.['@_href']) {
    logError(`Could not identify launch URL.`);
    return fail('Could not determine launch file.');
  }
  logSuccess(`Launch URL identified: ${launchResource['@_href']}`);

  // 4. Physical file check
  logInfo(`Verifying physical file presence...`);
  let missingCount = 0;
  for (const res of resources) {
    for (const f of asArray(res.file)) {
      if (f['@_href'] && !fs.existsSync(path.join(dir, f['@_href']))) {
        logWarn(`Missing file: ${f['@_href']}`);
        missingCount++;
      }
    }
  }
  if (missingCount === 0) logSuccess(`All referenced files are present.`);

  return { ok: true, launchHref: launchResource['@_href'], logs };
}
