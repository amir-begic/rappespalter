import { NextRequest, NextResponse } from "next/server"
import { isOnboardingState, loadOnboarding, saveOnboarding } from "@/lib/onboarding"

// GET: the first-start setup's state ({ state, step, show }).
export async function GET() {
  try {
    return NextResponse.json(await loadOnboarding())
  } catch (error) {
    console.error("Onboarding error:", error)
    return NextResponse.json({ error: "Failed to load the setup state" }, { status: 500 })
  }
}

// PUT { state?: started | done | skipped, step?: number }
export async function PUT(req: NextRequest) {
  try {
    const { state, step } = await req.json().catch(() => ({}))
    if (state !== undefined && !isOnboardingState(state)) {
      return NextResponse.json({ error: "state must be started, done or skipped" }, { status: 400 })
    }
    if (step !== undefined && !(Number.isInteger(step) && step >= 0 && step < 20)) {
      return NextResponse.json({ error: "step must be a small whole number" }, { status: 400 })
    }
    await saveOnboarding({ state, step })
    return NextResponse.json(await loadOnboarding())
  } catch (error) {
    console.error("Onboarding save error:", error)
    return NextResponse.json({ error: "Failed to save the setup state" }, { status: 500 })
  }
}
