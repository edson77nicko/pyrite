import type { Note, LinkEdge } from '../types'

const STORAGE_KEY = 'pyrite_vault_notes'
const FOLDERS_KEY = 'pyrite_vault_folders'

export const INITIAL_NOTES: Note[] = [
  {
    id: 'note-welcome',
    title: 'Bem-vindo ao Pyrite',
    folder: 'Início',
    tags: ['boas-vindas', 'pyrite', 'segundo-cérebro'],
    createdAt: Date.now() - 3600000 * 24,
    updatedAt: Date.now() - 3600000 * 12,
    content: `# Bem-vindo ao Pyrite 💎

O **Pyrite** é o seu segundo cérebro digital de alta performance, inspirado na filosofia **local-first** do [[Arquitetura do Obsidian]], mas com melhorias modernas:

- 🕸️ **[[Grafos de Conhecimento]]**: Visualização interativa e fluida em 2D dos seus pensamentos.
- 🔗 **Links Bidirecionais**: Conecte ideias digitando \`[[Nome da Nota]]\`.
- 🎨 **[[Canvas e Pensamento Visual]]**: Quadro infinito para organizar notas e diagramas.
- 🤖 **[[Produtividade com IA]]**: Descoberta semântica automática de conexões entre suas notas.
- 🔒 **Totalmente Privado**: Suas notas pertencem a você no seu computador.

> [!TIP]
> Pressione \`Ctrl + P\` ou \`Ctrl + O\` a qualquer momento para abrir a **Paleta de Comandos** e o **Alternador Rápido**!

## Primeiros Passos

1. Clique nos links com colchetes duplos (como [[Grafos de Conhecimento]]) para navegar instantaneamente.
2. Experimente o botão **Grafo** no topo para ver a teia visual de notas.
3. Use o botão **Assistente IA** à direita para resumir notas e descobrir conexões automáticas.
4. Crie novas notas e organize em pastas na barra lateral esquerda!

---
*Pyrite — Feito com paixão pela engenharia de software e gestão do conhecimento.*
`
  },
  {
    id: 'note-obsidian-re',
    title: 'Arquitetura do Obsidian',
    folder: 'Engenharia',
    tags: ['engenharia-reversa', 'obsidian', 'arquitetura'],
    createdAt: Date.now() - 3600000 * 20,
    updatedAt: Date.now() - 3600000 * 5,
    content: `# Arquitetura do Obsidian (Engenharia Reversa) 🔍

Realizamos uma análise profunda do Obsidian (versão 1.12.7) utilizando o REA no Windows.

### Componentes Chave Descobertos:

1. **Camada Nativa & Bridge (\`app.asar\`)**:
   - Usa Electron com \`@electron/remote\`.
   - Módulo nativo C++ \`btime\` para leitura exata de carimbos de tempo no NTFS.
   - Módulo \`get-fonts\` para enumeração de fontes do sistema.

2. **Núcleo da Aplicação (\`obsidian.asar\`)**:
   - **Editor**: Construído sobre o **CodeMirror 6**, com parser extensível de Markdown.
   - **Visualização de Grafo**: Utiliza o motor **PixiJS** (\`lib/pixi.min.js\`) com aceleração WebGL 2D para renderização das partículas e forças.
   - **Links Bidirecionais**: Indexador de \`[[wikilinks]]\` e tags mantido em cache de metadados em memória.
   - **PDFs e Apresentações**: Integração de PDF.js e Reveal.js.

> [!NOTE]
> No Pyrite, elevamos este conceito para a Web e Desktop leve: criamos um motor de grafo com física vetorial contínua e integrador semântico de [[Produtividade com IA]].
`
  },
  {
    id: 'note-knowledge-graph',
    title: 'Grafos de Conhecimento',
    folder: 'Metodologia',
    tags: ['zettelkasten', 'segundo-cérebro', 'grafos'],
    createdAt: Date.now() - 3600000 * 18,
    updatedAt: Date.now() - 3600000 * 4,
    content: `# Grafos de Conhecimento e Zettelkasten 🧠

A forma tradicional de organizar informações em pastas hierárquicas é rígida e não reflete como o cérebro humano pensa por associação.

Ao usar [[Links Bidirecionais]], cada nota se torna um nó em uma rede viva interconectada:

- **Densidade de Conexão**: Nós com mais links representam conceitos centrais (Hubs).
- **Descoberta Serena (Serendipidade)**: Você redescobre ideias antigas ao navegar pelas arestas do grafo.
- **Backlinks Automáticos**: Sempre que você menciona uma nota, a nota de destino passa a saber quem a referenciou.

> [!IMPORTANT]
> Veja o grafo em tempo real clicando na aba **Grafo** ou pressionando no ícone de rede no cabeçalho.
`
  },
  {
    id: 'note-visual-canvas',
    title: 'Canvas e Pensamento Visual',
    folder: 'Criatividade',
    tags: ['canvas', 'visual', 'brainstorming'],
    createdAt: Date.now() - 3600000 * 15,
    updatedAt: Date.now() - 3600000 * 2,
    content: `# Canvas e Pensamento Visual 🎨

Nem todas as ideias cabem em uma página linear de texto. O **Canvas do Pyrite** permite espacializar pensamentos em um plano 2D infinito.

### Recursos:
- 📌 Criar cartões coloridos para diferentes categorias de ideias.
- ⚡ Conectar nós com setas direcionadas de causa e efeito.
- 🔀 Integrar notas do [[Bem-vindo ao Pyrite]] diretamente no quadro.
- 🔍 Zoom e pan livres para visão macro ou detalhada.
`
  },
  {
    id: 'note-ai-productivity',
    title: 'Produtividade com IA',
    folder: 'Inovação',
    tags: ['ia', 'produtividade', 'semântica'],
    createdAt: Date.now() - 3600000 * 10,
    updatedAt: Date.now() - 3600000 * 1,
    content: `# Produtividade com IA no Pyrite 🤖

O Obsidian tradicional depende de você criar todos os links manualmente. No Pyrite, introduzimos o conceito de **Conexões Semânticas Sugeridas**:

1. **Auto-Resumo**: O assistente gera uma síntese executiva de notas extensas.
2. **Sugestão de Tags**: Detecta termos recorrentes e categorias conceituais.
3. **Descoberta de Conexões Ocultas**: Analisa a similaridade de conteúdo entre notas que ainda não possuem um \`[[link]]\` explícito e sugere a conexão!
4. **Pergunte ao seu Vault**: Converse diretamente com a sua base de conhecimento.

> [!TIP]
> Experimente abrir o painel lateral de IA à direita e clique em "Descobrir Conexões"!
`
  },
  {
    id: 'note-quiz-checklist',
    title: 'Checklist do Quiz',
    folder: 'Quizzes',
    tags: ['quiz', 'marketing', 'checklist'],
    createdAt: Date.now() - 3600000 * 2,
    updatedAt: Date.now() - 3600000 * 1,
    content: `# Checklist do Quiz

## Antes de criar
- [ ] Modelei o quiz de pelo menos 2 top ofertas do nicho
- [ ] Defini o número de etapas (mínimo 30)
- [ ] Defini os tipos de perguntas (SPIN)
- [ ] Planejei os breaks e onde eles entram
- [ ] Definida a tela de loading e diagnóstico personalizado

## Etapa 1
- [ ] Headline com promessa direta ou diagnóstico
- [ ] Imagem relevante (before/after, expert ou produto)
- [ ] Botão posicionado como valor
- [ ] Escassez presente
- [ ] Tudo acima do fold

## Rastreamento & Conversão
- Início e conclusão de checkout (e-commerce).
- Visualização de página de obrigado (thank you page).
- [ ] Ativar **Google Signals** para análise de audiência cross-device.
- [ ] Configurar **relatório de funil** (Exploration → Funnel) para mapear o caminho do usuário até a conversão.
- [ ] Verificar que **dados pessoais não são enviados** para o GA4 (e-mails, CPFs, nomes em URLs ou parâmetros — violação da LGPD e dos Termos do Google).

## Tabela de Métricas do Funil
| Etapa do Funil | Métrica Chave | Meta Mínima | Status Atual |
| --- | --- | --- | --- |
| Topo de Funil | Taxa de Cliques (CTR) | > 3.5% | No Alvo |
| Meio de Funil | Taxa de Resposta | > 65% | Em Análise |
| Fundo de Funil | Conversão de Vendas | > 4.2% | Otimizando |

## Perguntas
- [ ] Pergunta 1: Segmentação de perfil
- [ ] Pergunta 2: Identificação do problema principal
- [ ] Pergunta 3: Tentativas anteriores e frustrações
`
  }
]

export const INITIAL_FOLDERS = ['Início', 'Engenharia', 'Metodologia', 'Criatividade', 'Inovação', 'Quizzes']

export function loadNotes(): Note[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed: Note[] = JSON.parse(saved)
      const quizIndex = parsed.findIndex(n => n.id === 'note-quiz-checklist')
      const targetQuiz = INITIAL_NOTES.find(n => n.id === 'note-quiz-checklist')!
      if (quizIndex === -1) {
        const merged = [targetQuiz, ...parsed]
        saveNotes(merged)
        return merged
      } else if (!parsed[quizIndex].content.includes('Tabela de Métricas')) {
        parsed[quizIndex] = targetQuiz
        saveNotes(parsed)
        return parsed
      }
      return parsed
    }
  } catch (err) {
    console.error('Failed to load notes from localStorage', err)
  }
  saveNotes(INITIAL_NOTES)
  return INITIAL_NOTES
}

export function saveNotes(notes: Note[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  } catch (err) {
    console.error('Failed to save notes to localStorage', err)
  }
}

export function loadFolders(): string[] {
  try {
    const saved = localStorage.getItem(FOLDERS_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (err) {
    console.error('Failed to load folders from localStorage', err)
  }
  saveFolders(INITIAL_FOLDERS)
  return INITIAL_FOLDERS
}

export function saveFolders(folders: string[]): void {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
  } catch (err) {
    console.error('Failed to save folders to localStorage', err)
  }
}

/**
 * Extrai todos os wikilinks [[Nome da Nota]] ou [[Nome da Nota|Alias]] de um texto
 */
export function extractWikiLinks(content: string): string[] {
  const matches = content.matchAll(/\[\[(.*?)\]\]/g)
  const links: string[] = []
  for (const match of matches) {
    const full = match[1]
    const target = full.split('|')[0].split('#')[0].trim()
    if (target && !links.includes(target)) {
      links.push(target)
    }
  }
  return links
}

/**
 * Extrai tags #exemplo do texto
 */
export function extractTags(content: string): string[] {
  const matches = content.matchAll(/(?:^|\s)#([a-zA-Z0-9_\u00C0-\u017F-]+)/g)
  const tags: string[] = []
  for (const match of matches) {
    const tag = match[1].toLowerCase()
    if (!tags.includes(tag)) {
      tags.push(tag)
    }
  }
  return tags
}

/**
 * Constrói a lista de arestas para o Grafo de Conhecimento
 */
export function buildGraphEdges(notes: Note[]): LinkEdge[] {
  const edges: LinkEdge[] = []
  const titleToId = new Map<string, string>()

  for (const n of notes) {
    titleToId.set(n.title.toLowerCase().trim(), n.id)
  }

  for (const note of notes) {
    const targets = extractWikiLinks(note.content)
    for (const targetTitle of targets) {
      const targetId = titleToId.get(targetTitle.toLowerCase().trim())
      if (targetId && targetId !== note.id) {
        const edgeExists = edges.some(
          e => (e.source === note.id && e.target === targetId) ||
               (e.source === targetId && e.target === note.id)
        )
        if (!edgeExists) {
          edges.push({ source: note.id, target: targetId })
        }
      }
    }
  }
  return edges
}

/**
 * Encontra backlinks: quais notas apontam para a nota atual
 */
export function getBacklinks(currentNote: Note, allNotes: Note[]): Note[] {
  const currentTitle = currentNote.title.toLowerCase().trim()
  return allNotes.filter(n => {
    if (n.id === currentNote.id) return false
    const targets = extractWikiLinks(n.content)
    return targets.some(t => t.toLowerCase().trim() === currentTitle)
  })
}

/**
 * Encontra outgoing links: para quais notas a nota atual aponta
 */
export function getOutgoingLinks(currentNote: Note, allNotes: Note[]): { title: string; note?: Note }[] {
  const targets = extractWikiLinks(currentNote.content)
  return targets.map(title => {
    const found = allNotes.find(n => n.title.toLowerCase().trim() === title.toLowerCase().trim())
    return { title, note: found }
  })
}
