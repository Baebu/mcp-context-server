// Quick debugging script using tsx to test embedding service
import 'reflect-metadata';
import { Container } from 'inversify';
import { EmbeddingService } from './src/application/services/embedding.service';

async function testEmbedding() {
  try {
    console.log('🧪 Testing EmbeddingService directly...');
    
    // Create a simple container
    const container = new Container();
    
    // Try to create the service
    const embeddingService = new EmbeddingService();
    
    console.log('✅ EmbeddingService created successfully');
    
    // Test initialization
    await embeddingService.initialize();
    console.log('✅ EmbeddingService initialized successfully');
    
    // Test embedding generation
    const testText = "This is a test context for semantic embedding generation.";
    const embedding = await embeddingService.generateEmbedding(testText);
    
    console.log('✅ Embedding generated successfully');
    console.log(`   • Dimensions: ${embedding.length}`);
    console.log(`   • First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    
    // Test similarity calculation
    const embedding2 = await embeddingService.generateEmbedding("Another test text with different content.");
    const similarity = embeddingService.calculateSimilarity(embedding, embedding2);
    
    console.log('✅ Similarity calculation successful');
    console.log(`   • Similarity score: ${(similarity * 100).toFixed(2)}%`);
    
    console.log('🎉 All embedding tests passed!');
    
  } catch (error) {
    console.error('❌ Embedding test failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    if (error.message.includes('tensorflow') || error.message.includes('tfjs')) {
      console.log('\n💡 TensorFlow.js related error detected');
      console.log('   This might be due to missing TensorFlow.js dependencies or initialization issues');
    }
    
    if (error.message.includes('import') || error.message.includes('module')) {
      console.log('\n💡 Module import error detected');
      console.log('   This might be due to ES module import/export issues');
    }
  }
}

testEmbedding();
