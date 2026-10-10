import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createEventType } from '@/api/generated'
import FormField from '@/components/FormField'
import OwnerLayout from '@/components/OwnerLayout'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  DURATION_MAX,
  DURATION_MIN,
  DURATION_STEP,
  toNewEventType,
  validateEventTypeForm,
  type EventTypeFormValues,
} from '@/lib/eventTypeForm'
import type { EventTypesLocationState } from './OwnerEventTypesPage.tsx'

const EVENT_TYPES_PATH = '/owner/event-types'

// Отдельный экран создания EventType. После «Создать» Owner возвращается
// к списку с подсвеченным новым типом, «Отмена» — к списку без изменений.
function NewEventTypePage() {
  const navigate = useNavigate()
  const [values, setValues] = useState<EventTypeFormValues>({
    name: '',
    description: '',
    durationMinutes: '30',
  })
  // Ошибки под полями показываем после первой попытки отправить форму
  // и дальше пересчитываем на каждый ввод
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [failed, setFailed] = useState(false)
  const errors = attempted ? validateEventTypeForm(values) : {}

  const setField = (field: keyof EventTypeFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAttempted(true)
    if (Object.keys(validateEventTypeForm(values)).length > 0) return

    setSubmitting(true)
    setFailed(false)
    // Серверный отказ — страховка: клиентская проверка повторяет его правила,
    // поэтому показываем общее сообщение формы
    const { data } = await createEventType({ body: toNewEventType(values) }).catch(() => ({ data: undefined }))
    if (data) {
      const state: EventTypesLocationState = { createdEventTypeId: data.id }
      navigate(EVENT_TYPES_PATH, { state })
      return
    }
    setSubmitting(false)
    setFailed(true)
  }

  return (
    <OwnerLayout>
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <h1 className="font-heading text-xl leading-snug font-semibold">Новый тип события</h1>
        </CardHeader>
        <CardContent>
          {/* noValidate: вместо всплывающих подсказок браузера — свои ошибки под полями */}
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <FormField id="event-type-name" label="Название" error={errors.name}>
              {(fieldProps) => (
                <Input {...fieldProps} value={values.name} onChange={(e) => setField('name')(e.target.value)} />
              )}
            </FormField>
            <FormField id="event-type-description" label="Описание (необязательно)" error={errors.description}>
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  rows={3}
                  value={values.description}
                  onChange={(e) => setField('description')(e.target.value)}
                />
              )}
            </FormField>
            <FormField id="event-type-duration" label={`Длительность, мин (кратно ${DURATION_STEP})`} error={errors.durationMinutes}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="number"
                  inputMode="numeric"
                  min={DURATION_MIN}
                  max={DURATION_MAX}
                  step={DURATION_STEP}
                  value={values.durationMinutes}
                  onChange={(e) => setField('durationMinutes')(e.target.value)}
                />
              )}
            </FormField>

            {failed && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось создать тип события. Проверьте данные и попробуйте ещё раз.
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                Создать
              </Button>
              <Link to={EVENT_TYPES_PATH} className={buttonVariants({ variant: 'outline' })}>
                Отмена
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </OwnerLayout>
  )
}

export default NewEventTypePage
