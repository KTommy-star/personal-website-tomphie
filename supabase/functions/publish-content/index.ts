import { handlePublishRequest, type PublishEnv } from "../_shared/publisher.ts";

Deno.serve(request => {
  const names: (keyof PublishEnv)[] = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GITHUB_TOKEN", "GITHUB_REPOSITORY", "PUBLIC_SITE_URL", "ALLOWED_ORIGINS"];
  const env = Object.fromEntries(names.map(name => [name, Deno.env.get(name) ?? ""])) as unknown as PublishEnv;
  return handlePublishRequest(request, env);
});
