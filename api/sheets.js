// Proxy serverless (Vercel) entre el CRM y el Apps Script de Google Sheets.
//
// El navegador ya no habla directo con Google: llama a /api/sheets (que está
// detrás del Basic Auth del middleware). Este proxy —del lado del servidor—
// le agrega un SECRETO compartido y reenvía la petición al Apps Script. Así el
// secreto nunca viaja al navegador ni aparece en el código del cliente.
//
// El Apps Script valida ese mismo secreto y rechaza cualquier petición que no
// lo traiga (las que le llegan directo de un tercero). El secreto vive SOLO en
// las variables de entorno: SHEETS_SECRET en Vercel y una Script Property del
// mismo nombre en el Apps Script. Nunca en el código.

// URL del Apps Script (no es secreta; ya era pública). Vive aquí, del lado del
// servidor, para que deje de aparecer en el HTML del cliente.
const UPSTREAM =
  'https://script.google.com/macros/s/AKfycbw5_mwWlDGl9f_wxzVqZT5jbJXyhO9Xg-gGyDdeQiBsF-BymVCV_LBsZ8F0w2QYawaZ/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método no permitido' });
    return;
  }

  // Modo transición: si SHEETS_SECRET aún no está configurado en Vercel, se
  // reenvía SIN secreto (el Apps Script todavía no lo valida, así que funciona
  // igual que antes). En cuanto el secreto exista en ambos lados, todas las
  // peticiones viajan firmadas y el Apps Script rechaza las que no lo traigan.
  const secret = process.env.SHEETS_SECRET;

  // El body puede llegar ya parseado (req.body) o como texto crudo.
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = {}; }
  }
  if (!payload || typeof payload !== 'object') payload = {};

  // Inyecta el secreto (si existe) y reenvía al Apps Script.
  const conSecreto = secret ? { ...payload, secret } : payload;

  try {
    const r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(conSecreto),
      redirect: 'follow',
    });
    const texto = await r.text();
    // Devuelve tal cual lo que respondió el Apps Script (normalmente JSON).
    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(texto);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'proxy_fallo' });
  }
}
