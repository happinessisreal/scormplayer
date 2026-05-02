import { XMLValidator } from 'fast-xml-parser';

const badXml = `<manifest><organizations><organization></organizations></manifest>`;
const result = XMLValidator.validate(badXml);

console.log("Validation Result:", result);
