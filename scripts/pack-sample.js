// Zip examples/sample-course/ into examples/sample-course.zip (ready to upload in the player).
import AdmZip from 'adm-zip';

const zip = new AdmZip();
zip.addLocalFolder('examples/sample-course');
zip.writeZip('examples/sample-course.zip');
console.log('wrote examples/sample-course.zip');
