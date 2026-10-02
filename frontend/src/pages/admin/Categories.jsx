import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { api } from '../../lib/api.js';
import { keys } from '../../lib/queryClient.js';
import { useToast } from '../../context/ToastContext.jsx';
import Card, { CardBody, CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { money, pluralise } from '../../lib/format.js';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import PageHeader from '../../components/ui/PageHeader.jsx';

const UNITS = [
  { value: 'per_visit', label: 'Per visit' },
  { value: 'per_hour', label: 'Per hour' },
  { value: 'per_unit', label: 'Per unit' },
  { value: 'quote_on_inspection', label: 'Quote on inspection' },
];

export default function Categories() {
  useDocumentTitle('Service categories');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);

  const { data: tree, isLoading } = useQuery({
    queryKey: [...keys.categories.tree, 'admin'],
    queryFn: async () => (await api.get('/categories/tree', { params: { includeInactive: true } })).data,
  });

  const form = useForm();

  useEffect(() => {
    if (!editing) return;
    form.reset(
      editing.id
        ? {
            name: editing.name,
            basePrice: editing.pricing.base,
            minPrice: editing.pricing.min,
            maxPrice: editing.pricing.max ?? '',
            pricingUnit: editing.pricing.unit,
            estimatedMinutes: editing.estimatedMinutes,
            parentId: editing.parentId || '',
            requiresCertification: Boolean(editing.requiresCertification),
          }
        : {
            pricingUnit: 'per_visit',
            estimatedMinutes: 60,
            parentId: editing.parentId || '',
            requiresCertification: false,
          },
    );
  }, [editing]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.categories.all });

  const save = useMutation({
    mutationFn: (values) => {
      const payload = {
        name: values.name,
        parentId: values.parentId || null,
        basePriceMinor: Math.round(Number(values.basePrice) * 100),
        minPriceMinor: Math.round(Number(values.minPrice) * 100),
        maxPriceMinor: values.maxPrice ? Math.round(Number(values.maxPrice) * 100) : null,
        pricingUnit: values.pricingUnit,
        estimatedMinutes: Number(values.estimatedMinutes),
        requiresCertification: Boolean(values.requiresCertification),
      };
      return editing?.id
        ? api.patch('/categories/' + editing.id, payload)
        : api.post('/categories', payload);
    },
    onSuccess: () => {
      refresh();
      setEditing(null);
      toast.success('Category saved');
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete('/categories/' + id),
    onSuccess: ({ data }) => {
      refresh();
      // The API deactivates rather than deletes when a category has history,
      // and says why. Passing that through is more honest than "Deleted".
      toast.success(data.deleted ? 'Category removed' : data.reason);
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) return <PageLoader />;

  const rows = (tree || []).flatMap((parent) => [
    { ...parent, depth: 0 },
    ...(parent.children || []).map((child) => ({ ...child, depth: 1 })),
  ]);

  const parentOptions = (tree || []).map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={Layers}
        title="Service categories"
        description="The price band here is a rule: providers cannot price outside it."
        action={
          <Button icon={Plus} onClick={() => setEditing({ parentId: '' })}>
            Add category
          </Button>
        }
      />

      <Card className="mt-5">
        <CardHeader title={pluralise(rows.length, 'category', 'categories')} />
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-200">
            {rows.map((row) => (
              <li
                key={row.id}
                className={clsx(
                  'flex items-center justify-between gap-3 px-4 py-3 sm:px-5',
                  row.depth === 1 && 'bg-ink-50/50',
                )}
              >
                <div className={clsx('min-w-0', row.depth === 1 && 'pl-5')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-900">{row.name}</p>
                    {!row.isActive && <Badge variant="neutral" size="sm">Inactive</Badge>}
                    {row.requiresCertification && (
                      <Badge variant="warning" size="sm">Licence needed</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {money(row.pricing.min)}
                    {row.pricing.max ? ' to ' + money(row.pricing.max) : ' and up'}
                    {' · '}
                    {row.estimatedMinutes} min
                    {row.providerCount > 0 && ' · ' + pluralise(row.providerCount, 'provider')}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={'Edit ' + row.name}
                    onClick={() => setEditing(row)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={'Remove ' + row.name}
                    onClick={() => remove.mutate(row.id)}
                    className="text-danger-600 hover:bg-danger-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit category' : 'Add a category'}
      >
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <Alert variant="info">
            Providers set their own price, but it must fall inside the minimum and maximum you set
            here.
          </Alert>

          <Input
            label="Name"
            required
            placeholder="Tap and mixer repair"
            error={form.formState.errors.name?.message}
            {...form.register('name', { required: 'Enter a name' })}
          />

          <Select
            label="Parent category"
            placeholder="None - this is a top-level category"
            options={parentOptions}
            hint="Categories nest one level deep."
            {...form.register('parentId')}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Minimum"
              type="number"
              min={0}
              suffix="Rs"
              required
              {...form.register('minPrice', { required: true })}
            />
            <Input
              label="Suggested"
              type="number"
              min={0}
              suffix="Rs"
              required
              {...form.register('basePrice', { required: true })}
            />
            <Input label="Maximum" type="number" min={0} suffix="Rs" {...form.register('maxPrice')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Pricing unit" options={UNITS} {...form.register('pricingUnit')} />
            <Input
              label="Typical duration"
              type="number"
              min={5}
              max={1440}
              suffix="min"
              required
              {...form.register('estimatedMinutes', { required: true })}
            />
          </div>

          {/* Advisory, not a gate: it flags a provider's KYC for a closer look
              when they offer this trade. Said plainly here so an admin knows
              what ticking it does and does not do. */}
          <label className="flex cursor-pointer items-start gap-3 panel-tint rounded-field p-3 ring-1 ring-inset ring-ink-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
              {...form.register('requiresCertification')}
            />
            <span className="min-w-0">
              <span className="block text-base font-medium text-ink-900">
                Needs a trade licence
              </span>
              <span className="mt-0.5 block text-sm text-ink-500">
                Flags the verification queue to check this provider&apos;s certificate before
                approving them. It does not stop anyone offering the service.
              </span>
            </span>
          </label>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} className="flex-1">
              Save category
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
