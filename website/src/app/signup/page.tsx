import { SignUpForm } from './signup-form'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4 py-12">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Sign up to get started with Maya HQ
          </p>
        </div>
        <SignUpForm />
      </div>
    </div>
  )
} 