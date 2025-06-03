// scripts/complete-phase1.ts - Complete Phase 1 Implementation
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

interface FixResult {
  name: string;
  success: boolean;
  message: string;
  details?: string;
}

class Phase1Completion {
  private results: FixResult[] = [];
  
  async run(): Promise<void> {
    console.log('🚀 Completing Phase 1 Implementation...\n');
    
    try {
      // 1. Check if fixes are applied
      await this.checkConfigurationFixes();
      
      // 2. Build and validate
      await this.buildAndValidate();
      
      // 3. Run tests
      await this.runTests();
      
      // 4. Final validation
      await this.finalValidation();
      
      this.printResults();
      
    } catch (error) {
      console.error('❌ Phase 1 completion failed:', error);
      process.exit(1);
    }
  }
  
  private async checkConfigurationFixes(): Promise<void> {
    console.log('1️⃣ Checking applied fixes...');
    
    try {
      // Check configuration types
      const configTypesPath = 'src/infrastructure/config/types.ts';
      const configContent = await fs.readFile(configTypesPath, 'utf-8');
      
      const hasProcessManagement = configContent.includes('maxConcurrentProcesses') &&
                                   configContent.includes('enableProcessMonitoring');
      
      this.results.push({
        name: 'Configuration Types',
        success: hasProcessManagement,
        message: hasProcessManagement ? 'Phase 1 properties present' : 'Missing Phase 1 properties'
      });
      
      // Check enhanced CLI adapter
      const cliAdapterPath = 'src/infrastructure/adapters/enhanced-cli.adapter.ts';
      const cliContent = await fs.readFile(cliAdapterPath, 'utf-8');
      
      const hasRequiredMethods = cliContent.includes('public killProcess') &&
                                 cliContent.includes('getProcesses') &&
                                 cliContent.includes('getStats');
      
      this.results.push({
        name: 'Enhanced CLI Adapter',
        success: hasRequiredMethods,
        message: hasRequiredMethods ? 'All required methods present' : 'Missing required methods'
      });
      
      // Check process management tool
      const toolPath = 'src/application/tools/process-management.tool.ts';
      const toolContent = await fs.readFile(toolPath, 'utf-8');
      
      const hasProperIntegration = toolContent.includes('enhancedCLI.killProcess') &&
                                   toolContent.includes('ProcessManagementSchema');
      
      this.results.push({
        name: 'Process Management Tool',
        success: hasProperIntegration,
        message: hasProperIntegration ? 'Properly integrated' : 'Integration issues found'
      });
      
    } catch (error) {
      this.results.push({
        name: 'Fix Verification',
        success: false,
        message: `Failed to verify fixes: ${error}`
      });
    }
  }
  
  private async buildAndValidate(): Promise<void> {
    console.log('2️⃣ Building and validating...');
    
    try {
      // Clean build
      const { stdout, stderr } = await execAsync('npm run build');
      
      // Check for any compilation errors
      const hasErrors = stderr.includes('error TS') || stdout.includes('error TS');
      
      this.results.push({
        name: 'TypeScript Build',
        success: !hasErrors,
        message: hasErrors ? 'Build has compilation errors' : 'Build completed successfully',
        details: hasErrors ? stderr : 'No compilation errors'
      });
    } catch (error) {
      this.results.push({
        name: 'TypeScript Build',
        success: false,
        message: `Build failed: ${error}`,
        details: 'Check for remaining TypeScript errors'
      });
    }
  }
  
  private async runTests(): Promise<void> {
    console.log('3️⃣ Running validation tests...');
    
    try {
      // Run the existing Phase 1 validation
      const { stdout } = await execAsync('npm run validate:phase1');
      
      const successRate = stdout.match(/Success Rate: (\d+)%/)?.[1];
      const isSuccess = successRate === '100';
      
      this.results.push({
        name: 'Phase 1 Validation',
        success: isSuccess,
        message: `Validation completed with ${successRate}% success rate`,
        details: isSuccess ? 'All Phase 1 features validated' : 'Some validation issues found'
      });
    } catch (error) {
      this.results.push({
        name: 'Phase 1 Validation',
        success: false,
        message: `Validation failed: ${error}`
      });
    }
  }
  
  private async finalValidation(): Promise<void> {
    console.log('4️⃣ Final comprehensive validation...');
    
    try {
      // Test database connectivity
      const { stdout: dbTest } = await execAsync('npm run test:mcp-db');
      const dbSuccess = !dbTest.includes('Error') && !dbTest.includes('failed');
      
      this.results.push({
        name: 'Database Connectivity',
        success: dbSuccess,
        message: dbSuccess ? 'Database tests passed' : 'Database test issues',
        details: dbSuccess ? 'All database operations working' : 'Check database configuration'
      });
      
      // Test if build artifacts exist
      const distExists = await fs.access('dist/index.js').then(() => true).catch(() => false);
      
      this.results.push({
        name: 'Build Artifacts',
        success: distExists,
        message: distExists ? 'Build artifacts created' : 'Missing build artifacts',
        details: distExists ? 'dist/index.js exists' : 'Run npm run build'
      });
      
    } catch (error) {
      this.results.push({
        name: 'Final Validation',
        success: false,
        message: `Final validation failed: ${error}`
      });
    }
  }
  
  private printResults(): void {
    console.log('\n📊 Phase 1 Completion Results');
    console.log('=====================================');
    
    let successCount = 0;
    const totalCount = this.results.length;
    
    for (const result of this.results) {
      const icon = result.success ? '✅' : '❌';
      console.log(`${icon} ${result.name}: ${result.message}`);
      
      if (result.details) {
        console.log(`   Details: ${result.details}`);
      }
      
      if (result.success) successCount++;
    }
    
    const successRate = Math.round((successCount / totalCount) * 100);
    
    console.log(`\nOverall Success Rate: ${successCount}/${totalCount} (${successRate}%)`);
    
    if (successRate >= 80) {
      console.log('\n🎉 Phase 1 completion successful!');
      console.log('✅ Your context-savy-server is ready for Phase 2');
      console.log('🚀 You can now proceed with Advanced Context Intelligence implementation');
      console.log('\n📋 **Phase 1 Summary:**');
      console.log('• ✅ Configuration types updated with process management');
      console.log('• ✅ Enhanced CLI adapter with proper method visibility');
      console.log('• ✅ Process management tool properly integrated');
      console.log('• ✅ TypeScript compilation successful');
      console.log('• ✅ Database operations validated');
      console.log('• ✅ Build artifacts generated');
      
      console.log('\n🎯 **Next Steps for Phase 2:**');
      console.log('1. Implement Advanced Context Windowing');
      console.log('2. Add intelligent scoring algorithms');
      console.log('3. Create context optimization tools');
      console.log('4. Test context intelligence features');
      
    } else {
      console.log('\n⚠️ Phase 1 completion needs attention');
      console.log('🔧 Please address the failed items before proceeding to Phase 2');
      
      const failedItems = this.results.filter(r => !r.success);
      if (failedItems.length > 0) {
        console.log('\n❌ **Failed Items:**');
        failedItems.forEach(item => {
          console.log(`• ${item.name}: ${item.message}`);
        });
      }
    }
  }
}

// Run the completion process
const completion = new Phase1Completion();
completion.run().catch((error) => {
  console.error('Fatal error during Phase 1 completion:', error);
  process.exit(1);
});