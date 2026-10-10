import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'

// Оболочка раздела Owner: шапка с выходом на публичную страницу и область экрана.
// Раздел открыт без входа — осознанное ограничение задания (история 43 спеки).
function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-heading text-lg font-semibold">Календарь звонков</span>
          <Link to="/" className={buttonVariants({ variant: 'ghost' })}>
            Публичная страница
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}

export default OwnerLayout
