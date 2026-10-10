import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { listEventTypes, listUpcomingBookings, type EventType } from '@/api/generated'
import OwnerLayout from '@/components/OwnerLayout'
import OwnerTabs from '@/components/OwnerTabs'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Состояние перехода на список после создания типа: какой тип подсветить
export type EventTypesLocationState = { createdEventTypeId?: string }

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; eventTypes: EventType[] }
  | { status: 'error' }

// Раздел Owner, вкладка «Типы событий»: опубликованные EventType и создание нового
function OwnerEventTypesPage() {
  const [state, setState] = useState<PageState>({ status: 'loading' })
  // Число предстоящих Booking нужно только для счётчика соседней вкладки: без него страница работает
  const [upcomingCount, setUpcomingCount] = useState<number>()
  const location = useLocation()
  const navigate = useNavigate()
  // Подсветка — только сразу после создания: id запоминаем, а из истории его убираем,
  // чтобы после перезагрузки или «назад-вперёд» тип уже не считался новым
  const [createdEventTypeId] = useState(
    () => (location.state as EventTypesLocationState | null)?.createdEventTypeId,
  )

  useEffect(() => {
    if (location.state !== null) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  useEffect(() => {
    // Ответ после ухода со страницы игнорируем
    let cancelled = false
    listEventTypes().then(({ data }) => {
      if (cancelled) return
      setState(data ? { status: 'ready', eventTypes: data } : { status: 'error' })
    })
    listUpcomingBookings().then(({ data }) => {
      if (!cancelled && data) setUpcomingCount(data.upcoming.length)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <OwnerLayout>
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-semibold">Кабинет владельца</h1>
        <OwnerTabs
          upcomingCount={upcomingCount}
          eventTypesCount={state.status === 'ready' ? state.eventTypes.length : undefined}
        />

        {state.status === 'loading' && (
          <p role="status" className="text-muted-foreground">Загрузка…</p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="text-destructive">
            Не удалось загрузить типы событий. Попробуйте обновить страницу.
          </p>
        )}
        {state.status === 'ready' && (
          <>
            <div>
              <Link to="/owner/event-types/new" className={buttonVariants()}>
                + Создать тип события
              </Link>
            </div>
            <EventTypeTable eventTypes={state.eventTypes} highlightedId={createdEventTypeId} />
          </>
        )}
      </div>
    </OwnerLayout>
  )
}

function EventTypeTable({ eventTypes, highlightedId }: { eventTypes: EventType[]; highlightedId?: string }) {
  if (eventTypes.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Типов событий ещё нет — гости не смогут записаться, пока вы не создадите хотя бы один.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className="p-3 font-medium">Название</th>
            <th scope="col" className="p-3 font-medium">Описание</th>
            <th scope="col" className="p-3 font-medium">Длительность</th>
          </tr>
        </thead>
        <tbody>
          {eventTypes.map((eventType) => {
            const isNew = eventType.id === highlightedId
            return (
              <tr key={eventType.id} className={cn('border-t', isNew && 'bg-accent')}>
                <td className="p-3 font-medium break-words">
                  {eventType.name}
                  {isNew && (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      Новый
                    </span>
                  )}
                </td>
                <td className="p-3 break-words text-muted-foreground">{eventType.description ?? '—'}</td>
                <td className="p-3 whitespace-nowrap">{eventType.durationMinutes} мин</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default OwnerEventTypesPage
