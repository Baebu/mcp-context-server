# Security Policy

## Supported Versions

We actively support the following versions of the MCP Context Server:

| Version | Supported |
| ------- | --------- |
| 2.x.x   | ✅ Yes    |
| 1.x.x   | ❌ No     |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability in the MCP Context Server, please report it responsibly.

### How to Report

1. **DO NOT** open a public GitHub issue for security vulnerabilities
2. Send an email to [bae.bu.8@gmail.com](mailto:bae.bu.8@gmail.com) with:
   - A clear description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Any suggested fixes (if available)

### What to Include

- **Subject**: Start with "SECURITY:" followed by a brief description
- **Affected version(s)**: Which versions are affected
- **Environment**: OS, Node.js version, etc.
- **Reproduction steps**: Clear steps to reproduce the vulnerability
- **Impact**: What could an attacker accomplish with this vulnerability
- **Proof of concept**: Code or commands that demonstrate the vulnerability (if safe to include)

### Response Timeline

- **Acknowledgment**: We will acknowledge receipt within 24 hours
- **Initial Response**: We will provide an initial response within 72 hours
- **Updates**: We will provide regular updates on our progress
- **Resolution**: We aim to resolve critical vulnerabilities within 7 days

### Security Best Practices

When using the MCP Context Server:

1. **Configuration Security**:

   - Never commit sensitive configuration files to version control
   - Use environment variables for sensitive data
   - Regularly rotate access tokens and credentials

2. **File System Access**:

   - Limit file system access to necessary directories only
   - Validate all file paths to prevent directory traversal attacks
   - Use appropriate file permissions

3. **Database Security**:

   - Use strong database passwords
   - Limit database access to necessary operations
   - Regularly backup your database securely

4. **Network Security**:
   - Use HTTPS/WSS for all network communications
   - Implement proper authentication and authorization
   - Monitor for unusual network activity

### Security Updates

Security updates will be:

- Released as patch versions (e.g., 2.0.1 → 2.0.2)
- Announced in the GitHub releases page
- Documented in the CHANGELOG.md
- Tagged with `security` label

### Acknowledgments

We appreciate the security research community and will acknowledge responsible disclosure in our release notes (unless you prefer to remain anonymous).

## Contact

For security-related questions or concerns:

- Email: [bae.bu.8@gmail.com](mailto:bae.bu.8@gmail.com)
- Include "SECURITY" in the subject line

Thank you for helping keep the MCP Context Server secure!
