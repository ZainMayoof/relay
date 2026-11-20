export function serverConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const host = env.HOST || '127.0.0.1';
  let url;
  try { url = new URL(env.APP_ORIGIN); } catch { throw new Error('APP_ORIGIN must be an HTTPS origin'); }
  if (url.protocol !== 'https:' || url.origin !== env.APP_ORIGIN) throw new Error('APP_ORIGIN must be an HTTPS origin');
  return { port, host, origin: url.origin };
}
