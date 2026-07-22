# ¿Cuándo nace Emilia?

SPA familiar para guardar predicciones de fecha, hora y peso, con aporte opcional de ARS 5.000 y comprobante privado.

## Configuración

1. Ejecutar `supabase/schema.sql` en el SQL Editor del proyecto.
   Si la tabla ya existe, ejecutar también una vez `supabase/migrations/20260722_birth_datetime_argentina.sql` para conservar las horas existentes en horario de Argentina.
2. Configurar en Cloudflare Pages los secretos `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `IP_HASH_SECRET`, `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`.
3. Desarrollo: `npm install && npm run dev`.
4. Deploy: `npm run deploy`.

La base impide apodos, emails, minutos, pesos e IPs repetidos. El endpoint valida los mismos datos, limita los comprobantes a 5 MB y nunca devuelve emails, IPs ni rutas de archivos.
