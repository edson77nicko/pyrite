# 💎 Pyrite — Segundo Cérebro & Base de Conhecimento em Grafo

> **Pyrite** é uma aplicação moderna de gestão de conhecimento pessoal (PKM) e segundo cérebro, inspirada na filosofia **local-first** do **Obsidian**, com suporte a **Links Bidirecionais (`[[wikilinks]]`)**, **Grafo Interativo de Conhecimento em 2D**, **Canvas Visual Infinito**, e **Assistente de IA Integrado**.

---

## 🚀 Como Iniciar

No diretório do projeto:

```bash
cd "D:\02 - App Code\Pyrite"
npm run dev
```

Abra no navegador em `http://localhost:5173`.

---

## 🧠 Recursos Principais

### 1. 🔗 Links Bidirecionais e Auto-complete
- Digite `[[` dentro do editor Markdown para autocompletar qualquer nota existente no Vault.
- Resolução dinâmica de links: clicar em um link `[[Nota]]` abre a nota existente ou cria uma nova nota automaticamente.
- Backlinks automáticos: saiba instantaneamente quem referencia a nota atual.

### 2. 🕸️ Visualização em Grafo (Graph View)
- Simulação de forças físicas em tempo real (repulsão, atração por links elásticos, gravidade central).
- O tamanho dos nós cresce proporcionalmente ao número de conexões (grau do nó).
- Destaque ao passar o mouse: ilumina os nós e arestas conectados e escurece os demais.
- Busca e filtragem por tags e pastas diretamente no grafo.
- Arraste nós livremente para esculpir o mapa mental da sua mente.

### 3. 📝 Editor Markdown de Alta Fidelidade (Live Preview & Split)
- Alternância entre **Modo Código**, **Modo Dividido (Live Preview)** e **Modo Leitura**.
- Suporte a Callouts / Admonitions no estilo Obsidian:
  - `> [!NOTE]`
  - `> [!TIP]`
  - `> [!WARNING]`
  - `> [!IMPORTANT]`
- Listas de tarefas interativas com caixas clicáveis (`- [ ]` e `- [x]`).
- Blocos de código com botão de cópia com 1 clique.
- Contagem em tempo real de palavras, caracteres e tempo de leitura.

### 4. 🎨 Canvas Visual Infinito (Quadro de Ideias)
- Plano 2D com zoom e pan livre.
- Crie cartões de texto com paletas de cores customizadas.
- Conecte nós e cartões com setas direcionadas e legendas.

### 5. 🤖 Pyrite AI Copilot (Inovação sobre o Obsidian)
- **Conexões Ocultas**: O assistente escaneia semântica e palavras-chave de todo o Vault para sugerir notas que deveriam estar conectadas, com link em 1 clique!
- **Auto-Resumo (TL;DR)**: Gera sínteses instantâneas de notas longas.
- **Sugestor de Tags**: Sugere categorizações `#tags` inteligentes.
- **Chat com o Vault**: Converse e faça perguntas sobre o conteúdo das suas notas.

### 6. 📂 Local-First & Compatibilidade com Sistema de Arquivos
- Suporte nativo à **File System Access API**: abra qualquer pasta real do seu computador e edite arquivos `.md` diretamente.
- Backup e exportação do Vault completo em JSON com 1 clique.
- Armazenamento em cache local ultrarrápido (funciona 100% offline).

---

## 🔬 Aprendizados da Engenharia Reversa do Obsidian (v1.12.7)

Durante a análise técnica do Obsidian local com o REA:
- Identificamos o uso de **PixiJS** para o grafo de forças e **CodeMirror 6** para o editor.
- O formato de armazenamento é estritamente texto puro (`.md`), garantindo soberania total dos dados.
- O Pyrite adota a mesma soberania de dados, eliminando o overhead do Electron ao rodar diretamente na Web com física vetorizada suave e IA integrada.
