# US18 — Multi-empresa: el superadmin crea empresas con su espacio propio

**Objetivo**: el superadmin (el primer usuario de la instancia) crea empresas
nuevas, cada una con su admin y su espacio totalmente aislado: su WhatsApp,
su bot, su equipo, sus contactos y sus chats.

## Guion automatizado

```bash
# Requiere `pnpm dev` corriendo con wa-mock y la BD local (:5433). Resetea la BD.
bash tests/e2e/us18-empresas.sh
```

Cubre: el fundador queda superadmin; crea empresa B (201) que nace sembrada
(pipeline + agente); el admin B entra con sus credenciales a un espacio vacío;
**aislamiento verificado en ambas direcciones** (cada empresa conecta su número
mock y solo ve sus chats; el agente de B no toca la config de A); B arma su
equipo; y los caminos infelices — registro público sigue cerrado (403), email
de admin duplicado (409), un admin normal no puede administrar empresas (403).

## Verificación manual

1. Como superadmin: menú → **Empresas** → «Nueva empresa» (nombre, admin,
   correo, contraseña temporal generada). Al crear, banner con las
   credenciales para copiar (no se vuelven a mostrar).
2. El admin nuevo entra en el mismo `/login` con su correo y contraseña: ve su
   bandeja vacía, SIN el item «Empresas» (y `/companies` lo redirige), y
   configura su WhatsApp/bot/equipo en Ajustes como cualquier propietario.

## Diseño

- `is_superadmin` en `user` (migración `0011`; backfill: el usuario más
  antiguo de la instancia). En instancias nuevas, el primer registro lo recibe
  automáticamente.
- La creación de la cuenta admin reutiliza el alta interna
  (`runInternalSignup`) — el registro público permanece cerrado (FR-060).
- El aislamiento no es nuevo: TODA query de dominio ya pasa por `scoped()`
  (constitución III) y las credenciales de WhatsApp son únicas por org y por
  número. Este cambio solo abre la puerta de crear más organizaciones.
