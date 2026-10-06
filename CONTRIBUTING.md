# Contribuir a la AI Operating Platform

Gracias por tu interés en contribuir a la **AI Operating Platform**.

## Código de Conducta e Invariantes Arquitectónicas
Todas las contribuciones deben mantener estrictamente las invariantes centrales del sistema.
1. **Separación de Preocupaciones:** `CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS`.
2. **Pureza Hexagonal:** Las entidades de dominio y los puertos deben tener cero importaciones de infraestructura, HTTP, express o paquetes de aplicaciones externas.
3. **Seguridad Default-Deny:** Cualquier herramienta, capacidad o endpoint nuevo debe estar asegurado por defecto.
4. **Seguridad del DOM:** El código frontend del Web Console nunca debe usar `innerHTML`, `outerHTML`, `eval()` o `document.write()`.
5. **La Verdad Primero:** No se permiten afirmaciones falsas en la documentación o insignias de consola.

## Flujo de Trabajo de Desarrollo
1. Haz un fork y clona el repositorio.
2. Crea una rama de características (`git checkout -b feat/your-feature`).
3. Asegúrate de que TypeScript se construya limpiamente: `npm run build`.
4. Ejecuta todas las pruebas unitarias y de integración: `npm test`. (2138 tests, 0 dependencias en runtime).
5. Haz commit usando el formato de commit convencional (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
6. Envía un Pull Request con una descripción clara y evidencia de verificación.
