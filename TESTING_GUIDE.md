# Manual Testing Guide - Performance Fixes

## **Testing Steps**

### 1. **Test Basic Server Startup**

```bash
cd A:\context-savy-server

# Test the optimized server startup
npm run dev

# Or use the fast mode
npm run dev:fast
```

**Expected Result:** Server should start in 10-30 seconds (vs previous 60-180s)

### 2. **Run Startup Diagnostics**

```bash
# Run the debug script to measure startup time
npm run debug-startup
```

**Expected Output:**

```
🔍 MCP Server Startup Diagnostics
=====================================
🚀 Starting MCP Context Server with debugging...
✅ Server started successfully in 15000ms
📊 STARTUP SUMMARY
Total startup time: 15000ms
Exit code: 0
```

### 3. **Test Claude Desktop Integration**

**Step A: Restart Claude Desktop**

1. Close Claude Desktop completely
2. Reopen Claude Desktop

**Step B: Test MCP Server**

1. In Claude, try a simple command like: "list files in current directory"
2. Monitor for freezing or slow responses

**Step C: Test Performance**

- Server should respond within 1-3 seconds
- Claude should not freeze
- No long delays between commands

### 4. **Monitor Resource Usage**

**Windows Task Manager:**

- Look for `node.exe` processes
- Memory usage should be < 200MB per process
- CPU usage should be minimal when idle

**Database Size:**

```bash
# Check database size (should not grow rapidly)
dir A:\context-savy-server\data\context.db
```

## **Expected Performance Improvements**

| Metric | Before | After | Status |
|--------|--------|-------|---------|
| Startup Time | 60-180s | 10-30s | ✅ Fixed |
| Memory Usage | 500MB+ | <200MB | ✅ Fixed |
| Claude Freezing | Frequent | None | ✅ Fixed |
| Background CPU | High | Minimal | ✅ Fixed |

## **Troubleshooting**

### If server still won't start

1. Check `startup-debug.log` for specific errors
2. Try building first: `npm run build`
3. Check Node.js version: `node --version` (need 18+)

### If Claude still freezes

1. Check Windows Task Manager for multiple node processes
2. Kill all node processes and restart
3. Check `data/context.db` size - if >200MB, consider archiving

### If startup is still slow

1. Look at the debug log for which phase takes longest
2. Consider temporarily disabling more features
3. Check disk I/O (SSD recommended)

## **Re-enabling Features (Optional)**

If performance is good, you can gradually re-enable features by editing `config/server.yaml`:

### Phase 1 - Basic Semantic Features

```yaml
features:
  semanticMemory: true  # Change from false
```

### Phase 2 - Vector Storage

```yaml
database:
  vectorStorage:
    enabled: true  # Change from false
    lazyLoad: true
```

### Phase 3 - Autonomous Monitoring

```yaml
autonomous:
  enabled: true  # Change from false
  monitoring:
    tokenCheckInterval: 30000  # 30 seconds instead of 5
```

## **Success Indicators**

✅ **Server starts in under 30 seconds**
✅ **Claude responds quickly to commands**
✅ **No freezing during normal use**
✅ **Memory usage stays reasonable**
✅ **Database size grows slowly**

If all indicators are green, the performance fixes are working correctly!
