// Función serverless (Vercel) — analiza un plano o descripción y devuelve la
// estructura de unidades de una obra. La API key vive SOLO aquí (variable de
// entorno ANTHROPIC_API_KEY en Vercel), nunca en el navegador.
//
// POST { descripcion?: string, imagen?: base64, mediaType?: string }
//  -> { ok: true, unidadLabel: string, unidades: string[] }
//  -> { ok: false, error: string }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método no permitido' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(200).json({ ok: false, error: 'no_configurada' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const descripcion = (body && body.descripcion) ? String(body.descripcion) : '';
  let imagen = (body && body.imagen) ? String(body.imagen) : '';
  const mediaType = (body && body.mediaType) ? String(body.mediaType) : 'image/png';
  if (imagen.startsWith('data:')) { const i = imagen.indexOf(','); if (i >= 0) imagen = imagen.slice(i + 1); }

  if (!descripcion && !imagen) {
    res.status(400).json({ ok: false, error: 'Falta descripción o imagen' });
    return;
  }

  const model = process.env.MAPA_IA_MODEL || 'claude-opus-4-8';

  const system =
    'Eres un asistente que extrae la estructura de unidades de ejecución de una obra de construcción ' +
    'a partir de un plano (imagen) o de una descripción en español. ' +
    'Identifica si la obra se divide por niveles/pisos, departamentos, casas, locales o zonas, y lista ' +
    'cada unidad a ejecutar. Si hay niveles con departamentos, numéralos tipo piso: 101,102,201,202... ' +
    'Devuelve como máximo 600 unidades. Usa SIEMPRE la herramienta registrar_unidades.';

  const content = [];
  if (imagen) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: imagen } });
  }
  content.push({
    type: 'text',
    text: (imagen ? 'Extrae la estructura de unidades de este plano de obra. ' : '') +
          (descripcion ? ('Descripción: ' + descripcion) : '')
  });

  const tool = {
    name: 'registrar_unidades',
    description: 'Registra la estructura de unidades detectada en la obra.',
    input_schema: {
      type: 'object',
      properties: {
        unidadLabel: {
          type: 'string',
          description: 'Tipo de unidad que mejor describe la subdivisión: Departamento, Nivel, Casa, Local, Zona o Unidad.'
        },
        unidades: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de nombres o identificadores de cada unidad a ejecutar, ej. ["101","102","201"].'
        }
      },
      required: ['unidadLabel', 'unidades']
    }
  };

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'registrar_unidades' },
        messages: [{ role: 'user', content }]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      res.status(200).json({ ok: false, error: (data && data.error && data.error.message) || ('Error ' + r.status) });
      return;
    }

    const block = (data.content || []).find(b => b.type === 'tool_use');
    const input = block && block.input ? block.input : null;
    if (!input || !Array.isArray(input.unidades)) {
      res.status(200).json({ ok: false, error: 'No se pudo interpretar la respuesta' });
      return;
    }

    const unidades = input.unidades.map(u => String(u).trim()).filter(Boolean).slice(0, 600);
    const unidadLabel = String(input.unidadLabel || 'Unidad').trim() || 'Unidad';
    res.status(200).json({ ok: true, unidadLabel, unidades });
  } catch (e) {
    res.status(200).json({ ok: false, error: 'Fallo al contactar la IA: ' + (e && e.message ? e.message : 'desconocido') });
  }
}
