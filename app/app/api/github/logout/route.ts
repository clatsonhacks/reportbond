import { endSession } from "@/lib/server/githubSession";
import { json } from "@/lib/server/views";

export async function POST() {
  await endSession();
  return json({ ok: true });
}
