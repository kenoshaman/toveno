import { streamSessionStatuses } from "@discord-screen/shared";

export default function HomePage() {
  return (
    <main className="app-shell home">
      <section className="intro">
        <p className="eyebrow">Discord Screen</p>
        <h1>Painel local</h1>
        <p>
          Use o comando /tela no Discord para criar uma sessão e abrir os links
          de transmissor ou espectador.
        </p>
        <dl>
          <div>
            <dt>Status de sessão</dt>
            <dd>{streamSessionStatuses.join(", ")}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
