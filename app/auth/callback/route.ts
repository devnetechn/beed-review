import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const NEW_ACCOUNT_WINDOW_MS = 15_000;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const intent = searchParams.get("intent");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const isBrandNew = Date.now() - new Date(data.user.created_at).getTime() < NEW_ACCOUNT_WINDOW_MS;

      // Supabase's OAuth flow creates the account on first login regardless of
      // which button triggered it. Anything other than an explicit signup
      // intent for a just-created account means someone tried to sign IN with
      // a Google account that never signed up - undo the auto-created account.
      if (isBrandNew && intent !== "signup") {
        await supabase.auth.signOut();
        const service = createServiceClient();
        await service.auth.admin.deleteUser(data.user.id);
        return NextResponse.redirect(`${origin}/login?error=no_account`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
