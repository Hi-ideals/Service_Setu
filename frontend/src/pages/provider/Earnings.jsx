import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Wallet, Clock, TrendingUp, Receipt, Briefcase } from 'lucide-react';
import { api } from '../../lib/api.js';
import { keys } from '../../lib/queryClient.js';
import Card, { CardBody, CardHeader } from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { money, formatDate, formatDateTime, humanise } from '../../lib/format.js';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import PayoutDetailsCard from '../../components/provider/PayoutDetailsCard.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';

const ENTRY_LABELS = {
  job_earning: 'Job payment',
  commission: 'Platform commission',
  refund_reversal: 'Refund adjustment',
  payout: 'Paid out to you',
  adjustment: 'Adjustment',
  penalty: 'Penalty',
};

export default function Earnings() {
  useDocumentTitle('Earnings');
  const { data, isLoading } = useQuery({
    queryKey: keys.earnings({ limit: 50 }),
    queryFn: async () => (await api.get('/earnings', { params: { limit: 50 } })).data,
  });

  if (isLoading) return <PageLoader label="Loading your earnings" />;
  if (!data) return null;

  const { balance, entries, report, byMonth } = data;

  return (
    <div className="page max-w-4xl py-5 sm:py-7">
      <PageHeader icon={Wallet} title="Earnings" />

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Wallet aria-hidden="true" className="h-4 w-4 text-brand-600" />
            <p className="text-sm font-medium text-ink-500">Available now</p>
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-ink-900">{money(balance.available)}</p>
          <p className="mt-0.5 text-xs text-ink-400">Released in the next payout run</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clock aria-hidden="true" className="h-4 w-4 text-warning-600" />
            <p className="text-sm font-medium text-ink-500">Still held</p>
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-ink-900">{money(balance.pending)}</p>
          <p className="mt-0.5 text-xs text-ink-400">Inside the dispute window</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <TrendingUp aria-hidden="true" className="h-4 w-4 text-success-600" />
            <p className="text-sm font-medium text-ink-500">Lifetime</p>
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-ink-900">{money(balance.lifetime)}</p>
          <p className="mt-0.5 text-xs text-ink-400">Net of commission</p>
        </Card>
      </div>

      {/* ---------- what was earned, and what it cost ---------- */}
      {report?.jobs > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="Your earnings report"
            subtitle={
              report.since
                ? 'Since ' + formatDate(report.since) + ' · ' + report.jobs +
                  (report.jobs === 1 ? ' job' : ' jobs')
                : undefined
            }
          />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="panel-tint rounded-field p-3">
                <div className="flex items-center gap-1.5 text-ink-500">
                  <Briefcase aria-hidden="true" className="h-3.5 w-3.5" />
                  <p className="text-xs font-medium uppercase tracking-wide">You earned</p>
                </div>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
                  {money(report.gross)}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {money(report.averagePerJob)} per job on average
                </p>
              </div>

              <div className="panel-tint rounded-field p-3">
                <div className="flex items-center gap-1.5 text-ink-500">
                  <Receipt aria-hidden="true" className="h-3.5 w-3.5" />
                  <p className="text-xs font-medium uppercase tracking-wide">Commission paid</p>
                </div>
                <p className="mt-1 text-xl font-semibold tabular-nums text-warning-700">
                  −{money(report.commission)}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {report.effectiveCommissionPercent}% of what you earned
                </p>
              </div>

              <div className="rounded-field border border-ink-200 bg-brand-50/50 p-3">
                <div className="flex items-center gap-1.5 text-ink-500">
                  <Wallet aria-hidden="true" className="h-3.5 w-3.5" />
                  <p className="text-xs font-medium uppercase tracking-wide">You keep</p>
                </div>
                <p className="mt-1 text-xl font-semibold tabular-nums text-success-700">
                  {money(report.net)}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {money(report.paidOut)} already transferred to you
                </p>
              </div>
            </div>

            {report.otherDeductionsMinor > 0 && (
              <p className="mt-3 text-sm text-ink-500">
                Includes {money(report.otherDeductions)} in adjustments. Every one of them is a line
                in the statement below.
              </p>
            )}

            {byMonth?.some((m) => m.jobs > 0) && (
              <div className="no-scrollbar -mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="data-table w-full min-w-[26rem] text-sm">
                  <thead>
                    <tr>
                      <th className="!px-2">Month</th>
                      <th className="!px-2 text-right">Jobs</th>
                      <th className="!px-2 text-right">Earned</th>
                      <th className="!px-2 text-right">Commission</th>
                      <th className="!px-2 text-right">You keep</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {byMonth.map((m) => (
                      <tr key={m.period} className={m.jobs ? undefined : 'text-ink-400'}>
                        <td className="whitespace-nowrap !px-2">{m.label}</td>
                        <td className="!px-2 text-right tabular-nums">{m.jobs}</td>
                        <td className="!px-2 text-right tabular-nums">{money(m.gross)}</td>
                        <td className="!px-2 text-right tabular-nums text-warning-700">
                          {m.commission ? '−' + money(m.commission) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums">
                          {money(m.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <PayoutDetailsCard />

      {balance.pendingMinor > 0 && (
        <Alert variant="info" className="mt-4">
          Money from a completed job is held until the dispute window closes, then released in the
          next payout run.
        </Alert>
      )}

      <Card className="mt-4">
        <CardHeader title="Statement" subtitle="Every movement on your balance." />
        <CardBody className="p-0">
          {entries.length === 0 ? (
            <EmptyState
              compact
              icon={Wallet}
              title="Nothing here yet"
              description="Completed and paid jobs appear here."
            />
          ) : (
            <ul className="divide-y divide-ink-200">
              {entries.map((entry) => (
                <li key={entry.id} className="row-hover flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      {ENTRY_LABELS[entry.type] || humanise(entry.type)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-ink-500">
                      {entry.description}
                      {entry.bookingReference && ' · ' + entry.bookingReference}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {formatDateTime(entry.createdAt)}
                      {entry.availableAt && new Date(entry.availableAt) > new Date() && (
                        <span className="text-warning-600">
                          {' · available ' + formatDate(entry.availableAt)}
                        </span>
                      )}
                    </p>
                  </div>

                  <p
                    className={clsx(
                      'shrink-0 font-semibold tabular-nums',
                      entry.amountMinor < 0 ? 'text-ink-500' : 'text-success-700',
                    )}
                  >
                    {entry.amountMinor < 0 ? '−' : '+'}
                    {money(Math.abs(entry.amount))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
