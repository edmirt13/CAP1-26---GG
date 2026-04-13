const STORAGE_KEY = "gg-comaer-study-progress-v1";
const DATA_PATH = "./assets/data/questions.json";

const state = {
  data: null,
  view: "loading",
  selectedDisciplineId: null,
  selectedLevel: "all",
  session: null,
  reviewQuestions: [],
  error: null,
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindTopbar();
  await loadData();
}

function bindTopbar() {
  document.getElementById("brand-home").addEventListener("click", () => navigate("home"));
  document.getElementById("go-home").addEventListener("click", () => navigate("home"));
  document.getElementById("go-disciplines").addEventListener("click", () => navigate("disciplines"));
  document.getElementById("go-final-exam").addEventListener("click", () => startFinalExam());
}

async function loadData() {
  try {
    const response = await fetch(DATA_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar o arquivo de questões (${response.status}).`);
    }
    state.data = await response.json();
    state.view = "home";
    render();
  } catch (error) {
    state.error = error;
    state.view = "error";
    render();
  }
}

function navigate(view) {
  state.view = view;
  if (view === "home") {
    state.selectedDisciplineId = null;
    state.selectedLevel = "all";
  }
  render();
}

function getProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed || { questionStats: {}, sessions: [] };
  } catch (error) {
    return { questionStats: {}, sessions: [] };
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function registerAnswer(question, isCorrect, mode) {
  const progress = getProgress();
  const existing = progress.questionStats[question.id] || {
    attempts: 0,
    correct: 0,
    discipline: question.disciplina,
    level: question.nivel,
  };

  existing.attempts += 1;
  if (isCorrect) {
    existing.correct += 1;
  }

  progress.questionStats[question.id] = existing;
  progress.lastInteraction = new Date().toISOString();
  progress.lastMode = mode;
  saveProgress(progress);
}

function registerSessionSummary(session) {
  const progress = getProgress();
  const history = progress.sessions || [];
  history.unshift({
    id: crypto.randomUUID(),
    title: session.title,
    mode: session.mode,
    score: session.score,
    maxScore: session.maxScore,
    correctCount: getCorrectCount(session),
    wrongCount: getWrongQuestions(session).length,
    startedAt: session.startedAt,
    finishedAt: new Date().toISOString(),
  });
  progress.sessions = history.slice(0, 20);
  saveProgress(progress);
}

function getDisciplines() {
  return state.data.disciplines;
}

function getDisciplineById(id) {
  return getDisciplines().find((discipline) => discipline.id === id);
}

function getQuestionsByDisciplineId(id) {
  const discipline = getDisciplineById(id);
  if (!discipline) {
    return [];
  }
  return state.data.questions.filter((question) => question.disciplina === discipline.nome);
}

function getQuestionsByFilter(id, level) {
  const questions = getQuestionsByDisciplineId(id);
  if (level === "all") {
    return questions;
  }
  return questions.filter((question) => question.nivel === level);
}

function getOverviewStats() {
  const progress = getProgress();
  const allQuestions = state.data.questions;
  const attemptedIds = Object.keys(progress.questionStats);
  const attempted = attemptedIds.length;
  const correctAnswers = attemptedIds.reduce((total, id) => total + (progress.questionStats[id]?.correct || 0), 0);
  const attempts = attemptedIds.reduce((total, id) => total + (progress.questionStats[id]?.attempts || 0), 0);
  const sessions = progress.sessions || [];

  return {
    totalQuestions: allQuestions.length,
    attemptedQuestions: attempted,
    solvedPercentage: allQuestions.length ? Math.round((attempted / allQuestions.length) * 100) : 0,
    accuracy: attempts ? Math.round((correctAnswers / attempts) * 100) : 0,
    sessionsCompleted: sessions.length,
  };
}

function buildDisciplineStats(discipline) {
  const questions = getQuestionsByDisciplineId(discipline.id);
  const progress = getProgress();
  const attempted = questions.filter((question) => progress.questionStats[question.id]).length;

  return {
    total: questions.length,
    attempted,
    easy: questions.filter((question) => question.nivel === "facil").length,
    medium: questions.filter((question) => question.nivel === "medio").length,
    hard: questions.filter((question) => question.nivel === "dificil").length,
  };
}

function getLatestSessions(limit = 4) {
  return (getProgress().sessions || []).slice(0, limit);
}

function startDisciplineFlow(disciplineId, level = "all") {
  const discipline = getDisciplineById(disciplineId);
  const questions = shuffle(getQuestionsByFilter(disciplineId, level));
  if (!discipline || !questions.length) {
    return;
  }

  state.session = buildSession({
    mode: "discipline",
    title: discipline.nome,
    subtitle: level === "all" ? "Todos os níveis" : `Nível ${formatLevel(level)}`,
    questions,
  });
  state.view = "quiz";
  render();
}

function startReviewSession(questions, title = "Revisão das questões erradas") {
  if (!questions.length) {
    return;
  }

  state.session = buildSession({
    mode: "review",
    title,
    subtitle: "Novo ciclo apenas com os itens errados",
    questions: shuffle(questions),
  });
  state.view = "quiz";
  render();
}

function startFinalExam() {
  if (!state.data) {
    return;
  }

  const selectedQuestions = buildFinalExamQuestions();
  state.session = buildSession({
    mode: "final",
    title: "Prova Final",
    subtitle: `${selectedQuestions.length} questões, ${selectedQuestions.reduce((sum, question) => sum + question.pontuacao, 0)} pontos`,
    questions: selectedQuestions,
  });
  state.view = "quiz";
  render();
}

function buildSession({ mode, title, subtitle, questions }) {
  return {
    mode,
    title,
    subtitle,
    questions,
    answers: {},
    currentIndex: 0,
    score: 0,
    maxScore: questions.reduce((sum, question) => sum + question.pontuacao, 0),
    startedAt: new Date().toISOString(),
  };
}

function buildFinalExamQuestions() {
  const blueprint = state.data.settings.finalExamBlueprint;
  const questions = [];

  for (const rule of blueprint.disciplineDistribution) {
    const disciplinePool = state.data.questions.filter((question) => question.disciplina === rule.disciplina);
    const selected = pickBalancedQuestions(disciplinePool, rule.quantidade);
    questions.push(...selected);
  }

  ensureFabContextMinimum(questions, blueprint.fabContextMin || 0);
  ensureContextualizedMinimum(questions, blueprint.contextualizedMin);
  return shuffle(questions).slice(0, blueprint.totalQuestions);
}

function pickBalancedQuestions(pool, quantity) {
  const byLevel = {
    facil: shuffle(pool.filter((question) => question.nivel === "facil")),
    medio: shuffle(pool.filter((question) => question.nivel === "medio")),
    dificil: shuffle(pool.filter((question) => question.nivel === "dificil")),
  };

  const targets = distributeByLevel(quantity);
  const selected = [];

  for (const [level, count] of Object.entries(targets)) {
    for (let index = 0; index < count; index += 1) {
      const question = byLevel[level].shift();
      if (question) {
        selected.push(question);
      }
    }
  }

  const fallback = shuffle([
    ...byLevel.facil,
    ...byLevel.medio,
    ...byLevel.dificil,
  ]);

  while (selected.length < quantity && fallback.length) {
    selected.push(fallback.shift());
  }

  return selected;
}

function distributeByLevel(quantity) {
  const easy = Math.ceil(quantity * 0.35);
  const medium = Math.ceil(quantity * 0.35);
  const hard = quantity - easy - medium;
  return { facil: easy, medio: medium, dificil: hard };
}

function ensureContextualizedMinimum(questions, minimum) {
  const current = questions.filter((question) => question.contextualizada).length;
  if (current >= minimum) {
    return;
  }

  const selectedIds = new Set(questions.map((question) => question.id));
  const remaining = shuffle(
    state.data.questions.filter((question) => question.contextualizada && !selectedIds.has(question.id))
  );

  let missing = minimum - current;
  while (missing > 0 && remaining.length) {
    const candidate = remaining.shift();
    const replaceIndex = questions.findIndex((question) => !question.contextualizada && question.disciplina === candidate.disciplina);
    const safeIndex = replaceIndex >= 0 ? replaceIndex : questions.findIndex((question) => !question.contextualizada);
    if (safeIndex >= 0) {
      questions.splice(safeIndex, 1, candidate);
      missing -= 1;
    } else {
      break;
    }
  }
}

function ensureFabContextMinimum(questions, minimum) {
  if (!minimum) {
    return;
  }

  const current = questions.filter((question) => question.contextualizada && question.contexto_fab).length;
  if (current >= minimum) {
    return;
  }

  const selectedIds = new Set(questions.map((question) => question.id));
  const remaining = shuffle(
    state.data.questions.filter(
      (question) => question.contextualizada && question.contexto_fab && !selectedIds.has(question.id)
    )
  );

  let missing = minimum - current;
  while (missing > 0 && remaining.length) {
    const candidate = remaining.shift();
    const replaceIndex = questions.findIndex(
      (question) => (!question.contexto_fab || !question.contextualizada) && question.disciplina === candidate.disciplina
    );
    const safeIndex =
      replaceIndex >= 0
        ? replaceIndex
        : questions.findIndex((question) => !question.contexto_fab || !question.contextualizada);

    if (safeIndex >= 0) {
      questions.splice(safeIndex, 1, candidate);
      missing -= 1;
    } else {
      break;
    }
  }
}

function getCurrentQuestion() {
  return state.session?.questions[state.session.currentIndex] || null;
}

function answerCurrentQuestion(optionKey) {
  const session = state.session;
  const question = getCurrentQuestion();
  if (!session || !question || session.answers[question.id]) {
    return;
  }

  const isCorrect = optionKey === question.resposta_correta;
  session.answers[question.id] = {
    selected: optionKey,
    correct: question.resposta_correta,
    isCorrect,
  };
  if (isCorrect) {
    session.score += question.pontuacao;
  }

  registerAnswer(question, isCorrect, session.mode);
  render();
}

function nextQuestion() {
  const session = state.session;
  if (!session) {
    return;
  }

  if (session.currentIndex < session.questions.length - 1) {
    session.currentIndex += 1;
    render();
    return;
  }

  registerSessionSummary(session);
  state.view = "result";
  render();
}

function restartCurrentMode() {
  if (!state.session) {
    navigate("home");
    return;
  }

  const questions = state.session.questions.map((question) => ({ ...question }));
  state.session = buildSession({
    mode: state.session.mode,
    title: state.session.title,
    subtitle: state.session.subtitle,
    questions: shuffle(questions),
  });
  state.view = "quiz";
  render();
}

function getCorrectCount(session) {
  return Object.values(session.answers).filter((answer) => answer.isCorrect).length;
}

function getWrongQuestions(session) {
  return session.questions.filter((question) => session.answers[question.id] && !session.answers[question.id].isCorrect);
}

function formatLevel(level) {
  return {
    facil: "Fácil",
    medio: "Médio",
    dificil: "Difícil",
    all: "Todos",
  }[level] || level;
}

function formatPriority(value) {
  return value ? "Prioritária" : "Cobertura complementar";
}

function percentage(value, total) {
  if (!total) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function shuffle(items) {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[target]] = [cloned[target], cloned[index]];
  }
  return cloned;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function render() {
  const app = document.getElementById("app");

  switch (state.view) {
    case "error":
      app.innerHTML = renderErrorView();
      break;
    case "disciplines":
      app.innerHTML = renderDisciplinesView();
      attachDisciplineEvents();
      break;
    case "discipline-config":
      app.innerHTML = renderDisciplineConfigView();
      attachDisciplineConfigEvents();
      break;
    case "quiz":
      app.innerHTML = renderQuizView();
      attachQuizEvents();
      break;
    case "result":
      app.innerHTML = renderResultView();
      attachResultEvents();
      break;
    case "review":
      app.innerHTML = renderReviewView();
      attachReviewEvents();
      break;
    case "home":
    default:
      app.innerHTML = renderHomeView();
      attachHomeEvents();
      break;
  }
}

function renderHomeView() {
  const stats = getOverviewStats();
  const sessions = getLatestSessions();
  const disciplines = getDisciplines();

  return `
    <section class="panel hero">
      <div class="hero-copy">
        <span class="eyebrow">Estudo, revisão e avaliação</span>
        <h1>Base unificada para gestão e governança no contexto do COMAER.</h1>
        <p>
          Estude por disciplina, escolha níveis de dificuldade, acompanhe sua evolução e faça uma prova final de
          <strong class="result-highlight">${state.data.settings.finalExamBlueprint.totalPoints} pontos</strong>
          com maior peso para Governança Pública, SPGIA, Administração Pública e Licitações.
        </p>
        <div class="hero-actions">
          <button class="primary-button" data-action="open-disciplines" type="button">Explorar disciplinas</button>
          <button class="secondary-button" data-action="start-final" type="button">Iniciar prova final</button>
        </div>
      </div>

      <div class="hero-summary">
        <div class="summary-card">
          <span class="metric-label">Questões no banco inicial</span>
          <span class="metric-value">${stats.totalQuestions}</span>
        </div>
        <div class="summary-card">
          <span class="metric-label">Questões já vistas</span>
          <span class="metric-value">${stats.attemptedQuestions}</span>
        </div>
        <div class="summary-card">
          <span class="metric-label">Cobertura do banco</span>
          <span class="metric-value">${stats.solvedPercentage}%</span>
        </div>
        <div class="summary-card">
          <span class="metric-label">Taxa de acerto acumulada</span>
          <span class="metric-value">${stats.accuracy}%</span>
        </div>
      </div>
    </section>

    <section class="view panel">
      <div class="view-header">
        <div>
          <span class="eyebrow">Disciplinas</span>
          <h1>Trilhas de estudo</h1>
          <p>Cada disciplina traz filtros por nível, explicações curtas e referência de origem do conteúdo.</p>
        </div>
        <div class="section-actions">
          <button class="outline-button" data-action="open-disciplines" type="button">Ver todas</button>
        </div>
      </div>

      <div class="discipline-grid">
        ${disciplines
          .map((discipline) => {
            const info = buildDisciplineStats(discipline);
            return `
              <article class="discipline-card">
                <div class="discipline-meta">
                  <span class="discipline-badge ${discipline.prioritaria ? "priority" : ""}">
                    ${formatPriority(discipline.prioritaria)}
                  </span>
                  <span class="chip">${info.total} questões</span>
                </div>
                <div>
                  <h2>${discipline.nome}</h2>
                  <p class="discipline-description">${discipline.descricao}</p>
                </div>
                <div class="stats-grid">
                  <div class="stat-card summary-card">
                    <span class="metric-label">Fácil</span>
                    <span class="metric-value">${info.easy}</span>
                  </div>
                  <div class="stat-card summary-card">
                    <span class="metric-label">Médio</span>
                    <span class="metric-value">${info.medium}</span>
                  </div>
                  <div class="stat-card summary-card">
                    <span class="metric-label">Difícil</span>
                    <span class="metric-value">${info.hard}</span>
                  </div>
                </div>
                <div class="inline-actions">
                  <button class="secondary-button" data-discipline="${discipline.id}" type="button">Abrir disciplina</button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>

    <section class="view panel">
      <div class="view-header">
        <div>
          <span class="eyebrow">Progresso recente</span>
          <h1>Últimas sessões</h1>
          <p>O progresso fica salvo apenas no navegador, sem exigir login.</p>
        </div>
      </div>
      ${
        sessions.length
          ? `
            <div class="result-list">
              ${sessions
                .map(
                  (session) => `
                    <div class="result-item">
                      <strong>${session.title}</strong>
                      <div class="result-meta">
                        <span class="chip">${session.mode === "final" ? "Prova final" : session.mode === "review" ? "Refazer erradas" : "Quiz por disciplina"}</span>
                        <span class="chip">${session.score}/${session.maxScore} pontos</span>
                        <span class="chip">${session.correctCount} acertos</span>
                        <span class="chip">${new Date(session.finishedAt).toLocaleString("pt-BR")}</span>
                      </div>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : `
            <div class="empty-state">
              <h2>Nenhuma sessão concluída ainda</h2>
              <p>Assim que você finalizar um quiz ou uma prova final, o resumo aparecerá aqui.</p>
            </div>
          `
      }
    </section>
  `;
}

function renderDisciplinesView() {
  const disciplines = getDisciplines();
  return `
    <section class="view panel">
      <div class="view-header">
        <div>
          <span class="eyebrow">Mapa de estudo</span>
          <h1>Selecione uma disciplina</h1>
          <p>As disciplinas prioritárias receberam banco maior de questões para estudo recorrente e uso intensivo na prova final.</p>
        </div>
        <div class="section-actions">
          <button class="ghost-button" data-action="go-home" type="button">Voltar</button>
        </div>
      </div>

      <div class="discipline-grid">
        ${disciplines
          .map((discipline) => {
            const stats = buildDisciplineStats(discipline);
            return `
              <article class="discipline-card">
                <div class="discipline-meta">
                  <span class="discipline-badge ${discipline.prioritaria ? "priority" : ""}">
                    ${formatPriority(discipline.prioritaria)}
                  </span>
                  <span class="chip">${stats.attempted}/${stats.total} vistas</span>
                </div>
                <div>
                  <h2>${discipline.nome}</h2>
                  <p class="discipline-description">${discipline.descricao}</p>
                </div>
                <div class="question-meta">
                  ${discipline.subtemas.slice(0, 4).map((subtema) => `<span class="chip">${subtema}</span>`).join("")}
                </div>
                <div class="kpi-row">
                  <div class="kpi">
                    <span class="metric-label">Fácil</span>
                    <strong>${stats.easy}</strong>
                  </div>
                  <div class="kpi">
                    <span class="metric-label">Médio</span>
                    <strong>${stats.medium}</strong>
                  </div>
                  <div class="kpi">
                    <span class="metric-label">Difícil</span>
                    <strong>${stats.hard}</strong>
                  </div>
                </div>
                <div class="inline-actions">
                  <button class="primary-button" data-discipline="${discipline.id}" type="button">Configurar quiz</button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderDisciplineConfigView() {
  const discipline = getDisciplineById(state.selectedDisciplineId);
  const questions = getQuestionsByDisciplineId(discipline.id);
  const stats = buildDisciplineStats(discipline);

  return `
    <section class="view panel">
      <div class="view-header">
        <div>
          <span class="eyebrow">Configuração do quiz</span>
          <h1>${discipline.nome}</h1>
          <p>${discipline.descricao}</p>
        </div>
        <div class="section-actions">
          <button class="ghost-button" data-action="back-disciplines" type="button">Voltar às disciplinas</button>
        </div>
      </div>

      <div class="config-split">
        <article class="config-card">
          <span class="eyebrow">Nível de dificuldade</span>
          <h2>Escolha como deseja estudar</h2>
          <p class="config-note">Se escolher “todos”, o quiz percorre toda a trilha da disciplina. Cada questão vale 2 pontos.</p>
          <div class="difficulty-group">
            <button class="tag-button ${state.selectedLevel === "all" ? "active" : ""}" data-level="all" type="button">Todos os níveis</button>
            <button class="tag-button ${state.selectedLevel === "facil" ? "active" : ""}" data-level="facil" type="button">Fácil</button>
            <button class="tag-button ${state.selectedLevel === "medio" ? "active" : ""}" data-level="medio" type="button">Médio</button>
            <button class="tag-button ${state.selectedLevel === "dificil" ? "active" : ""}" data-level="dificil" type="button">Difícil</button>
          </div>
          <div class="config-actions" style="margin-top: 18px;">
            <button class="primary-button" data-action="start-discipline" type="button">Iniciar quiz</button>
          </div>
        </article>

        <article class="config-card">
          <span class="eyebrow">Resumo da disciplina</span>
          <h2>Volume e subtemas</h2>
          <div class="kpi-row">
            <div class="kpi">
              <span class="metric-label">Questões</span>
              <strong>${questions.length}</strong>
            </div>
            <div class="kpi">
              <span class="metric-label">Subtemas</span>
              <strong>${discipline.subtemas.length}</strong>
            </div>
            <div class="kpi">
              <span class="metric-label">Prioridade</span>
              <strong>${discipline.prioritaria ? "Alta" : "Normal"}</strong>
            </div>
          </div>
          <div class="question-meta" style="margin-top: 14px;">
            <span class="chip">Fácil: ${stats.easy}</span>
            <span class="chip">Médio: ${stats.medium}</span>
            <span class="chip">Difícil: ${stats.hard}</span>
          </div>
          <div class="question-meta" style="margin-top: 14px;">
            ${discipline.subtemas.map((subtema) => `<span class="chip">${subtema}</span>`).join("")}
          </div>
        </article>
      </div>

      <div class="source-grid">
        ${discipline.fontes.map((fonte) => `<article class="source-card"><h2>${fonte}</h2></article>`).join("")}
      </div>
    </section>
  `;
}

function renderQuizView() {
  const session = state.session;
  const question = getCurrentQuestion();
  const answer = session.answers[question.id];
  const progressValue = percentage(session.currentIndex + (answer ? 1 : 0), session.questions.length);
  const correctOption = question.alternativas[question.resposta_correta];

  return `
    <section class="view panel">
      <div class="view-header">
        <div>
          <span class="eyebrow">${session.mode === "final" ? "Avaliação integrada" : session.mode === "review" ? "Refazer erradas" : "Quiz temático"}</span>
          <h1>${session.title}</h1>
          <p>${session.subtitle}</p>
        </div>
        <div class="section-actions">
          <button class="ghost-button" data-action="home" type="button">Sair</button>
        </div>
      </div>

      <div class="question-layout">
        <article class="question-card">
          <div class="question-meta">
            <span class="chip">${question.disciplina}</span>
            <span class="chip">${formatLevel(question.nivel)}</span>
            <span class="chip">${question.subtema}</span>
            <span class="chip">${question.pontuacao} pontos</span>
            ${question.contextualizada ? '<span class="chip priority">Contextualizada</span>' : ""}
            ${question.contexto_fab ? '<span class="chip priority">Contexto FAB</span>' : ""}
          </div>
          <div class="question-index">Questão ${session.currentIndex + 1} de ${session.questions.length}</div>
          <h2 class="question-title">${escapeHtml(question.enunciado)}</h2>

          <div class="options-grid">
            ${Object.entries(question.alternativas)
              .map(([key, value]) => {
                const isSelected = answer?.selected === key;
                const isCorrect = answer && key === question.resposta_correta;
                const isWrong = answer && isSelected && key !== question.resposta_correta;
                return `
                  <button
                    class="option-button ${isSelected ? "is-selected" : ""} ${isCorrect ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""}"
                    data-option="${key}"
                    type="button"
                    ${answer ? "disabled" : ""}
                  >
                    <span class="option-key">${key}</span>
                    <span>${escapeHtml(value)}</span>
                  </button>
                `;
              })
              .join("")}
          </div>

          ${
            answer
              ? `
                <div class="feedback-box ${answer.isCorrect ? "correct" : "wrong"}">
                  <strong>${answer.isCorrect ? "Resposta correta." : `Resposta incorreta. A alternativa correta é ${question.resposta_correta}.`}</strong>
                  <p class="question-explanation">${escapeHtml(question.explicacao)}</p>
                  <p class="question-explanation"><strong>Referência material:</strong> ${escapeHtml(question.referencia_material)}</p>
                  ${
                    question.referencia_normativa
                      ? `<p class="question-explanation"><strong>Referência normativa:</strong> ${escapeHtml(question.referencia_normativa)}</p>`
                      : ""
                  }
                  ${!answer.isCorrect ? `<p class="question-explanation"><strong>Alternativa correta:</strong> ${escapeHtml(correctOption)}</p>` : ""}
                </div>
              `
              : ""
          }

          <div class="question-actions" style="margin-top: 20px;">
            ${
              answer
                ? `<button class="primary-button" data-action="next-question" type="button">${session.currentIndex === session.questions.length - 1 ? "Finalizar avaliação" : "Próxima questão"}</button>`
                : `<span class="inline-note">Selecione uma alternativa para liberar o avanço.</span>`
            }
          </div>
        </article>

        <aside class="quiz-sidebar">
          <article class="progress-card">
            <span class="metric-label">Andamento</span>
            <div class="progress-bar" style="margin: 10px 0 8px;">
              <div class="progress-fill" style="width: ${progressValue}%"></div>
            </div>
            <p class="meta-copy">${progressValue}% da trilha concluída nesta sessão.</p>
          </article>

          <article class="sidebar-card">
            <span class="metric-label">Pontuação</span>
            <p class="metric-value">${session.score}<small style="font-size: 1rem;">/${session.maxScore}</small></p>
            <p class="meta-copy">Cada questão do banco inicial vale 2 pontos para simplificar o controle e fechar a prova final em 80 pontos.</p>
          </article>

          <article class="sidebar-card">
            <span class="metric-label">Referências</span>
            <p class="meta-copy"><strong>Material:</strong> ${escapeHtml(question.referencia_material)}</p>
            ${
              question.referencia_contexto
                ? `<p class="meta-copy"><strong>Contexto:</strong> ${escapeHtml(question.referencia_contexto)}</p>`
                : ""
            }
            ${
              question.referencia_normativa
                ? `<p class="meta-copy"><strong>Normativa:</strong> ${escapeHtml(question.referencia_normativa)}</p>`
                : ""
            }
          </article>
        </aside>
      </div>
    </section>
  `;
}

function renderResultView() {
  const session = state.session;
  const wrongQuestions = getWrongQuestions(session);
  const correctCount = getCorrectCount(session);
  const accuracy = percentage(correctCount, session.questions.length);

  return `
    <section class="view panel">
      <div class="view-header">
        <div>
          <span class="eyebrow">Resultado</span>
          <h1>${session.title}</h1>
          <p>${session.subtitle}</p>
        </div>
      </div>

      <div class="result-grid">
        <article class="result-card">
          <span class="metric-label">Pontuação</span>
          <div class="result-score">${session.score}<span class="result-highlight">/${session.maxScore}</span></div>
        </article>
        <article class="result-card">
          <span class="metric-label">Acertos</span>
          <div class="result-score" style="font-size: 2.6rem;">${correctCount}</div>
        </article>
        <article class="result-card">
          <span class="metric-label">Erros</span>
          <div class="result-score" style="font-size: 2.6rem;">${wrongQuestions.length}</div>
        </article>
        <article class="result-card">
          <span class="metric-label">Aproveitamento</span>
          <div class="result-score" style="font-size: 2.6rem;">${accuracy}%</div>
        </article>
      </div>

      <article class="result-card">
        <h2>Painel de resultado</h2>
        <div class="result-meta">
          <span class="chip">${session.mode === "final" ? "Prova final" : session.mode === "review" ? "Refazer erradas" : "Quiz por disciplina"}</span>
          <span class="chip">${session.questions.length} questões</span>
          <span class="chip">${new Date().toLocaleString("pt-BR")}</span>
        </div>
        <div class="result-actions" style="margin-top: 16px;">
          ${wrongQuestions.length ? '<button class="secondary-button" data-action="review-errors" type="button">Revisar questões erradas</button>' : ""}
          ${wrongQuestions.length ? '<button class="outline-button" data-action="redo-errors" type="button">Refazer somente as erradas</button>' : ""}
          <button class="ghost-button" data-action="restart-session" type="button">Refazer avaliação inteira</button>
          <button class="primary-button" data-action="go-home" type="button">Voltar ao início</button>
        </div>
      </article>

      <article class="result-card">
        <h2>Questões erradas</h2>
        ${
          wrongQuestions.length
            ? `
              <div class="result-list">
                ${wrongQuestions
                  .map((question) => `
                    <details class="result-item">
                      <summary>${escapeHtml(question.enunciado)}</summary>
                      <p><strong>Resposta correta:</strong> ${question.resposta_correta} - ${escapeHtml(question.alternativas[question.resposta_correta])}</p>
                      <p>${escapeHtml(question.explicacao)}</p>
                      <p><strong>Material:</strong> ${escapeHtml(question.referencia_material)}</p>
                      ${question.referencia_contexto ? `<p><strong>Contexto:</strong> ${escapeHtml(question.referencia_contexto)}</p>` : ""}
                      ${question.referencia_normativa ? `<p><strong>Normativa:</strong> ${escapeHtml(question.referencia_normativa)}</p>` : ""}
                    </details>
                  `)
                  .join("")}
              </div>
            `
            : `
              <div class="empty-state">
                <h2>Sem erros nesta rodada</h2>
                <p>Você concluiu a sessão sem itens incorretos. Vale seguir para outra disciplina ou para a prova final.</p>
              </div>
            `
        }
      </article>
    </section>
  `;
}

function renderReviewView() {
  const wrongQuestions = state.reviewQuestions;
  return `
    <section class="view panel">
      <div class="view-header">
        <div>
          <span class="eyebrow">Revisão guiada</span>
          <h1>Questões erradas da última sessão</h1>
          <p>Revise a resposta correta, a explicação e a origem do conteúdo antes de tentar novamente.</p>
        </div>
        <div class="section-actions">
          <button class="ghost-button" data-action="back-result" type="button">Voltar ao resultado</button>
        </div>
      </div>

      <div class="review-list">
        ${wrongQuestions
          .map(
            (question) => `
              <article class="review-card">
                <div class="review-meta">
                  <span class="chip">${question.disciplina}</span>
                  <span class="chip">${formatLevel(question.nivel)}</span>
                  <span class="chip">${question.subtema}</span>
                </div>
                <h2>${escapeHtml(question.enunciado)}</h2>
                <p><strong>Resposta correta:</strong> ${question.resposta_correta} - ${escapeHtml(question.alternativas[question.resposta_correta])}</p>
                <p>${escapeHtml(question.explicacao)}</p>
                <p><strong>Referência material:</strong> ${escapeHtml(question.referencia_material)}</p>
                ${question.referencia_contexto ? `<p><strong>Contexto:</strong> ${escapeHtml(question.referencia_contexto)}</p>` : ""}
                ${question.referencia_normativa ? `<p><strong>Referência normativa:</strong> ${escapeHtml(question.referencia_normativa)}</p>` : ""}
              </article>
            `
          )
          .join("")}
      </div>

      <div class="review-actions">
        <button class="primary-button" data-action="redo-errors" type="button">Refazer somente as erradas</button>
        <button class="outline-button" data-action="go-home" type="button">Encerrar revisão</button>
      </div>
    </section>
  `;
}

function renderErrorView() {
  return `
    <section class="panel view">
      <div class="empty-state">
        <h2>Não foi possível carregar o banco de questões</h2>
        <p>Se você abriu o arquivo diretamente pelo sistema de arquivos, use um servidor local simples para liberar o carregamento do JSON.</p>
        <p class="status-warn">${escapeHtml(state.error?.message || "Erro desconhecido.")}</p>
        <div class="inline-actions">
          <button class="primary-button" data-action="retry-load" type="button">Tentar novamente</button>
        </div>
      </div>
    </section>
  `;
}

function attachHomeEvents() {
  document.querySelectorAll('[data-action="open-disciplines"]').forEach((button) => {
    button.addEventListener("click", () => navigate("disciplines"));
  });
  document.querySelectorAll('[data-action="start-final"]').forEach((button) => {
    button.addEventListener("click", () => startFinalExam());
  });
  document.querySelectorAll("[data-discipline]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDisciplineId = button.dataset.discipline;
      state.selectedLevel = "all";
      state.view = "discipline-config";
      render();
    });
  });
}

function attachDisciplineEvents() {
  document.querySelector('[data-action="go-home"]')?.addEventListener("click", () => navigate("home"));
  document.querySelectorAll("[data-discipline]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDisciplineId = button.dataset.discipline;
      state.selectedLevel = "all";
      state.view = "discipline-config";
      render();
    });
  });
}

function attachDisciplineConfigEvents() {
  document.querySelector('[data-action="back-disciplines"]')?.addEventListener("click", () => navigate("disciplines"));
  document.querySelector('[data-action="start-discipline"]')?.addEventListener("click", () => {
    startDisciplineFlow(state.selectedDisciplineId, state.selectedLevel);
  });
  document.querySelectorAll("[data-level]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLevel = button.dataset.level;
      render();
    });
  });
}

function attachQuizEvents() {
  document.querySelector('[data-action="home"]')?.addEventListener("click", () => navigate("home"));
  document.querySelector('[data-action="next-question"]')?.addEventListener("click", () => nextQuestion());
  document.querySelectorAll("[data-option]").forEach((button) => {
    button.addEventListener("click", () => answerCurrentQuestion(button.dataset.option));
  });
}

function attachResultEvents() {
  document.querySelector('[data-action="go-home"]')?.addEventListener("click", () => navigate("home"));
  document.querySelector('[data-action="restart-session"]')?.addEventListener("click", () => restartCurrentMode());
  document.querySelector('[data-action="review-errors"]')?.addEventListener("click", () => {
    state.reviewQuestions = getWrongQuestions(state.session);
    state.view = "review";
    render();
  });
  document.querySelector('[data-action="redo-errors"]')?.addEventListener("click", () => {
    const wrongQuestions = getWrongQuestions(state.session);
    startReviewSession(wrongQuestions);
  });
}

function attachReviewEvents() {
  document.querySelector('[data-action="back-result"]')?.addEventListener("click", () => {
    state.view = "result";
    render();
  });
  document.querySelectorAll('[data-action="redo-errors"]').forEach((button) => {
    button.addEventListener("click", () => startReviewSession(state.reviewQuestions));
  });
  document.querySelector('[data-action="go-home"]')?.addEventListener("click", () => navigate("home"));
}

document.addEventListener("click", (event) => {
  const target = event.target.closest('[data-action="retry-load"]');
  if (target) {
    loadData();
  }
});
