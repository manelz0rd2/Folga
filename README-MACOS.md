# Folga 0.1.8 para macOS — pacote de teste

O instalador equivalente ao MSI do Windows é o arquivo `.dmg`. Ele precisa ser compilado em um Mac porque contém binários nativos e um pacote `.app` específico do sistema. Este pacote gera uma versão nativa para a arquitetura do Mac usado no teste (Apple Silicon ou Intel).

## Build local no Mac

Requisitos: macOS 13 ou mais recente, Xcode Command Line Tools, Node.js 22, pnpm 10 e Rust estável.

No Terminal, os requisitos podem ser preparados assim:

```bash
xcode-select --install
# Instale o Node.js 22 pelo site nodejs.org ou pelo Homebrew.
corepack enable
corepack prepare pnpm@10.18.1 --activate
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Feche e reabra o Terminal depois de instalar o Rust.

1. Descompacte o pacote do Folga.
2. No Finder, abra `scripts`.
3. Clique com o botão direito em `build-macos.command` e escolha **Abrir**.
4. O script instala as dependências do projeto, executa os testes e gera o aplicativo.
5. Ao terminar, o Finder abrirá a pasta que contém o `.dmg`.

Se o macOS não considerar o script executável, rode uma vez no Terminal:

```bash
chmod +x scripts/build-macos.command
./scripts/build-macos.command
```

## Instalar e abrir o teste

1. Abra o `.dmg` gerado e arraste **Folga** para **Aplicativos**.
2. Na primeira execução, clique com o botão direito em **Folga** e escolha **Abrir**.
3. Se o macOS bloquear o aplicativo, abra **Ajustes do Sistema > Privacidade e Segurança** e use **Abrir Mesmo Assim**.

O aplicativo ainda não possui assinatura e notarização da Apple. Esse aviso é esperado neste pacote de teste e não indica falha na compilação.

Para enviar feedback, use `emanuel.pereira.fraga@gmail.com` e informe o modelo do Mac, a versão do macOS e se o processador é Apple Silicon ou Intel.

## Build pelo GitHub

O workflow `Gerar Folga para macOS` testa o projeto em um runner macOS 14 e publica o `.dmg` como artefato. Depois de enviar o projeto ao GitHub, abra **Actions**, escolha o workflow e use **Run workflow**.

O workflow não é executado automaticamente por tags. Ele permanecerá manual até a versão Mac ser aprovada para publicação.
