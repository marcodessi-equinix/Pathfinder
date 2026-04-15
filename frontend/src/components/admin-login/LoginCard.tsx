type LoginCardProps = {
  password: string
  loginError: string
  onPasswordChange: (value: string) => void
  onSubmit: () => void
}

export default function LoginCard({ password, loginError, onPasswordChange, onSubmit }: LoginCardProps) {
  const hasError = loginError.length > 0
  const isDisabled = password.length === 0
  const cardClassName = hasError
    ? 'w-full rounded-[32px] border border-[var(--danger)] bg-[var(--bg-panel)] p-8 shadow-[var(--panel-shadow-raised)] sm:p-10'
    : 'w-full rounded-[32px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 shadow-[var(--panel-shadow-raised)] sm:p-10'
  const inputClassName = hasError
    ? 'h-14 w-full rounded-2xl border border-[var(--danger)] bg-[var(--input-bg)] px-4 text-base text-admin-text outline-none transition placeholder:text-admin-text-muted focus:border-[var(--danger)] focus:ring-2 focus:ring-[var(--focus-ring-danger)]'
    : 'h-14 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--input-bg)] px-4 text-base text-admin-text outline-none transition placeholder:text-admin-text-muted focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]'

  return (
    <section className={cardClassName}>
      <div className="space-y-3">
        <h2 className="text-[2.35rem] font-semibold tracking-[-0.05em] text-admin-text sm:text-[2.75rem]">
          Sign in to admin
        </h2>
        <p className="text-base leading-7 text-admin-text-soft">
          Enter the password to continue to the Pathfinder admin console.
        </p>
      </div>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        {hasError ? (
          <input
            autoFocus
            className={inputClassName}
            type="password"
            placeholder="Password"
            value={password}
            aria-invalid="true"
            aria-label="Admin password"
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        ) : (
          <input
            autoFocus
            className={inputClassName}
            type="password"
            placeholder="Password"
            value={password}
            aria-label="Admin password"
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        )}

        {hasError ? (
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--danger)_24%,transparent)] bg-[var(--danger-soft-bg)] px-4 py-3 text-sm font-medium leading-6 text-[var(--danger)]" role="alert" aria-live="assertive">
            {loginError}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isDisabled}
          className="inline-flex h-14 w-full items-center justify-center rounded-2xl border border-[var(--primary)] bg-[var(--primary)] px-5 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-[0_12px_32px_color-mix(in_srgb,var(--primary)_34%,transparent)] transition hover:bg-[var(--primary-hover)] hover:border-[var(--primary-hover)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:bg-[var(--input-disabled)] disabled:text-[var(--text-muted)] disabled:shadow-none"
        >
          Enter admin console
        </button>
      </form>
    </section>
  )
}