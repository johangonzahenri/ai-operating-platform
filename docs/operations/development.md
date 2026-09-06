# Development guide

## Prerequisites

Node.js 18 or later. Install the repository's declared development dependencies with `npm install`.

## Verification

Run `npm run check`. This type-checks the full project and runs the unit, integration, and port contract tests. Tests never require credentials, a network provider, a database, or wall-clock assertions.

## Environment

Copy `.env.example` to `.env` only for local configuration. Do not add credentials or a real provider to v0.1.
