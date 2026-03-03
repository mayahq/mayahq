import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4 py-12">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight">
            Sign in to Maya HQ
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Enter your email to receive a magic link
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
} 