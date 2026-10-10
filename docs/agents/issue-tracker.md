# Трекер задач: GitHub

Задачи и спеки этого репозитория живут как GitHub issues в
`yozhikOm/ai-for-developers-project-386`. Все операции — через CLI `gh`.

## Конвенции

- **Создать задачу**: `gh issue create --title "..." --body "..."`. Для
  многострочного тела используй heredoc.
- **Прочитать задачу**: `gh issue view <number> --comments`, комментарии
  фильтровать через `jq`, лейблы запрашивать отдельно.
- **Список задач**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`
  с нужными фильтрами `--label` и `--state`.
- **Комментарий**: `gh issue comment <number> --body "..."`
- **Добавить / снять лейбл**: `gh issue edit <number> --add-label "..."` /
  `--remove-label "..."`
- **Закрыть**: `gh issue close <number> --comment "..."`

Репозиторий определяется из `git remote -v`; `gh` делает это сам внутри клона.

## Pull requests как поверхность для триажа

**PRs as a request surface: no.** _(Поставь `yes`, если репозиторий считает
внешние PR-ы фича-реквестами; этот флаг читает `/triage`.)_

Когда выставлено `yes`, PR-ы проходят те же лейблы и состояния, что и issues,
через эквивалентные команды `gh pr`:

- **Прочитать PR**: `gh pr view <number> --comments` и `gh pr diff <number>` для диффа.
- **Список внешних PR для триажа**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`,
  оставлять только `authorAssociation` из `CONTRIBUTOR`,
  `FIRST_TIME_CONTRIBUTOR` или `NONE` (отбрасывать `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Комментарий / лейблы / закрытие**: `gh pr comment`,
  `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub использует одно пространство номеров для issues и PR, поэтому голый
`#42` может оказаться и тем, и другим: резолвить через `gh pr view 42` с
фолбэком на `gh issue view 42`.

## Когда скилл говорит «publish to the issue tracker»

Создать GitHub issue.

## Когда скилл говорит «fetch the relevant ticket»

Выполнить `gh issue view <number> --comments`.

## Операции вайфайндинга

Используются `/wayfinder`. **Карта** — один issue, **тикеты** — дочерние issues.

- **Карта**: один issue с лейблом `wayfinder:map`, в теле которого Notes /
  Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Дочерний тикет**: issue, связанный с картой как GitHub sub-issue (`gh api` по
  эндпоинту sub-issues). Если sub-issues не включены — добавить тикет в task list
  в теле карты и указать `Part of #<map>` в начале тела тикета. Лейблы:
  `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). После захвата
  тикет назначается на ведущего разработчика.
- **Блокировки**: нативные **issue dependencies** в GitHub — каноническое,
  видимое в UI представление. Ребро добавляется через
  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`,
  где `<blocker-db-id>` — числовой **database id** блокера
  (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _не_ `#number` и не
  `node_id`). GitHub сообщает `issue_dependencies_summary.blocked_by` (только
  открытые блокеры, живой гейт). Если зависимости недоступны — фолбэк на строку
  `Blocked by: #<n>, #<n>` в начале тела тикета. Тикет разблокирован, когда все
  блокеры закрыты.
- **Запрос фронтира**: открытые дочерние тикеты карты (`gh issue list --state open`,
  ограниченные sub-issues карты / task list), отбросить те, у которых есть
  открытый блокер (`issue_dependencies_summary.blocked_by > 0` либо открытый issue
  в строке `Blocked by`) или назначенный исполнитель; побеждает первый в порядке
  карты.
- **Захват**: `gh issue edit <n> --add-assignee @me` — первая запись сессии.
- **Резолв**: `gh issue comment <n> --body "<ответ>"`, затем
  `gh issue close <n>`, затем дописать указатель на контекст (gist + ссылка) в
  Decisions-so-far карты.
