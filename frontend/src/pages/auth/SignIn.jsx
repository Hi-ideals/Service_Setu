import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Mail, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { HOME_FOR_ROLE } from '../../routes/guards.jsx';
import AuthLayout from './AuthLayout.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';

export default function SignIn() {
  useDocumentTitle('Sign in');
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);

  const { register, handleSubmit, setError, formState } = useForm({
    defaultValues: { identifier: '', password: '' },
  });

  async function onSubmit(values) {
    setFormError(null);
    try {
      const user = await signIn(values);
      // Back to wherever they were headed before the guard intervened.
      const intended = location.state?.from?.pathname;
      navigate(intended || HOME_FOR_ROLE[user.role] || '/', { replace: true });
    } catch (error) {
      const fields = error.fieldErrors ?? {};
      if (Object.keys(fields).length) {
        Object.entries(fields).forEach(([name, message]) => setError(name, { message }));
      } else {
        setFormError(error.message);
      }
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your bookings."
      footer={
        <>
          New to ServiceMitra?{' '}
          <Link to="/register" className="link-grow font-semibold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <Input
          label="Email or phone number"
          icon={Mail}
          autoComplete="username"
          placeholder="you@example.com or 9876543210"
          error={formState.errors.identifier?.message}
          {...register('identifier', { required: 'Enter your email address or phone number' })}
        />

        <div>
          <Input
            label="Password"
            type="password"
            icon={Lock}
            autoComplete="current-password"
            placeholder="Your password"
            error={formState.errors.password?.message}
            {...register('password', { required: 'Enter your password' })}
          />
          <div className="mt-1.5 text-right">
            <Link to="/forgot-password" className="link-grow text-sm font-medium text-brand-600 hover:text-brand-700">
              Forgot your password?
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" fullWidth loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
