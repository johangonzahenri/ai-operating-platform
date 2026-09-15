const fs = require('fs');
const path = require('path');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Wrote: ${filePath}`);
}

console.log("Generating friendly, beautiful visual infographics...");

// 1. Master Architecture SVG with friendly, beautiful visuals
const masterArchSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650" width="1000" height="650" style="background:#0f172a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <defs>
    <linearGradient id="coreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="apiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#6d28d9"/>
    </linearGradient>
    <linearGradient id="webGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
    <linearGradient id="appGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Title & Header -->
  <text x="500" y="45" fill="#f8fafc" font-size="24" font-weight="bold" text-anchor="middle">AI OPERATING PLATFORM — MAPA VISUAL MAESTRO</text>
  <text x="500" y="70" fill="#94a3b8" font-size="14" text-anchor="middle">Arquitectura Amigable: Separación Estricta entre el Cerebro, los Controles y las Tiendas</text>

  <!-- Layer 1: Core Engine -->
  <g transform="translate(60, 100)" filter="url(#shadow)">
    <rect width="880" height="110" rx="12" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/>
    <rect x="0" y="0" width="180" height="110" rx="12" fill="url(#coreGrad)"/>
    <text x="90" y="45" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">NIVEL 1</text>
    <text x="90" y="70" fill="#e0e7ff" font-size="14" font-weight="bold" text-anchor="middle">MOTOR CENTRAL</text>
    <text x="90" y="90" fill="#cbd5e1" font-size="11" text-anchor="middle">El Cerebro Puro</text>

    <!-- Subcomponents -->
    <g transform="translate(200, 15)">
      <rect x="0" y="0" width="150" height="80" rx="8" fill="#334155"/>
      <text x="75" y="30" fill="#38bdf8" font-size="13" font-weight="bold" text-anchor="middle">Orquestador</text>
      <text x="75" y="50" fill="#94a3b8" font-size="10" text-anchor="middle">Director de orquesta</text>
      <text x="75" y="65" fill="#94a3b8" font-size="10" text-anchor="middle">Presupuestos y pasos</text>

      <rect x="170" y="0" width="150" height="80" rx="8" fill="#334155"/>
      <text x="245" y="30" fill="#38bdf8" font-size="13" font-weight="bold" text-anchor="middle">Agentes y LLM</text>
      <text x="245" y="50" fill="#94a3b8" font-size="10" text-anchor="middle">Asistentes expertos</text>
      <text x="245" y="65" fill="#94a3b8" font-size="10" text-anchor="middle">Stub / OpenAI / Anthropic</text>

      <rect x="340" y="0" width="150" height="80" rx="8" fill="#334155"/>
      <text x="415" y="30" fill="#38bdf8" font-size="13" font-weight="bold" text-anchor="middle">Herramientas</text>
      <text x="415" y="50" fill="#94a3b8" font-size="10" text-anchor="middle">Las manos del sistema</text>
      <text x="415" y="65" fill="#94a3b8" font-size="10" text-anchor="middle">Validación estricta JSON</text>

      <rect x="510" y="0" width="150" height="80" rx="8" fill="#334155"/>
      <text x="585" y="30" fill="#38bdf8" font-size="13" font-weight="bold" text-anchor="middle">SQLite WAL</text>
      <text x="585" y="50" fill="#94a3b8" font-size="10" text-anchor="middle">El cuaderno notarial</text>
      <text x="585" y="65" fill="#94a3b8" font-size="10" text-anchor="middle">Eventos inmutables</text>
    </g>
  </g>

  <!-- Flow Connector 1 -->
  <path d="M 500 210 L 500 240" stroke="#8b5cf6" stroke-width="3" stroke-dasharray="4" marker-end="url(#arrow)"/>

  <!-- Layer 2: Platform API Gateway -->
  <g transform="translate(60, 240)" filter="url(#shadow)">
    <rect width="880" height="95" rx="12" fill="#1e293b" stroke="#8b5cf6" stroke-width="2"/>
    <rect x="0" y="0" width="180" height="95" rx="12" fill="url(#apiGrad)"/>
    <text x="90" y="40" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">NIVEL 2</text>
    <text x="90" y="62" fill="#ede9fe" font-size="14" font-weight="bold" text-anchor="middle">PLATFORM API</text>
    <text x="90" y="80" fill="#cbd5e1" font-size="11" text-anchor="middle">La Aduana y Enchufe</text>

    <g transform="translate(200, 15)">
      <rect x="0" y="0" width="215" height="65" rx="8" fill="#334155"/>
      <text x="107" y="28" fill="#c084fc" font-size="12" font-weight="bold" text-anchor="middle">Seguridad Default-Deny</text>
      <text x="107" y="48" fill="#94a3b8" font-size="10" text-anchor="middle">Todo bloqueado por defecto</text>

      <rect x="230" y="0" width="215" height="65" rx="8" fill="#334155"/>
      <text x="337" y="28" fill="#c084fc" font-size="12" font-weight="bold" text-anchor="middle">Rutas REST /api/v1/*</text>
      <text x="337" y="48" fill="#94a3b8" font-size="10" text-anchor="middle">/orchestrate · /tasks · /health</text>

      <rect x="460" y="0" width="200" height="65" rx="8" fill="#334155"/>
      <text x="560" y="28" fill="#c084fc" font-size="12" font-weight="bold" text-anchor="middle">Trazabilidad TraceId</text>
      <text x="560" y="48" fill="#94a3b8" font-size="10" text-anchor="middle">Seguimiento punto a punto</text>
    </g>
  </g>

  <!-- Flow Connector 2 -->
  <path d="M 500 335 L 500 365" stroke="#10b981" stroke-width="3" stroke-dasharray="4"/>

  <!-- Layer 3: Web Console & Showcase -->
  <g transform="translate(60, 365)" filter="url(#shadow)">
    <rect width="880" height="95" rx="12" fill="#1e293b" stroke="#10b981" stroke-width="2"/>
    <rect x="0" y="0" width="180" height="95" rx="12" fill="url(#webGrad)"/>
    <text x="90" y="40" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">NIVEL 3</text>
    <text x="90" y="62" fill="#d1fae5" font-size="14" font-weight="bold" text-anchor="middle">CONSOLA WEB</text>
    <text x="90" y="80" fill="#cbd5e1" font-size="11" text-anchor="middle">Tablero de Control</text>

    <g transform="translate(200, 15)">
      <rect x="0" y="0" width="215" height="65" rx="8" fill="#334155"/>
      <text x="107" y="28" fill="#34d399" font-size="12" font-weight="bold" text-anchor="middle">Showcase Interactivo</text>
      <text x="107" y="48" fill="#94a3b8" font-size="10" text-anchor="middle">Demostración en vivo en 1 clic</text>

      <rect x="230" y="0" width="215" height="65" rx="8" fill="#334155"/>
      <text x="337" y="28" fill="#34d399" font-size="12" font-weight="bold" text-anchor="middle">Panel de Gobernanza</text>
      <text x="337" y="48" fill="#94a3b8" font-size="10" text-anchor="middle">Matriz de riesgos y permisos</text>

      <rect x="460" y="0" width="200" height="65" rx="8" fill="#334155"/>
      <text x="560" y="28" fill="#34d399" font-size="12" font-weight="bold" text-anchor="middle">Cero Vulnerabilidades</text>
      <text x="560" y="48" fill="#94a3b8" font-size="10" text-anchor="middle">100% puro en el DOM</text>
    </g>
  </g>

  <!-- Flow Connector 3 -->
  <path d="M 500 460 L 500 490" stroke="#f59e0b" stroke-width="3" stroke-dasharray="4"/>

  <!-- Layer 4: External Applications -->
  <g transform="translate(60, 490)" filter="url(#shadow)">
    <rect width="880" height="120" rx="12" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
    <rect x="0" y="0" width="180" height="120" rx="12" fill="url(#appGrad)"/>
    <text x="90" y="48" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">NIVEL 4</text>
    <text x="90" y="72" fill="#fef3c7" font-size="13" font-weight="bold" text-anchor="middle">APLICACIONES</text>
    <text x="90" y="92" fill="#cbd5e1" font-size="11" text-anchor="middle">Los Negocios Reales</text>

    <g transform="translate(200, 15)">
      <!-- Tentaciones Card (Active) -->
      <rect x="0" y="0" width="325" height="90" rx="8" fill="#334155" stroke="#10b981" stroke-width="1.5"/>
      <circle cx="20" cy="22" r="6" fill="#10b981"/>
      <text x="35" y="26" fill="#f8fafc" font-size="13" font-weight="bold">Tentaciones AI Commerce (ACTIVA)</text>
      <text x="20" y="48" fill="#94a3b8" font-size="11">Moda, calzado y probador virtual 3D/AR</text>
      <text x="20" y="66" fill="#cbd5e1" font-size="10">Dueña de: Catálogo real, Carrito, Precios y Stock</text>

      <!-- Vehicle Parts Card (Planned) -->
      <rect x="345" y="0" width="315" height="90" rx="8" fill="#1e293b" stroke="#64748b" stroke-dasharray="4"/>
      <circle cx="365" cy="22" r="6" fill="#64748b"/>
      <text x="380" y="26" fill="#94a3b8" font-size="13" font-weight="bold">Vehicle Parts &amp; Support (DISEÑADA)</text>
      <text x="365" y="48" fill="#64748b" font-size="11">Diagnóstico industrial y mesa de ayuda</text>
      <text x="365" y="66" fill="#64748b" font-size="10">Estado: Contrato arquitectónico listo</text>
    </g>
  </g>
</svg>
`;
writeFile("docs/assets/master-architecture.svg", masterArchSvg);

// 2. Golden Journey SVG with friendly step annotations
const goldenJourneySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 480" width="1000" height="480" style="background:#0f172a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <defs>
    <linearGradient id="stepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <filter id="shadow2" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>

  <text x="500" y="40" fill="#f8fafc" font-size="22" font-weight="bold" text-anchor="middle">EL VIAJE DE ORO (GOLDEN JOURNEY) EXPLICADO FÁCIL</text>
  <text x="500" y="65" fill="#94a3b8" font-size="13" text-anchor="middle">Ejemplo real: "Quiero unas zapatillas negras para correr maratón y ver cómo me quedan en 3D"</text>

  <!-- Step 1 -->
  <g transform="translate(40, 100)" filter="url(#shadow2)">
    <rect width="165" height="320" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
    <rect width="165" height="45" rx="10" fill="url(#stepGrad)"/>
    <text x="82" y="28" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">1. INTENCIÓN</text>
    <text x="82" y="75" fill="#38bdf8" font-size="24" text-anchor="middle">💬</text>
    <text x="82" y="110" fill="#f8fafc" font-size="12" font-weight="bold" text-anchor="middle">Cliente Escribe</text>
    <text x="82" y="135" fill="#cbd5e1" font-size="10" text-anchor="middle">"Zapatillas negras</text>
    <text x="82" y="150" fill="#cbd5e1" font-size="10" text-anchor="middle">para maratón"</text>
    <rect x="15" y="180" width="135" height="115" rx="6" fill="#334155"/>
    <text x="82" y="205" fill="#a7f3d0" font-size="10" font-weight="bold" text-anchor="middle">Acción de la IA:</text>
    <text x="82" y="225" fill="#94a3b8" font-size="9" text-anchor="middle">Extrae palabras clave</text>
    <text x="82" y="240" fill="#94a3b8" font-size="9" text-anchor="middle">sin modificar datos.</text>
    <text x="82" y="270" fill="#34d399" font-size="10" font-weight="bold" text-anchor="middle">Riesgo: BAJO</text>
  </g>

  <!-- Arrow 1 -->
  <text x="220" y="260" fill="#38bdf8" font-size="20" text-anchor="middle">&rarr;</text>

  <!-- Step 2 -->
  <g transform="translate(235, 100)" filter="url(#shadow2)">
    <rect width="165" height="320" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
    <rect width="165" height="45" rx="10" fill="url(#stepGrad)"/>
    <text x="82" y="28" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">2. BÚSQUEDA</text>
    <text x="82" y="75" fill="#38bdf8" font-size="24" text-anchor="middle">🔍</text>
    <text x="82" y="110" fill="#f8fafc" font-size="12" font-weight="bold" text-anchor="middle">Catálogo Real</text>
    <text x="82" y="135" fill="#cbd5e1" font-size="10" text-anchor="middle">Consulta el stock</text>
    <text x="82" y="150" fill="#cbd5e1" font-size="10" text-anchor="middle">en Tentaciones Shop</text>
    <rect x="15" y="180" width="135" height="115" rx="6" fill="#334155"/>
    <text x="82" y="205" fill="#a7f3d0" font-size="10" font-weight="bold" text-anchor="middle">Seguridad:</text>
    <text x="82" y="225" fill="#94a3b8" font-size="9" text-anchor="middle">Precios reales</text>
    <text x="82" y="240" fill="#94a3b8" font-size="9" text-anchor="middle">Zero alucinaciones</text>
    <text x="82" y="270" fill="#34d399" font-size="10" font-weight="bold" text-anchor="middle">3 Candidatos</text>
  </g>

  <!-- Arrow 2 -->
  <text x="415" y="260" fill="#38bdf8" font-size="20" text-anchor="middle">&rarr;</text>

  <!-- Step 3 -->
  <g transform="translate(430, 100)" filter="url(#shadow2)">
    <rect width="165" height="320" rx="10" fill="#1e293b" stroke="#8b5cf6" stroke-width="1.5"/>
    <rect width="165" height="45" rx="10" fill="linear-gradient(135deg, #8b5cf6, #6d28d9)"/>
    <text x="82" y="28" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">3. PROBADOR 3D</text>
    <text x="82" y="75" fill="#c084fc" font-size="24" text-anchor="middle">👟</text>
    <text x="82" y="110" fill="#f8fafc" font-size="12" font-weight="bold" text-anchor="middle">Probador AR</text>
    <text x="82" y="135" fill="#cbd5e1" font-size="10" text-anchor="middle">Activa modelo 3D</text>
    <text x="82" y="150" fill="#cbd5e1" font-size="10" text-anchor="middle">Avatar: "Nova"</text>
    <rect x="15" y="180" width="135" height="115" rx="6" fill="#334155"/>
    <text x="82" y="205" fill="#c084fc" font-size="10" font-weight="bold" text-anchor="middle">Tallas y Medidas:</text>
    <text x="82" y="225" fill="#94a3b8" font-size="9" text-anchor="middle">25.5 cm pie</text>
    <text x="82" y="240" fill="#94a3b8" font-size="9" text-anchor="middle">&rarr; Talla 40 recomendada</text>
    <text x="82" y="270" fill="#fbbf24" font-size="10" font-weight="bold" text-anchor="middle">Riesgo: MEDIO</text>
  </g>

  <!-- Arrow 3 -->
  <text x="610" y="260" fill="#8b5cf6" font-size="20" text-anchor="middle">&rarr;</text>

  <!-- Step 4 -->
  <g transform="translate(625, 100)" filter="url(#shadow2)">
    <rect width="165" height="320" rx="10" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
    <rect width="165" height="45" rx="10" fill="linear-gradient(135deg, #f59e0b, #d97706)"/>
    <text x="82" y="28" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">4. CARRITO</text>
    <text x="82" y="75" fill="#fbbf24" font-size="24" text-anchor="middle">🛒</text>
    <text x="82" y="110" fill="#f8fafc" font-size="12" font-weight="bold" text-anchor="middle">Confirmación</text>
    <text x="82" y="135" fill="#cbd5e1" font-size="10" text-anchor="middle">Prepara la orden</text>
    <text x="82" y="150" fill="#cbd5e1" font-size="10" text-anchor="middle">con descuento 10%</text>
    <rect x="15" y="180" width="135" height="115" rx="6" fill="#334155"/>
    <text x="82" y="205" fill="#fbbf24" font-size="10" font-weight="bold" text-anchor="middle">Control Humano:</text>
    <text x="82" y="225" fill="#94a3b8" font-size="9" text-anchor="middle">La IA NO cobra sola.</text>
    <text x="82" y="240" fill="#94a3b8" font-size="9" text-anchor="middle">Pide confirmación.</text>
    <text x="82" y="270" fill="#f87171" font-size="10" font-weight="bold" text-anchor="middle">Riesgo: ALTO</text>
  </g>

  <!-- Arrow 4 -->
  <text x="805" y="260" fill="#f59e0b" font-size="20" text-anchor="middle">&rarr;</text>

  <!-- Step 5 -->
  <g transform="translate(820, 100)" filter="url(#shadow2)">
    <rect width="145" height="320" rx="10" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/>
    <rect width="145" height="45" rx="10" fill="linear-gradient(135deg, #10b981, #059669)"/>
    <text x="72" y="28" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">5. AUDITORÍA</text>
    <text x="72" y="75" fill="#34d399" font-size="24" text-anchor="middle">📋</text>
    <text x="72" y="110" fill="#f8fafc" font-size="12" font-weight="bold" text-anchor="middle">Registro Total</text>
    <text x="72" y="135" fill="#cbd5e1" font-size="10" text-anchor="middle">SQLite WAL</text>
    <text x="72" y="150" fill="#cbd5e1" font-size="10" text-anchor="middle">TraceId guardado</text>
    <rect x="12" y="180" width="121" height="115" rx="6" fill="#334155"/>
    <text x="72" y="205" fill="#34d399" font-size="10" font-weight="bold" text-anchor="middle">Inmutable:</text>
    <text x="72" y="225" fill="#94a3b8" font-size="9" text-anchor="middle">Todo guardado en</text>
    <text x="72" y="240" fill="#94a3b8" font-size="9" text-anchor="middle">el libro contable.</text>
    <text x="72" y="270" fill="#34d399" font-size="10" font-weight="bold" text-anchor="middle">100% Auditado</text>
  </g>
</svg>
`;
writeFile("docs/assets/golden-journey.svg", goldenJourneySvg);

console.log("Infographics updated successfully.");
