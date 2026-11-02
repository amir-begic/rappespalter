import { redirect } from "next/navigation"
import { connection } from "next/server"
import { needsOnboarding } from "@/lib/onboarding"

// The app opens here (the desktop window too): the first-start setup until it's
// done or skipped, the dashboard after.
export default async function Home() {
  await connection()
  redirect(await needsOnboarding() ? "/welcome" : "/dashboard")
}
