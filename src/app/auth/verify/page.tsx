import { AuthFlowScreen } from "@/features/auth/auth-flow-screen";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const query = await searchParams;
  return <AuthFlowScreen view="verify" initialEmail={query.email ?? ""} />;
}
