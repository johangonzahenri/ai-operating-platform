# ADR-001: Separación Core-Plataforma

## Estado
ACEPTADA

## Contexto
El sistema consiste en la ejecución core multi-agente, un producto web/API de plataforma pública, y aplicaciones consumidoras externas. Sin una separación estricta, los modelos de dominio corren el riesgo de acoplarse estrechamente con los formatos de transporte o los requisitos específicos de la aplicación.

## Decisión
Hacer cumplir el invariante fundamental:
CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS
- Core Engine es dueño del ciclo de vida de tareas, planificación, enrutamiento de modelos y políticas de seguridad.
- Platform API/Product es dueña de la serialización HTTP, enrutamiento y superficies de consola.
- External Applications (como Tentaciones AI Commerce) consumen solo a través de la Platform API/Client autenticada.

## Alternativas Consideradas
- Arquitectura monolítica en capas: rechazada debido al alto riesgo de contaminación de dominio entre capas.
- Despliegue de microservicios: rechazada por la simplicidad de ejecución local y velocidad de prueba.

## Consecuencias
- Aislamiento hexagonal limpio y capacidad de prueba.
- Estricta validación en tiempo de compilación y ejecución que previene importaciones de dominio por consumidores externos.
