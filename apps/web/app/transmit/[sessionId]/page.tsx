import { TransmitScreen } from "./transmit-screen";

type TransmitPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function TransmitPage({ params }: TransmitPageProps) {
  const { sessionId } = await params;

  return <TransmitScreen sessionId={sessionId} />;
}
