import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
import { keys } from '../../lib/queryClient.js';
import useDebounce from '../../hooks/useDebounce.js';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Badge, { BOOKING_STATUS_VARIANT } from '../../components/ui/Badge.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import Input from '../../components/ui/Input.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { SkeletonCard } from '../../components/ui/Skeleton.jsx';
import { money, formatDateTime } from '../../lib/format.js';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import PageHeader from '../../components/ui/PageHeader.jsx';

const FILTERS = {
  all: undefined,
  live: ['requested', 'accepted', 'in_progress'],
  completed: ['completed'],
  problems: ['disputed', 'refunded'],
  closed: ['cancelled', 'rejected'],
};

export default function AdminBookings() {
  useDocumentTitle('All bookings');
  const [tab, setTab] = useState('live');
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const search = useDebounce(term, 400);

  const { data, isLoading } = useQuery({
    queryKey: keys.bookings.list({ admin: true, tab, page, search }),
    queryFn: () =>
      api.get('/bookings', {
        params: { status: FILTERS[tab], search: search || undefined, page, limit: 20 },
      }),
  });

  const bookings = data?.data ?? [];
  const meta = data?.meta ?? {};

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader icon={CalendarRange} title="All bookings" description="Every booking on the platform." />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          icon={Search}
          placeholder="Search by reference, customer, provider or service"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setPage(1);
          }}
          containerClassName="sm:max-w-md"
          aria-label="Search bookings"
        />
      </div>

      <Tabs
        className="mt-4"
        tabs={[
          { value: 'live', label: 'Live' },
          { value: 'completed', label: 'Completed' },
          { value: 'problems', label: 'Disputed' },
          { value: 'closed', label: 'Closed' },
          { value: 'all', label: 'Everything' },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setPage(1);
        }}
      />

      <Card className="mt-4">
        <CardBody className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : bookings.length === 0 ? (
            <EmptyState icon={CalendarRange} title="No bookings match this view" />
          ) : (
            <>
              {/* A table on desktop, stacked cards on a phone - a six-column
                  table at 375px is unreadable however it is styled. */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="data-table w-full text-base">
                  <thead>
                    <tr>
                      <th scope="col">Reference</th>
                      <th scope="col">Service</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Provider</th>
                      <th scope="col">When</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {bookings.map((booking) => (
                      <tr key={booking.id}>
                        <td className="font-mono text-sm text-ink-500">{booking.reference}</td>
                        <td className="font-medium text-ink-900">{booking.category.name}</td>
                        <td className="text-ink-600">{booking.customer.name}</td>
                        <td className="text-ink-600">{booking.provider.name}</td>
                        <td className="text-sm text-ink-500">
                          {formatDateTime(booking.schedule.start)}
                        </td>
                        <td>
                          <Badge variant={BOOKING_STATUS_VARIANT[booking.status]} size="sm">
                            {booking.statusLabel}
                          </Badge>
                        </td>
                        <td className="text-right font-semibold tabular-nums text-ink-900">
                          {money(booking.pricing.final ?? booking.pricing.quoted)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-ink-200 lg:hidden">
                {bookings.map((booking) => (
                  <li key={booking.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900">{booking.category.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-ink-400">{booking.reference}</p>
                      </div>
                      <Badge variant={BOOKING_STATUS_VARIANT[booking.status]} size="sm">
                        {booking.statusLabel}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-ink-500">
                      {booking.customer.name} → {booking.provider.name}
                    </p>
                    <div className="mt-1.5 flex items-baseline justify-between">
                      <span className="text-sm text-ink-500">
                        {formatDateTime(booking.schedule.start)}
                      </span>
                      <span className="font-medium text-ink-900">
                        {money(booking.pricing.final ?? booking.pricing.quoted)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardBody>
      </Card>

      <Pagination
        className="mt-5"
        page={meta.page || 1}
        totalPages={meta.totalPages}
        total={meta.total}
        onChange={setPage}
      />
    </div>
  );
}
