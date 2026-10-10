import { Navigate, Route, Routes } from 'react-router-dom'
import BookingPage from './pages/BookingPage.tsx'
import NewEventTypePage from './pages/NewEventTypePage.tsx'
import OwnerEventTypesPage from './pages/OwnerEventTypesPage.tsx'
import OwnerUpcomingPage from './pages/OwnerUpcomingPage.tsx'
import PublicPage from './pages/PublicPage.tsx'

// Корневой компонент: маршруты приложения. Роутер (BrowserRouter) подключает
// main.tsx, чтобы тесты могли рендерить приложение в MemoryRouter на нужном URL.
function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicPage />} />
      <Route path="/booking/:eventTypeId" element={<BookingPage />} />
      {/* Раздел Owner: вкладки «Предстоящие» (открывается по умолчанию) и «Типы событий» */}
      <Route path="/owner" element={<Navigate to="/owner/upcoming" replace />} />
      <Route path="/owner/upcoming" element={<OwnerUpcomingPage />} />
      <Route path="/owner/event-types" element={<OwnerEventTypesPage />} />
      <Route path="/owner/event-types/new" element={<NewEventTypePage />} />
    </Routes>
  )
}

export default App
