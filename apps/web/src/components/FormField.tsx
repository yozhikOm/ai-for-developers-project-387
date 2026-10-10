import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

type FieldProps = {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

// Поле формы с подписью и ошибкой под ним; ошибка связана с полем через aria-describedby
function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: (fieldProps: FieldProps) => ReactNode
}) {
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, ...(error && { 'aria-invalid': true, 'aria-describedby': errorId }) })}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export default FormField
