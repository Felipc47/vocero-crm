# Guion E2E — US6: Plantillas acotadas

> Conducido con Playwright (MCP) contra `pnpm dev` con wa-mock.
>
> **Automatizado**: `bash tests/e2e/us6-templates.sh` cubre de punta a punta el
> ciclo de vida (crear → aprobar → recategorizar → editar → eliminar) contra
> `pnpm dev` con wa-mock. Resetea la BD local antes de correr (el registro
> público se cierra tras la primera organización, FR-060), así que es
> re-ejecutable. Ojo: el journal de drizzle vive en el esquema `drizzle` — hay
> que borrarlo junto con `public` o las migraciones se creen aplicadas.

## Ciclo de aprobación

1. En `/templates`: crear `seguimiento_cotizacion` (es_CO, UTILITY,
   cuerpo con `{{1}}`).
   ✅ Queda en estado "Pendiente de Meta" (el mock devuelve PENDING).
2. Simular la aprobación: `POST /api/dev/wa-mock/template-status`
   `{ wabaId, name, language, event: "APPROVED" }`.
   ✅ El estado pasa a "Aprobada" (evento webhook enrutado por entry.id).
3. Camino infeliz: crear `promo_rechazada` y simular `REJECTED` con razón.
   ✅ Estado "Rechazada" mostrando la razón.
4. `POST /api/templates/sync` → 200 (pull por Graph; cubre modo agencia).

## Envío con ventana cerrada

5. Abrir una conversación con ventana cerrada en la bandeja.
   ✅ El composer bloqueado ahora lista la plantilla aprobada.
6. Elegirla, llenar la variable y enviar.
   ✅ El mensaje aparece en el hilo (tipo plantilla, cuerpo renderizado).
   ✅ El outbox del wa-mock registra `type: "template"` con `components`
   (`parameters[0].text` = valor de la variable).
7. Validaciones: enviar plantilla no aprobada → 422; variable faltante → 422.

## Categoría, edición y borrado

8. La ficha muestra la categoría real (badge UTILITY/MARKETING). Simular que
   Meta recategoriza: `POST /api/dev/wa-mock/template-status`
   `{ …, event: "APPROVED", category: "MARKETING" }` → `POST /api/templates/sync`.
   ✅ La ficha pasa a MARKETING y avisa del límite por destinatario (131049).
9. Editar el cuerpo y la categoría desde la ficha.
   ✅ El cambio llega a Meta y la plantilla vuelve a "Pendiente de Meta".
   ✅ Nombre e idioma NO son editables (Meta no lo permite): para eso, borrar
   y crear de nuevo.
10. Eliminar la plantilla usada como saludo automático de leads.
    ✅ Desaparece del CRM y de Meta, y el saludo global queda en "No enviar"
    (sin referencia rota).
11. Caminos infelices: borrar dos veces → 404; editar id inexistente → 404;
    borrar una plantilla que ya no está en Meta → se limpia igual en el CRM.
