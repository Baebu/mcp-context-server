// Simple MCP Server Test - Minimal Version
// Run: npm exec tsx test-mcp-minimal.ts

import 'reflect-metadata';
import { Container } from 'inversify';
import { loadConfig } from './src/infrastructure/config/loader';

async function testMinimalSetup() {
  try {
    console.log('🧪 Testing minimal MCP server setup...');
    
    // Test 1: Config loading
    console.log('📋 Loading configuration...');
    const config = await loadConfig();
    console.log('✅ Configuration loaded successfully');
    console.log(`   Database path: ${config.database.path}`);
    
    // Test 2: DI Container
    console.log('🔧 Setting up DI container...');
    const container = new Container({ autoBindInjectable: true });
    container.bind('Config').toConstantValue(config);
    console.log('✅ DI container created successfully');
    
    // Test 3: EmbeddingService (direct import)
    console.log('🧠 Testing EmbeddingService import...');
    const { EmbeddingService } = await import('./src/application/services/embedding.service');
    const embeddingService = new EmbeddingService();
    await embeddingService.initialize();
    console.log('✅ EmbeddingService working correctly');
    
    // Test 4: Enhanced Database Operations Tool (the problematic one)
    console.log('🔧 Testing Enhanced Database Operations Tool...');
    try {
      const { EnhancedStoreContextTool } = await import('./src/application/tools/enhanced-database-operations.tool');
      console.log('✅ Enhanced Database Operations Tool imported successfully');
    } catch (toolError) {
      console.error('❌ Enhanced Database Operations Tool import failed:', toolError.message);
      console.log('This was likely the source of your embedding error!');
    }
    
    console.log('\n🎉 Minimal setup test completed successfully!');
    console.log('✅ Your embedding error should now be resolved!');
    
  } catch (error) {
    console.error('❌ Minimal setup test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testMinimalSetup();
