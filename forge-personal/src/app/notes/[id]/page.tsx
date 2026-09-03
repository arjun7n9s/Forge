import { Workspace } from '@/components/Workspace';
export default async function NotePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Workspace selectedId={id} />; }
