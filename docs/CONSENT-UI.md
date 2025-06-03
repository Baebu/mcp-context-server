# 🛡️ User Consent Manager UI

A comprehensive web-based user interface for managing consent requests in your MCP Context Server.

## Features

### Real-Time Consent Management

- **Live consent requests** with detailed risk assessment
- **Immediate response capabilities** (Allow/Deny/Remember)
- **Risk scoring** with security factor analysis
- **WebSocket integration** for instant updates

### Comprehensive History & Audit

- **Complete consent history** with filtering options
- **Security audit log** with risk analysis
- **Decision tracking** by source (user, policy, auto-decision)
- **Export capabilities** for compliance and analysis

### Policy Configuration

- **Visual policy editor** for consent rules
- **Pattern-based rules** (always allow, always deny, require consent)
- **Risk thresholds** for auto-approval/rejection
- **Real-time policy updates** without restart

### Session Monitoring

- **Trust level tracking** based on user decisions
- **Request rate monitoring** for unusual activity
- **Session statistics** and health metrics
- **Emergency stop** functionality

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Launch the Consent UI

```bash
npm run consent-ui
```

### 3. Open in Browser

The UI will be available at:

- **Main Interface**: <http://localhost:3001>
- **Direct Access**: <http://localhost:3001/consent>
- **Health Check**: <http://localhost:3001/health>

## UI Overview

### 🔔 Pending Requests Tab

- View all pending consent requests awaiting your decision
- See detailed risk assessments with security factors
- Respond with Allow, Deny, or Allow & Remember
- Real-time updates as new requests arrive

### 📋 History Tab

- Browse complete consent decision history
- Filter by decision type, operation, and time range
- Track patterns in consent requests
- Clear history when needed

### ⚙️ Policy Tab

- Configure consent policies with pattern matching
- Set auto-approval and auto-rejection thresholds
- Enable/disable risk analysis and security plugins
- Apply changes in real-time

### 🕵️ Audit Log Tab

- View detailed security audit trail
- Filter by risk level and decision source
- Export audit data for compliance
- Track security decision patterns

## Configuration

### Environment Variables

- `CONSENT_UI_PORT`: Port for the UI server (default: 3001)
- `MCP_LOG_LEVEL`: Logging level for consent service

### Policy Configuration

The consent policy supports pattern-based rules:

**Always Allow Patterns:**

```
file_write:*.log
file_write:*.tmp
command_execute:ls
command_execute:pwd
```

**Always Deny Patterns:**

```
command_execute:rm -rf /*
file_delete:**/.ssh/**
recursive_delete:/
```

**Require Consent Patterns:**

```
recursive_delete:*
sensitive_path_access:*
command_execute:sudo *
```

### Risk Analysis

The system performs comprehensive risk analysis based on:

- **Operation type** (file operations, command execution, etc.)
- **Severity level** (low, medium, high, critical)
- **Security patterns** (injection attempts, privilege escalation)
- **Session trust level** (builds over time based on decisions)
- **Plugin evaluations** (extensible security checks)

## API Integration

The consent UI exposes a REST API for integration:

### Endpoints

- `GET /api/consent/session-stats` - Current session statistics
- `GET /api/consent/pending` - Pending consent requests
- `POST /api/consent/respond` - Respond to consent requests
- `GET /api/consent/history` - Consent decision history
- `GET/POST /api/consent/policy` - Policy configuration
- `GET /api/consent/audit` - Security audit log

### WebSocket Events

Real-time events via WebSocket at `/consent-ws`:

- `consent-request` - New consent request
- `consent-decision` - Decision made
- `session-update` - Session statistics update
- `policy-update` - Policy configuration changed

## Security Features

### Risk Assessment

- **Multi-factor risk scoring** (0-100 scale)
- **Pattern-based threat detection**
- **Command injection prevention**
- **Path traversal protection**
- **Privilege escalation detection**

### Trust Management

- **Dynamic trust scoring** based on user behavior
- **Session-based trust levels** (0-100 scale)
- **Trust degradation** over time and with poor decisions
- **Trust rewards** for responsible security decisions

### Emergency Controls

- **Emergency stop button** denies all pending requests
- **Session isolation** prevents cross-session contamination
- **Automatic timeout** for unresponded requests
- **Audit trail** for all security decisions

## Development

### Running in Development Mode

```bash
npm run consent-ui
```

### Simulated Test Data

The UI includes simulated consent requests for testing:

- File write operations
- Command execution requests
- Recursive deletion attempts
- Various risk levels and severities

### Custom Integration

To integrate with your own MCP server:

```typescript
import { UserConsentService } from './src/application/services/user-consent.service.js';
import { startConsentUIServer } from './src/infrastructure/http/consent-server.js';

// Initialize with your consent service
const server = await startConsentUIServer(yourConsentService, 3001);
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
lsof -i :3001

# Or use a different port
CONSENT_UI_PORT=3002 npm run consent-ui
```

### Connection Issues

- Ensure the MCP server is running
- Check firewall settings for port 3001
- Verify WebSocket connections in browser dev tools

### Performance

- The UI keeps only the last 100 history/audit entries in memory
- Larger datasets are paginated on the server side
- WebSocket connections auto-reconnect on failure

## Production Deployment

### Security Considerations

- Use HTTPS in production environments
- Implement proper authentication/authorization
- Configure CORS for specific domains only
- Use environment variables for sensitive configuration

### Monitoring

- Monitor WebSocket connection health
- Track consent response times
- Alert on high-risk operations
- Log all security decisions for compliance

## Support

For issues and feature requests, please use the project's GitHub repository.

---

**🛡️ Keep your MCP operations secure with comprehensive consent management!**
