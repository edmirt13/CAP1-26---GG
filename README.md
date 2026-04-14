# Gestão e Governança no COMAER

Aplicação web estática para estudo e avaliação sobre:

- Governança Pública
- Solução de Problemas em Equipe
- SPGIA
- Conceitos de Administração Pública
- Atos Normativos Internos
- Noções Básicas de Licitações e Contratos
- Estudo Técnico Preliminar

O sistema agora inclui:

- quizzes por disciplina e por nível
- `Prova 1`, mais equilibrada para revisão geral
- `Prova 2`, mais interpretativa, com maior peso em casos práticos, contexto FAB e associação de conceitos
- questões em múltipla escolha, análise de assertivas, relação entre colunas e casos práticos

## Estrutura

- `index.html`
- `assets/css/style.css`
- `assets/js/script.js`
- `assets/data/questions.json`

## Como usar localmente

Como o aplicativo carrega o banco de questões por `fetch`, o ideal é executar com um servidor local simples.

### Opção com Python

```powershell
cd "D:\Aplicativos\Gestão e Governança"
python -m http.server 8080
```

Depois, abra:

```text
http://localhost:8080
```

## Publicação no GitHub Pages

1. Suba os arquivos para um repositório GitHub.
2. Mantenha `index.html` na raiz do projeto.
3. Em `Settings > Pages`, escolha a branch principal e a pasta `/root`.
4. Aguarde a geração do link público.

## Observações

- O progresso fica salvo no `localStorage` do navegador.
- A primeira versão usa banco de questões estático em JSON para facilitar manutenção.
- Há duas provas de 80 pontos: uma equilibrada e outra mais exigente em interpretação.
- As referências normativas podem exigir revisão humana periódica, principalmente em temas de licitações, integridade e orçamento.
