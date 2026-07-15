// Middleware de Vercel — pone el CRM completo detrás de una contraseña.
//
// Corre en el edge ANTES de servir cualquier archivo, así que protege también
// el HTML (donde vive el catálogo con costos y márgenes) y las funciones de
// /api (tipo-cambio y mapa-ia, que gasta ANTHROPIC_API_KEY).
//
// Usuario y contraseña viven en las variables de entorno de Vercel
// (CRM_USER / CRM_PASS), nunca en el código.

import { next } from '@vercel/functions';

export const config = {
  // Runtime Node (no Edge): las variables de entorno marcadas "Sensitive" en
  // Vercel —como CRM_PASS— solo se exponen al runtime de Node, no al de Edge.
  runtime: 'nodejs',
  // Todo el sitio. Se deja fuera el favicon para no pedir credenciales al
  // pintar la pestaña del navegador.
  matcher: '/((?!favicon\\.ico).*)',
};

// Comparación en tiempo constante: no revela cuántos caracteres acertó quien
// esté probando contraseñas.
function igual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

const pedirCredenciales = () =>
  new Response('Acceso restringido — Tecnoelementos CRM', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Tecnoelementos CRM", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
    },
  });

export default function middleware(request) {
  const USUARIO = process.env.CRM_USER || 'tecnoelementos';
  const CLAVE = process.env.CRM_PASS;

  // Sin contraseña configurada cerramos el paso. Preferimos que el CRM quede
  // inaccesible a que quede abierto por un descuido en las variables.
  if (!CLAVE) {
    return new Response(
      'CRM sin configurar: falta la variable CRM_PASS en Vercel.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  }

  const [esquema, credenciales] = (request.headers.get('authorization') || '').split(' ');
  if (esquema !== 'Basic' || !credenciales) return pedirCredenciales();

  let descifrado;
  try {
    descifrado = atob(credenciales);
  } catch {
    return pedirCredenciales();
  }

  const corte = descifrado.indexOf(':');
  if (corte === -1) return pedirCredenciales();

  const usuario = descifrado.slice(0, corte);
  const clave = descifrado.slice(corte + 1);

  if (!igual(usuario, USUARIO) || !igual(clave, CLAVE)) return pedirCredenciales();

  return next();
}
