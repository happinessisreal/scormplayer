import fs from 'fs';
import path from 'path';
import { Schema, Validator } from 'xml-xsd-engine';

const xsdPath = path.resolve('temp-test-suite/software_development/xml/xsd/imscp_v1p1.xsd');
const xmlString = `<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="com.dummy.test"></manifest>`;

try {
  const xsdString = fs.readFileSync(xsdPath, 'utf8');
  // xml-xsd-engine might need to resolve other xsds
  // let's just see what it does
  const schema = new Schema(xsdString);
  const validator = new Validator(schema);
  const result = validator.validate(xmlString);
  console.log("Validation Result:", result);
} catch (e) {
  console.error("Error:", e.message);
}
