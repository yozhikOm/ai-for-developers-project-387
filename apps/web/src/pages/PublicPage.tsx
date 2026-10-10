import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getOwner, listEventTypes, type EventType, type Owner } from '@/api/generated'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; owner: Owner; eventTypes: EventType[] }
  | { status: 'error' }

// Публичная страница Owner — первая страница для Guest: к кому он записывается
// и какие форматы звонка (EventType) можно забронировать.
function PublicPage() {
  const [state, setState] = useState<PageState>({ status: 'loading' })

  useEffect(() => {
    // Ответ после ухода со страницы игнорируем
    let cancelled = false
    Promise.all([getOwner(), listEventTypes()]).then(([owner, eventTypes]) => {
      if (cancelled) return
      setState(
        owner.data && eventTypes.data
          ? { status: 'ready', owner: owner.data, eventTypes: eventTypes.data }
          : { status: 'error' },
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          {state.status === 'loading' && (
            <CardHeader className="text-center">
              <p role="status" className="text-muted-foreground">Загрузка…</p>
            </CardHeader>
          )}
          {state.status === 'error' && (
            <CardHeader className="text-center">
              <p role="alert" className="text-destructive">
                Не удалось загрузить страницу. Попробуйте обновить её.
              </p>
            </CardHeader>
          )}
          {state.status === 'ready' && (
            <>
              <CardHeader className="text-center">
                <CardDescription>Запись на звонок</CardDescription>
                <h1 className="font-heading text-2xl leading-snug font-semibold">
                  {state.owner.name}
                </h1>
                <CardDescription className="text-base">
                  Выберите формат звонка, затем удобное время
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EventTypeList eventTypes={state.eventTypes} />
              </CardContent>
            </>
          )}
        </Card>
      </main>
      {/* Неприметный вход в раздел Owner: аутентификации нет по условию задания */}
      <footer className="pb-4 text-center">
        <Link
          to="/owner"
          className="text-xs text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
        >
          Вход для владельца
        </Link>
      </footer>
    </div>
  )
}

function EventTypeList({ eventTypes }: { eventTypes: EventType[] }) {
  if (eventTypes.length === 0) {
    return (
      <p className="py-4 text-center text-muted-foreground">
        Сейчас нет доступных форматов звонка
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {eventTypes.map((eventType) => (
        <li key={eventType.id}>
          <Link
            to={`/booking/${eventType.id}`}
            className="flex flex-col gap-1 rounded-lg border p-3 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-medium">{eventType.name}</h2>
              <span className="shrink-0 text-muted-foreground">{eventType.durationMinutes} мин</span>
            </div>
            {eventType.description && (
              <p className="text-muted-foreground">{eventType.description}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default PublicPage
