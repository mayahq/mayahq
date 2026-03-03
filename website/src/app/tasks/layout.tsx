import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tasks | Maya',
  description: 'Manage your tasks and stay organized with Maya.',
};

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
} 