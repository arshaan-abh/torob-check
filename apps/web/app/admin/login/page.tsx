import { AdminLoginForm } from "@/components/admin-login-form"
import { isSystemAdminConfigured } from "@/lib/system-admin"
import { redirect } from "next/navigation"
import { connection } from "next/server"

export default async function AdminLoginPage() {
  await connection()
  if (!(await isSystemAdminConfigured())) redirect("/admin/setup")
  return <AdminLoginForm />
}
