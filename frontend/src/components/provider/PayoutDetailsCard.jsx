import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Smartphone, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api.js';
import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Alert from '../ui/Alert.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const EMPTY = {
  method: 'upi',
  upiId: '',
  accountName: '',
  accountNumber: '',
  ifsc: '',
  bankName: '',
};

/**
 * Where this provider gets paid.
 *
 * Deliberately one destination rather than a list: every extra saved account
 * is another chance for money to go to the wrong one, and a provider only ever
 * needs the current one to be right.
 */
export default function PayoutDetailsCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['provider', 'payout-method'],
    queryFn: async () => (await api.get('/providers/me/payout-method')).data,
  });

  // Seed the form from whatever is saved, but never while the provider is
  // mid-edit - a background refetch must not overwrite what they are typing.
  useEffect(() => {
    if (!data || editing) return;
    setForm({
      method: data.method || 'upi',
      upiId: data.upiId || '',
      accountName: data.accountName || '',
      accountNumber: data.accountNumber || '',
      ifsc: data.ifsc || '',
      bankName: data.bankName || '',
    });
  }, [data, editing]);

  const save = useMutation({
    mutationFn: () => {
      const payload =
        form.method === 'upi'
          ? { method: 'upi', upiId: form.upiId.trim(), ...(form.accountName.trim() ? { accountName: form.accountName.trim() } : {}) }
          : {
              method: 'bank',
              accountName: form.accountName.trim(),
              accountNumber: form.accountNumber.trim(),
              ifsc: form.ifsc.trim(),
              ...(form.bankName.trim() ? { bankName: form.bankName.trim() } : {}),
            };
      return api.put('/providers/me/payout-method', payload);
    },
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['provider', 'payout-method'] });
      toast.success('Payout details saved');
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const fieldError = (name) => save.error?.fieldErrors?.[name];

  const saved = data?.isComplete ? data : null;

  if (isLoading) return null;

  return (
    <Card className="mt-4">
      <CardHeader
        title="Where you get paid"
        subtitle="Released earnings are transferred here. Keep it current."
        action={
          saved && !editing ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Change
            </Button>
          ) : null
        }
      />

      <CardBody>
        {!saved && !editing && (
          <Alert variant="warning">
            You have not added a payout destination yet. Your earnings are safe, but they cannot be
            transferred to you until you add one.
            <div className="mt-2.5">
              <Button size="sm" onClick={() => setEditing(true)}>
                Add payout details
              </Button>
            </div>
          </Alert>
        )}

        {saved && !editing && (
          <div className="flex items-start gap-3">
            {saved.method === 'upi' ? (
              <Smartphone aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            ) : (
              <Landmark aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            )}
            <div className="min-w-0">
              {saved.method === 'upi' ? (
                <p className="break-all font-medium text-ink-900">{saved.upiId}</p>
              ) : (
                <>
                  <p className="font-medium text-ink-900">{saved.accountName}</p>
                  <p className="mt-0.5 break-all text-sm tabular-nums text-ink-600">
                    {saved.accountNumber} · {saved.ifsc}
                  </p>
                  {saved.bankName && <p className="text-sm text-ink-500">{saved.bankName}</p>}
                </>
              )}
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-400">
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                Only you and the ServiceSetu finance team can see this.
              </p>
            </div>
          </div>
        )}

        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="space-y-4"
          >
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-700">How should we pay you?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { value: 'upi', label: 'UPI', hint: 'Usually instant', icon: Smartphone },
                  { value: 'bank', label: 'Bank account', hint: 'NEFT or IMPS', icon: Landmark },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={
                      'flex cursor-pointer items-center gap-2.5 rounded-field border p-3 transition-colors ' +
                      (form.method === option.value
                        ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600/25'
                        : 'border-ink-300 hover:bg-ink-50')
                    }
                  >
                    <input
                      type="radio"
                      name="payout-method"
                      value={option.value}
                      checked={form.method === option.value}
                      onChange={set('method')}
                      className="h-4 w-4 accent-brand-600"
                    />
                    <option.icon aria-hidden="true" className="h-4 w-4 text-ink-500" />
                    <span>
                      <span className="block text-sm font-medium text-ink-900">{option.label}</span>
                      <span className="block text-xs text-ink-500">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {form.method === 'upi' ? (
              <Input
                label="UPI id"
                value={form.upiId}
                onChange={set('upiId')}
                error={fieldError('upiId')}
                placeholder="name@bank"
                autoComplete="off"
                spellCheck={false}
                required
                hint="The id you would give someone paying you on any UPI app."
              />
            ) : (
              <div className="space-y-4">
                <Input
                  label="Name on the account"
                  value={form.accountName}
                  onChange={set('accountName')}
                  error={fieldError('accountName')}
                  required
                />
                <Input
                  label="Account number"
                  value={form.accountNumber}
                  onChange={set('accountNumber')}
                  error={fieldError('accountNumber')}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <Input
                  label="IFSC code"
                  value={form.ifsc}
                  onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))}
                  error={fieldError('ifsc')}
                  placeholder="HDFC0001234"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <Input
                  label="Bank name"
                  value={form.bankName}
                  onChange={set('bankName')}
                  error={fieldError('bankName')}
                  hint="Optional, but it helps us spot a wrong IFSC before the money moves."
                />
              </div>
            )}

            <div className="flex gap-2">
              {saved && (
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" className="flex-1" loading={save.isPending}>
                Save details
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
