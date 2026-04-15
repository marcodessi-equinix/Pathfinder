import InfoPanel from './InfoPanel'
import LoginCard from './LoginCard'

type LoginPageProps = {
  theme: 'dark' | 'light'
  password: string
  loginError: string
  onPasswordChange: (value: string) => void
  onSubmit: () => void
  onToggleTheme: () => void
}

export default function LoginPage({
  theme,
  password,
  loginError,
  onPasswordChange,
  onSubmit,
  onToggleTheme,
}: LoginPageProps) {
  return (
    <main className="admin-login-shell relative min-h-svh overflow-hidden font-sans text-admin-text" data-admin-theme={theme}>
      <div className="relative mx-auto flex min-h-svh w-full max-w-6xl flex-col px-5 py-5 sm:px-8 sm:py-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 shadow-[var(--shadow-soft)]">
              <img src="/admin-monitor-logo.svg" alt="Pathfinder" className="max-h-full w-full object-contain" />
            </div>

            <div className="space-y-0.5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-admin-text-muted">
                Pathfinder
              </p>
              <p className="text-sm font-medium text-admin-text">Admin</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-3 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-admin-text-soft shadow-[var(--shadow-soft)] transition hover:border-[var(--border-strong)] hover:text-admin-text"
          >
            <span>Theme</span>
            <span className="text-admin-text">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </header>

        <section className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <div className="w-full max-w-[540px]">
            <InfoPanel />
            <LoginCard
              password={password}
              loginError={loginError}
              onPasswordChange={onPasswordChange}
              onSubmit={onSubmit}
            />
          </div>
        </section>
      </div>
    </main>
  )
}