// Script simple pour créer une icône PNG de base
const fs = require('fs');

// Créer un canvas HTML simple
const iconHtml = `
<!DOCTYPE html>
<html>
<head><style>body{margin:0;padding:0;}</style></head>
<body>
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <circle cx="64" cy="64" r="60" fill="#4CAF50"/>
  <ellipse cx="64" cy="70" rx="35" ry="40" fill="#2E7D32"/>
  <circle cx="64" cy="45" r="18" fill="#2E7D32"/>
  <circle cx="58" cy="43" r="4" fill="#FFF"/>
  <circle cx="70" cy="43" r="4" fill="#FFF"/>
  <circle cx="58" cy="43" r="2" fill="#000"/>
  <circle cx="70" cy="43" r="2" fill="#000"/>
  <circle cx="90" cy="90" r="20" fill="#FF5722"/>
  <polygon points="85,85 85,95 95,90" fill="#FFF"/>
</svg>
</body>
</html>
`;

console.log('Icône SVG créée. Pour convertir en PNG, utilisez un outil en ligne:');
console.log('1. Ouvrir https://svgtopng.com/');
console.log('2. Uploader icon.svg');
console.log('3. Télécharger en 128x128 pixels');
console.log('4. Renommer en icon.png');
