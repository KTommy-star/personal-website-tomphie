/**
 * Resolve the public URL and base path for local, GitHub Pages, and custom-domain builds.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ site?: string, base?: string }}
 */
export function resolveDeployment(env) {
  const [owner, repository] = (env.GITHUB_REPOSITORY ?? "").split("/");
  const site = env.SITE_URL || (owner ? `https://${owner}.github.io` : undefined);
  const isUserSite = owner && repository === `${owner}.github.io`;
  const inferredBase = owner && repository && !isUserSite ? `/${repository}` : undefined;
  const base = env.BASE_PATH === "/" ? undefined : env.BASE_PATH || inferredBase;

  return {
    ...(site ? { site } : {}),
    ...(base ? { base } : {}),
  };
}
