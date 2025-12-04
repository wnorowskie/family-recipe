# Test Directory

This directory contains all automated tests for the Family Recipe application.

## Structure

```
__tests__/
├── unit/                    # Unit tests for individual functions/modules
│   ├── lib/                # Tests for business logic helpers
│   └── helpers/            # Shared test utilities
├── integration/            # API integration tests
│   ├── api/               # API route tests organized by endpoint
│   │   ├── auth/
│   │   ├── posts/
│   │   ├── comments/
│   │   ├── reactions/
│   │   ├── timeline/
│   │   ├── recipes/
│   │   ├── profile/
│   │   └── family/
│   └── helpers/           # Integration test helpers
└── fixtures/              # Test data fixtures (JSON)
```

## Running Tests

See the main [TESTING.md](../docs/TESTING.md) for complete documentation.

Quick commands:

- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- `npm run test:unit` - Run only unit tests
- `npm run test:integration` - Run only integration tests
