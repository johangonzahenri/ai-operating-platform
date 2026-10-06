# Guía de Desarrollo — AI Operating Platform

## Requisitos Previos
- Node.js >= 20.0.0
- npm >= 9.0.0

## Estructura del Repositorio
```text
├── src/
│   ├── domain/               # Entidades de dominio puro, objetos de valor, puertos
│   ├── application/          # Casos de uso, runtime, orquestadores, adaptadores
│   ├── infrastructure/       # Persistencia SQLite, pasarelas de modelo, registro de herramientas
│   ├── platform/             # Platform API v1, enrutador HTTP, Web Console
│   ├── platform-client/      # SDK cliente tipado en TypeScript
│   └── interfaces/           # Raíz de composición y cableado
├── docs/                     # Manual oficial, ADRs, portafolio, casos de estudio
├── tests/                    # Suites de pruebas unitarias, de contrato, de durabilidad y E2E
└── scripts/                  # Scripts auxiliares de compilación y documentación
```

## Comandos de Verificación
```bash
npm run build   # Compilación de TypeScript
npm test        # Ejecución completa de la suite de pruebas (2138 tests)
npm run check   # Verificación de compilación + pruebas
npm start       # Iniciar servidor HTTP en 127.0.0.1:3000
```
