import { requireAuth } from "@/lib/auth";
import { AppNav } from "./app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <div className="min-h-screen bg-background">
      <AppNav session={session} />
      <main>{children}</main>
    </div>
  );
}
