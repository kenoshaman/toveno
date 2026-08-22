import { WatchScreen } from "./watch-screen";

type WatchPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function WatchPage({ params }: WatchPageProps) {
  const { sessionId } = await params;

  return <WatchScreen sessionId={sessionId} />;
}
