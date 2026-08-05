import { useState, type JSX } from "react";
import type { Integration } from "../../api/types";

export interface IntegrationLogoProps {
  integration: Integration;
  className?: string;
}

/**
 * An app's real logo, with its initial as the fallback.
 *
 * The URL comes from the provider and is fetched from whatever host it names,
 * so a broken one is a matter of when, not if — and a broken-image icon in
 * someone else's product looks like our bug. The failed state is kept per logo
 * rather than in the list, so one dead URL never blanks the rest.
 */
export function IntegrationLogo({
  integration,
  className = "",
}: IntegrationLogoProps): JSX.Element {
  const [broken, setBroken] = useState(false);

  if (!integration.logo || broken) {
    return (
      <span
        className={`devic-int-logo devic-int-logo-fallback ${className}`.trim()}
        aria-hidden="true"
      >
        {(integration.name || integration.app).charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      className={`devic-int-logo ${className}`.trim()}
      src={integration.logo}
      alt=""
      aria-hidden="true"
      onError={() => setBroken(true)}
    />
  );
}

export default IntegrationLogo;
