// Supabase Edge Function: platform admins trigger the GitHub Actions release
// build (build.yml, workflow_dispatch) from the admin console UI.
// Secrets: GITHUB_TOKEN (repo-scoped PAT with `actions:write`)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "akashsinghtkd/meetly";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const githubToken = Deno.env.get("GITHUB_TOKEN");
    if (!githubToken) return json({ error: "GITHUB_TOKEN not set" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (!isAdmin) return json({ error: "Platform admin only" }, 403);

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );

    if (!res.ok) {
      return json({ error: `GitHub API ${res.status}: ${await res.text()}` }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
