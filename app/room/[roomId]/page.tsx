import { RoomExperience } from "@/components/room/RoomExperience";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <RoomExperience code={decodeURIComponent(roomId)} />;
}
