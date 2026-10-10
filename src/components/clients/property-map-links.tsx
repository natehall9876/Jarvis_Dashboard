import Link from "next/link";
import { MapPin } from "lucide-react";
import { propertyAddress } from "@/lib/format";

type PropertyLocation = {
  id: string;
  property_name?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

const mapButtonClass = "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

export function PropertyMapLinks({ property }: { property: PropertyLocation }) {
  const location = {
    street: property.street?.trim(),
    city: property.city?.trim(),
    state: property.state?.trim(),
    zip: property.zip?.trim(),
  };
  // A nickname or city alone is not a property destination.
  const address = location.street ? propertyAddress(location) : null;
  const query = address ? encodeURIComponent(address) : "";
  const google = `https://www.google.com/maps/search/?api=1&query=${query}`;
  const apple = `https://maps.apple.com/place?address=${query}`;

  return (
    <div className="min-w-0 space-y-2">
      {address ? (
        <a
          href={google}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${address} — open in Google Maps`}
          className="flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-[var(--color-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{address}</span>
        </a>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">
          {property.property_name ? `${property.property_name} · ` : ""}Street address not available
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {address ? (
          <>
            <a href={google} target="_blank" rel="noopener noreferrer" className={mapButtonClass} aria-label={`Google Maps — ${address}`}>Google Maps</a>
            <a href={apple} target="_blank" rel="noopener noreferrer" className={mapButtonClass} aria-label={`Apple Maps — ${address}`}>Apple Maps</a>
          </>
        ) : null}
        <Link href={`/properties/${property.id}`} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-[var(--color-text-secondary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
          Property details
        </Link>
      </div>
    </div>
  );
}
