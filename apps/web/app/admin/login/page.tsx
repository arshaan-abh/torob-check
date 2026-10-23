import { AdminLoginForm } from "@/components/admin-login-form"
import { isSystemAdminConfigured } from "@/lib/system-admin"
import { redirect } from "next/navigation"

export default async function AdminLoginPage() {
  if (!(await isSystemAdminConfigured())) redirect("/admin/setup")
  return <AdminLoginForm />
}
