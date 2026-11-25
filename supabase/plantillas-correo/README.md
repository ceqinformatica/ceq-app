# Correos de Supabase (Brevo)

Los correos de acceso (confirmar cuenta, contraseña nueva y enlace para
recuperar el PIN) salen por el SMTP de **Brevo**, el mismo que usa la página
de reservas. Sin SMTP propio, Supabase solo entrega a los miembros del equipo
y unos pocos por hora.

## 1. SMTP de Brevo en Supabase

Supabase → Authentication → Emails → **SMTP Settings** → Enable custom SMTP:

| Campo | Valor |
| --- | --- |
| Sender email | un remitente verificado en Brevo (por ejemplo, el del CEQ) |
| Sender name | `Portal CEQ` |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | el "Login" SMTP que muestra Brevo (SMTP & API → SMTP) |
| Password | una **clave SMTP** de Brevo (SMTP & API → SMTP → Generate a new SMTP key) |

Después, en Authentication → Rate Limits, subir "emails per hour" (con SMTP
propio se puede; 30 alcanza).

## 2. Direcciones de retorno

Authentication → URL Configuration → Redirect URLs: tiene que estar
`ceqapp://**` (o, uno por uno, `ceqapp://auth/callback`,
`ceqapp://auth/restablecer` y `ceqapp://auth/pin`).

## 3. Plantillas en castellano

Authentication → Emails → Templates:

| Plantilla | Asunto | Archivo |
| --- | --- | --- |
| Confirm signup | Confirmá tu cuenta del Portal CEQ | `confirmar-cuenta.html` |
| Reset password | Tu contraseña nueva del Portal CEQ | `restablecer-contrasena.html` |
| Magic link | Recuperá tu PIN del Portal CEQ | `enlace-magico.html` |

El "Magic link" solo lo usa "¿Olvidaste tu PIN?" (la app no inicia sesión
con enlace), por eso habla del PIN.
