import { redirect } from "next/navigation";

/** Servicios subió al menú principal; se conserva la URL vieja. */
export default function ServicesSettingsRedirect() {
  redirect("/services");
}
