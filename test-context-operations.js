#!/usr/bin/env node

// test-context-operations.js
// Test script to verify MCP Context Server functionality

const testCases = [
  {
    name: 'Store Context (Correct Format)',
    method: 'tools/call',
    params: {
      name: 'store_context',
      arguments: {
        key: 'test_project_fixed',
        value: {
          title: 'Sample Web Application',
          description: 'A full-stack web application with React frontend and Node.js backend',
          features: ['user authentication', 'dashboard', 'data visualization'],
          tech_stack: ['React', 'Node.js', 'MongoDB'],
          status: 'active',
          priority: 'high'
        },
        type: 'project'
      }
    }
  },
  {
    name: 'Store Context (Backward Compatible)',
    method: 'tools/call',
    params: {
      name: 'store_context',
      arguments: {
        key: 'meeting_notes_fixed',
        content:
          'Sprint planning meeting: discussed upcoming features, resolved technical debt priorities, assigned tasks for next iteration.',
        metadata: JSON.stringify({
          type: 'meeting_notes',
          date: '2025-05-31',
          participants: ['dev_team', 'product_manager'],
          topics: ['sprint_planning', 'technical_debt', 'task_assignment']
        })
      }
    }
  },
  {
    name: 'Retrieve Context',
    method: 'tools/call',
    params: {
      name: 'get_context',
      arguments: {
        key: 'test_project_fixed'
      }
    }
  },
  {
    name: 'Query All Contexts',
    method: 'tools/call',
    params: {
      name: 'query_context',
      arguments: {
        limit: 10
      }
    }
  },
  {
    name: 'Query by Type',
    method: 'tools/call',
    params: {
      name: 'query_context',
      arguments: {
        type: 'project',
        limit: 5
      }
    }
  },
  {
    name: 'Create Smart Path (Correct Format)',
    method: 'tools/call',
    params: {
      name: 'create_smart_path',
      arguments: {
        name: 'project_bundle',
        type: 'item_bundle',
        definition: {
          items: ['test_project_fixed', 'meeting_notes_fixed'],
          metadata: {
            description: 'Bundle project info with related meeting notes',
            created_by: 'test_script'
          }
        }
      }
    }
  },
  {
    name: 'Create Smart Path (Backward Compatible)',
    method: 'tools/call',
    params: {
      name: 'create_smart_path',
      arguments: {
        path_name: 'legacy_project_bundle',
        context_keys: JSON.stringify(['test_project_fixed', 'meeting_notes_fixed']),
        description: 'Legacy format bundle for testing backward compatibility'
      }
    }
  },
  {
    name: 'List Smart Paths',
    method: 'tools/call',
    params: {
      name: 'list_smart_paths',
      arguments: {}
    }
  }
];

console.log('🧪 MCP Context Server Test Cases');
console.log('='.repeat(50));
console.log();

testCases.forEach((testCase, index) => {
  console.log(`${index + 1}. ${testCase.name}`);
  console.log('   Request:');
  console.log(JSON.stringify(testCase, null, 6));
  console.log();
  console.log('   Expected: Success with appropriate response');
  console.log('-'.repeat(40));
  console.log();
});

console.log('📋 Instructions:');
console.log('1. Apply the provided fixes to your codebase');
console.log('2. Rebuild: npm run build');
console.log('3. Restart your MCP server');
console.log('4. Test each case above through Claude Desktop');
console.log('5. Verify that contexts are stored and retrieved correctly');
console.log();
console.log('🔧 Key Fixes Applied:');
console.log('- Fixed parameter mapping (content→value, metadata→type)');
console.log('- Added backward compatibility for old parameter names');
console.log('- Fixed smart path parameter validation');
console.log('- Improved database value parsing');
console.log('- Added list_smart_paths tool');
console.log('- Enhanced error handling and logging');
