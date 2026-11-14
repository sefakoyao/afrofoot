import { AreaHome } from '@/components/AppShell';
import { requireArea } from '@/lib/auth';

export default async function Page() {
  return <AreaHome member={await requireArea('admin')} />;
}
