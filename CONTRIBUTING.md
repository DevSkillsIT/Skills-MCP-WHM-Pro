# Contributing to Skills MCP WHM Pro

First off, thank you for considering contributing to Skills MCP WHM Pro! It's people like you that make this project a great tool for the MSP community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)

---

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to contato@skills-it.com.br.

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/DevSkillsIT/skills-mcp-whm-pro/issues) to avoid duplicates.

**When filing a bug report, include:**
- Clear and descriptive title
- Steps to reproduce the problem
- Expected behavior vs actual behavior
- Screenshots if applicable
- Environment details (Node.js version, OS, WHM version)
- Relevant logs from `pm2 logs mcp-whm-pro`

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- Use a clear and descriptive title
- Detailed description of the proposed functionality
- Use cases: why is this enhancement useful?
- Possible implementation approach (optional)

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:
- `good first issue` - Simple issues perfect for beginners
- `help wanted` - Issues that need assistance

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Write or update tests
5. Ensure all tests pass (`npm test`)
6. Update documentation as needed
7. Commit your changes (see [Commit Message Guidelines](#commit-message-guidelines))
8. Push to your fork (`git push origin feature/amazing-feature`)
9. Open a Pull Request

---

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- Git
- Access to a test WHM server (DO NOT use production!)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/skills-mcp-whm-pro.git
cd skills-mcp-whm-pro

# Add upstream remote
git remote add upstream https://github.com/DevSkillsIT/skills-mcp-whm-pro.git

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with test WHM credentials
nano .env
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm test -- --coverage

# Run specific test file
npm test -- tests/whm-service.test.js
```

### Running the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

---

## Pull Request Process

### Before Submitting

1. **Update Documentation**: If your changes affect user-facing functionality, update README.md
2. **Add Tests**: All new features must include tests
3. **Run Tests**: Ensure `npm test` passes with 100% success rate
4. **Check Coverage**: Aim for >70% coverage on new code
5. **Update Schemas**: If adding/modifying tools, update `schemas/mcp-tools.json`
6. **Test Examples**: If adding tools, add usage examples to `schemas/examples.json`

### Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring without functional changes
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Scopes:**
- `whm`: WHM-related changes
- `dns`: DNS management changes
- `file`: File operations changes
- `cli`: CLI commands changes
- `security`: Security-related changes
- `api`: API endpoint changes

**Examples:**
```
feat(dns): add support for CAA records
fix(whm): correct timeout handling in account creation
docs(readme): update installation instructions
test(dns): add tests for optimistic locking
```

### PR Review Process

1. **Automated Checks**: All PRs must pass CI tests
2. **Code Review**: At least one maintainer review required
3. **Testing**: Reviewers will test changes on test environment
4. **Documentation Review**: Check if docs are updated/clear
5. **Merge**: Squash and merge after approval

---

## Coding Standards

### JavaScript Style

- **ES6+** syntax
- **2 spaces** for indentation (no tabs)
- **Semicolons** required
- **Single quotes** for strings (except for avoiding escapes)
- **Descriptive variable names** (avoid abbreviations)

### File Organization

```javascript
// 1. Node.js built-in imports
const fs = require('fs');
const path = require('path');

// 2. External package imports
const express = require('express');
const axios = require('axios');

// 3. Internal module imports
const logger = require('./lib/logger');
const metrics = require('./lib/metrics');

// 4. Constants
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;

// 5. Functions (exported first, then private)
async function publicFunction() { }
function privateHelper() { }

// 6. Exports
module.exports = { publicFunction };
```

### Function Documentation

Use JSDoc comments for all exported functions:

```javascript
/**
 * Create a new cPanel account
 * @param {Object} params - Account parameters
 * @param {string} params.username - cPanel username (max 16 chars)
 * @param {string} params.domain - Primary domain
 * @param {string} params.password - Account password
 * @returns {Promise<Object>} Account creation result
 * @throws {Error} If username is invalid or account already exists
 */
async function createAccount(params) {
  // Implementation
}
```

### Error Handling

```javascript
// Use try-catch for async operations
try {
  const result = await whmApiCall();
  return result;
} catch (error) {
  logger.error('WHM API call failed', { error: error.message });
  throw new Error(`Failed to call WHM API: ${error.message}`);
}

// Validate inputs early
function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    throw new Error('Username must be a non-empty string');
  }
  if (username.length > 16) {
    throw new Error('Username must be 16 characters or less');
  }
  if (!/^[a-z0-9]+$/i.test(username)) {
    throw new Error('Username must contain only alphanumeric characters');
  }
}
```

### Security Best Practices

- **Never log credentials**: Use `logger.js` which auto-sanitizes
- **Validate all inputs**: Use Zod schemas
- **Use confirmationToken**: For destructive operations
- **Path validation**: Prevent directory traversal attacks
- **Timeout all network calls**: Use configurable timeouts
- **Handle rate limiting**: Implement exponential backoff

---

## Testing Guidelines

### Test Structure

```javascript
describe('Tool: whm.create_account', () => {
  describe('Input Validation', () => {
    it('should reject invalid username', () => {
      // Test
    });

    it('should reject missing required fields', () => {
      // Test
    });
  });

  describe('Success Cases', () => {
    it('should create account with valid parameters', async () => {
      // Test
    });
  });

  describe('Error Handling', () => {
    it('should handle API timeout gracefully', async () => {
      // Test
    });

    it('should handle duplicate username error', async () => {
      // Test
    });
  });
});
```

### Test Coverage Requirements

- **Minimum 70%** overall coverage
- **100%** coverage for critical paths (destructive operations)
- **100%** coverage for validation functions
- **Integration tests** for all tools

### Mocking External APIs

```javascript
// Mock WHM API calls in tests
jest.mock('../lib/whm-service', () => ({
  callWhmApi: jest.fn()
}));

const whmService = require('../lib/whm-service');

beforeEach(() => {
  whmService.callWhmApi.mockClear();
});

it('should call WHM API with correct parameters', async () => {
  whmService.callWhmApi.mockResolvedValue({ success: true });

  await createAccount({ username: 'test', domain: 'test.com', password: 'pass123' });

  expect(whmService.callWhmApi).toHaveBeenCalledWith({
    function: 'createacct',
    params: expect.objectContaining({
      username: 'test',
      domain: 'test.com'
    })
  });
});
```

---

## Documentation

### README Updates

When adding new features, update:
- Feature list
- Tool table
- Usage examples
- Configuration options

### Schema Documentation

**When adding a new tool:**

1. Add to `schemas/mcp-tools.json`:
```json
{
  "name": "whm.new_tool",
  "description": "Clear description of what this tool does",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param1": {
        "type": "string",
        "description": "Description of parameter"
      }
    },
    "required": ["param1"]
  },
  "category": "WHM Account Management",
  "security": "write"
}
```

2. Add examples to `schemas/examples.json`:
```json
{
  "category": "Account Management",
  "title": "Example usage of new tool",
  "prompt": "Natural language example",
  "tool": "whm.new_tool",
  "parameters": { "param1": "value" },
  "expected_output": "Description of expected result"
}
```

3. Update WHM API reference if needed in `schemas/whm-api-reference.json`

---

## Questions?

Feel free to:
- Open an issue for questions
- Join discussions on GitHub
- Email us at contato@skills-it.com.br

---

**Thank you for contributing to Skills MCP WHM Pro!** 🚀
