export default function DesktopPage() {
  return (
    <main className="app-shell home">
      <section className="intro">
        <p className="eyebrow">ToVeno Desktop</p>
        <h1>Transmissão avançada para Windows</h1>
        <p>
          Instale o app desktop para transmitir jogos e janelas com áudio
          isolado. Quem assiste continua usando o navegador.
        </p>
        <p>
          <a className="button-link" href="/downloads/ToVeno-Setup.exe">
            Baixar instalador
          </a>
        </p>
        <dl>
          <dt>Depois de instalar</dt>
          <dd>
            Volte para a sessão de transmissão no Discord e clique em Abrir
            ToVeno. O Windows vai abrir o app direto na sessão correta.
          </dd>
          <dt>Quando usar</dt>
          <dd>
            Use o Desktop quando quiser capturar jogo ou janela com controle
            melhor de áudio e qualidade.
          </dd>
        </dl>
      </section>
    </main>
  );
}
