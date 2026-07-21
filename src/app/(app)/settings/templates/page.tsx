import { redirect } from "next/navigation";

/** Plantillas subió al menú principal; se conserva la URL vieja. */
export default function TemplatesSettingsRedirect() {
  redirect("/templates");
}
