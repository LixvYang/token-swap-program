import { GroupDetailPage } from "@/components/group-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <GroupDetailPage address={address} />;
}
