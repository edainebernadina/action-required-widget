const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');
const version = packageJson.version;
const widgetName = packageJson.name;

const outputPath = path.join(__dirname, `../dist/widget-${widgetName}-${version}.zip`);
const distPath = path.join(__dirname, '../dist');

const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', {
  zlib: { level: 9 },
});

output.on('close', function () {
  console.log('\n✅ Widget package created successfully!');
  console.log(`📦 Total bytes: ${archive.pointer()}`);
  console.log(`📍 Location: ${outputPath}\n`);
});

archive.on('error', function (err) {
  throw err;
});

archive.pipe(output);

const schemaSource = path.join(__dirname, '../schema.json');
const schemaDest = path.join(distPath, 'schema.json');
fs.copyFileSync(schemaSource, schemaDest);

archive.directory(distPath, false);
archive.finalize();
