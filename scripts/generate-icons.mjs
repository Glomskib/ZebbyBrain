import fs from 'node:fs';
import sharp from 'sharp';

const out = 'client/public';
const srcCandidates = [
  'client/public/logo.png',
  'client/public/logo.svg',
  'public/logo.png',
  'public/logo.svg',
];
let src = srcCandidates.find(p => fs.existsSync(p));

if (!src) {
  // fallback: create a basic SVG tile with zebra emoji
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect width="100%" height="100%" fill="#8b5cf6"/>
    <text x="50%" y="54%" font-size="520" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">🦓</text>
  </svg>`;
  src = 'client/public/tmp-logo.svg';
  fs.writeFileSync(src, svg);
}

console.log('Generating icons from:', src);

await sharp(src).resize(192, 192).png().toFile(`${out}/icon-192.png`);
console.log('✓ Created icon-192.png');

await sharp(src).resize(512, 512).png().toFile(`${out}/icon-512.png`);
console.log('✓ Created icon-512.png');

// Clean up temp file if created
if (fs.existsSync('client/public/tmp-logo.svg')) {
  fs.unlinkSync('client/public/tmp-logo.svg');
}

console.log('Icons generated successfully in', out);
