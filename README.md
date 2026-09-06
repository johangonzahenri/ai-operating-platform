# AI Operating Platform

An enterprise AI engine that provides reusable operational primitives for a future platform product and independent applications.

## v0.3 status

The Core Engine now includes observability and governance boundaries. Correlated events feed isolated audit/metrics adapters, while policies explicitly allow or deny declared operations before model/tool invocation. Real providers, autonomous agents, RAG, authentication, APIs and persistent storage remain out of scope.

## Quick start

```bash
npm install
npm run check
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries and [ROADMAP.md](ROADMAP.md) for the next increments.

The reference product model—including the separation between Core Engine, future Platform API/Web Platform, and applications such as AI Commerce—is in [PRODUCT_MODEL.md](docs/product/PRODUCT_MODEL.md).
