import pkg from 'ml-distance';

console.log('Testing ml-distance library...');
console.log('Available functions:', Object.keys(pkg));
console.log('Full package:', pkg);

// Check if cosine is available under a different name
if (pkg.cosine) {
  console.log('Cosine function found!');
} else if (pkg.cosineSimilarity) {
  console.log('Cosine similarity function found!');
} else if (pkg.distance && pkg.distance.cosine) {
  console.log('Cosine distance found in distance submodule!');
} else {
  console.log('Cosine function not found. Available:', Object.keys(pkg));
}
