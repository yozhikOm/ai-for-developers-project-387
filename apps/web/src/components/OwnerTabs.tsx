import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

type OwnerTabsProps = {
  // Число предстоящих (ещё не начавшихся) Booking; пока не известно — вкладка без счётчика
  upcomingCount?: number
  // Число EventType; пока не известно — вкладка без счётчика
  eventTypesCount?: number
}

// Вкладки раздела Owner со счётчиками: «Предстоящие (N)» и «Типы событий (N)»
function OwnerTabs({ upcomingCount, eventTypesCount }: OwnerTabsProps) {
  return (
    <nav aria-label="Разделы кабинета" className="flex gap-2 border-b">
      <OwnerTab to="/owner/upcoming" label="Предстоящие" count={upcomingCount} />
      <OwnerTab to="/owner/event-types" label="Типы событий" count={eventTypesCount} />
    </nav>
  )
}

function OwnerTab({ to, label, count }: { to: string; label: string; count?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          '-mb-px border-b-2 px-3 py-2 text-sm',
          isActive ? 'border-primary font-medium' : 'border-transparent text-muted-foreground',
        )
      }
    >
      {count === undefined ? label : `${label} (${count})`}
    </NavLink>
  )
}

export default OwnerTabs
