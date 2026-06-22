// Función serverless (Vercel) — devuelve el tipo de cambio para la OC:
// FIX de Banxico (serie SF63528) + $0.15. El token vive SOLO aquí (variable de
// entorno BANXICO_TOKEN en Vercel), nunca en el navegador.
//
// GET -> { ok:true, fix:Number, tc:Number, fecha:'dd/mm/yyyy' }
//     -> { ok:false, error:'no_token' | 'sin_dato' | 'fallo' }

const AJUSTE = 0.15; // sobreprecio fijo sobre el FIX

export default async function handler(req, res) {
  const token = process.env.BANXICO_TOKEN;
  if (!token) { res.status(200).json({ ok: false, error: 'no_token' }); return; }

  try {
    const url = 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF63528/datos/oportuno';
    const r = await fetch(url, { headers: { 'Bmx-Token': token, 'Accept': 'application/json' } });
    const data = await r.json();
    const dato = data && data.bmx && data.bmx.series && data.bmx.series[0] &&
                 data.bmx.series[0].datos && data.bmx.series[0].datos[0];
    if (!dato || !dato.dato) { res.status(200).json({ ok: false, error: 'sin_dato' }); return; }

    const fix = parseFloat(String(dato.dato).replace(/,/g, ''));
    if (!(fix > 0)) { res.status(200).json({ ok: false, error: 'sin_dato' }); return; }

    const tc = Math.round((fix + AJUSTE) * 10000) / 10000;
    res.status(200).json({ ok: true, fix, tc, fecha: dato.fecha });
  } catch (e) {
    res.status(200).json({ ok: false, error: 'fallo' });
  }
}
