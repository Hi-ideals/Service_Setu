import { Link } from 'react-router-dom';
import { MapPin, CheckCircle2, Clock } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import StarRating from '../../components/ui/StarRating.jsx';
import { money, pluralise } from '../../lib/format.js';

/**
 * One search result.
 *
 * A provider with no ratings shows "New" rather than a zero-star display,
 * because an honest 0.0 reads as a bad provider rather than an unrated one.
 */
export default function ProviderCard({ provider }) {
  return (
    <Card interactive glow className="group overflow-hidden">
      <Link to={'/providers/' + provider.id} className="relative block p-4 focus:outline-none">
        {/* A corner wash that blooms on hover, behind everything and
            pointer-transparent so it cannot steal the click. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full
                     bg-brand-500/0 blur-2xl transition-colors duration-500 group-hover:bg-brand-500/20"
        />
        <div className="relative flex gap-3">
          <Avatar src={provider.avatarUrl} name={provider.name} size="lg" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
                  {provider.name}
                </h3>
                {provider.headline && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{provider.headline}</p>
                )}
              </div>
              {provider.verifiedAt && (
                <span
                  title="Verified professional"
                  className="icon-chip icon-chip-success h-7 w-7 shrink-0 rounded-full"
                >
                  <CheckCircle2 aria-label="Verified professional" className="h-4 w-4" />
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {provider.rating.isNew ? (
                <Badge variant="info" size="sm">New</Badge>
              ) : (
                <StarRating value={provider.rating.average} size="sm" showValue count={provider.rating.count} />
              )}

              {provider.jobsCompleted > 0 && (
                <span className="text-sm text-ink-500">
                  {pluralise(provider.jobsCompleted, 'job')} done
                </span>
              )}

              {provider.experienceYears > 0 && (
                <span className="text-sm text-ink-500">
                  {pluralise(provider.experienceYears, 'yr')} experience
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
              {provider.distanceKm !== null && provider.distanceKm !== undefined && (
                <span className="flex items-center gap-1">
                  <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                  {provider.distanceKm} km away
                </span>
              )}
              {provider.avgResponseMinutes && (
                <span className="flex items-center gap-1">
                  <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                  Usually replies in {provider.avgResponseMinutes} min
                </span>
              )}
            </div>

            {provider.categories?.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {provider.categories.slice(0, 3).map((category) => (
                  <span
                    key={category}
                    className="rounded-pill bg-gradient-to-b from-ink-50 to-ink-100 px-2 py-0.5 text-xs
                               font-medium text-ink-600 ring-1 ring-inset ring-ink-200"
                  >
                    {category}
                  </span>
                ))}
                {provider.categories.length > 3 && (
                  <span className="rounded-pill bg-gradient-to-b from-ink-50 to-ink-100 px-2 py-0.5 text-xs
                                   font-medium text-ink-600 ring-1 ring-inset ring-ink-200">
                    +{provider.categories.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-3 flex items-baseline justify-between border-t border-ink-200/80 pt-3">
          <span className="text-sm text-ink-500">Starting from</span>
          <span className="figure text-lg">{money(provider.fromPrice)}</span>
        </div>
      </Link>
    </Card>
  );
}
