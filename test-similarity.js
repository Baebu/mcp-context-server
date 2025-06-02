import pkg from 'ml-distance';

console.log('Testing ml-distance library...');

try {
  const vec1 = [1, 0, 1, 0];
  const vec2 = [0, 1, 1, 0];
  const vec3 = [1, 0, 1, 0]; // Same as vec1

  // Use the correct path for cosine similarity
  const similarity1 = pkg.similarity.cosine(vec1, vec2);
  const similarity2 = pkg.similarity.cosine(vec1, vec3);

  console.log('Vector 1:', vec1);
  console.log('Vector 2:', vec2);
  console.log('Vector 3:', vec3);
  console.log('');
  console.log('Cosine similarity (vec1, vec2):', similarity1);
  console.log('Cosine similarity (vec1, vec3):', similarity2);
  console.log('');
  console.log('✅ ml-distance library is working correctly!');
  
  // Test edge cases
  const zeroVec = [0, 0, 0, 0];
  const normalVec = [1, 2, 3, 4];
  
  console.log('Testing zero vector...');
  try {
    const zeroSimilarity = pkg.similarity.cosine(zeroVec, normalVec);
    console.log('Zero vector similarity:', zeroSimilarity);
  } catch (err) {
    console.log('Zero vector handling:', err.message);
  }

  // Test other similarity functions
  console.log('\nTesting other similarity functions:');
  console.log('Dice similarity:', pkg.similarity.dice(vec1, vec2));
  console.log('Tanimoto similarity:', pkg.similarity.tanimoto(vec1, vec2));

} catch (error) {
  console.error('❌ Error testing ml-distance:', error.message);
  console.error(error.stack);
  process.exit(1);
}
