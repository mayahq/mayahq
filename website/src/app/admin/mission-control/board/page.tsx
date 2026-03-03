'use client'

import { KanbanBoard } from '../components/kanban-board'

export default function BoardPage() {
  return (
    <div className="max-w-[1600px] mx-auto h-[calc(100vh-8rem)]">
      <KanbanBoard />
    </div>
  )
}
